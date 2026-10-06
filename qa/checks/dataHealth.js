'use strict';
// DEC-REF-139 — SALUD DE INGESTA (data-health), Capa B del Supervisor de Calidad.
// Detecta fuentes (dId, variable) que DEJARON de reportar para que la Capa C (138, oráculo)
// NO llame "muerta" a una regla cuyo insumo nunca llega: distingue "condición falsa" de
// "device callado" (§7.4 del diseño). READ-ONLY sobre `data`, out-of-band respecto del edge
// (no depende de `_lastSeen`: lo recomputa de la propia telemetría).
//
// Corre en el worker `wanomi-qa` SIN babel → lee `data` por acceso crudo
// (mongoose.connection.db.collection), NO importa el modelo `data` (export default).
// Contrato de auto-descubrimiento (qa/index.js): exporta { layer, name, run } y, por spec,
// además computeSilent({windowH}) → Set de 'dId|variable' callados para el bloque 138.

const mongoose = require('mongoose');
const { upsertFinding } = require('../lib/findings');

// Knobs por env con default NOMBRADO (sin hardcodes; patrón const X = Number(env || default)).
//   QA_STALE_MULT   — múltiplo de la cadencia mediana a partir del cual se considera callada (3×).
//   QA_STALE_MIN_MIN— piso en minutos: nunca callada antes de este gap (evita falsos por cadencia ruidosa).
//   QA_DH_WINDOW_H  — ventana de historia (horas) sobre la que se mide cadencia/último dato.
const QA_STALE_MULT    = Number(process.env.QA_STALE_MULT    || 3);
const QA_STALE_MIN_MIN = Number(process.env.QA_STALE_MIN_MIN || 30);
const QA_DH_WINDOW_H   = Number(process.env.QA_DH_WINDOW_H   || 24);

// SITE_ID del worker como siteCode de respaldo cuando el device no declara `siteId`.
const SITE_ID = process.env.SITE_ID || 'CR00061';

// Agregación en Mongo (no sobre lecturas crudas en memoria §4.4): el filtrado por ventana y
// el agrupamiento por fuente van en el pipeline. Mongo devuelve UNA fila por (dId, variable)
// con el array de `time` ORDENADO (un $sort previo al $group preserva el orden dentro de $push)
// y lastTime. La mediana de inter-arribos se calcula en JS sobre ese array ya reducido por
// fuente (no sobre todas las lecturas) — $setWindowFields/$shift/$median no existen en Mongo 4.4.
// El índice {dId,variable,time:-1} sirve el filtro + el sort.
function buildPipeline(windowStartMs) {
  return [
    // Solo lo necesario: id de la fuente + time. value no interviene en salud de ingesta.
    { $match: { time: { $gte: windowStartMs } } },
    { $project: { _id: 0, dId: 1, variable: 1, time: 1 } },
    // Orden asc por time ANTES del group → $push conserva el orden de inter-arribos.
    { $sort: { dId: 1, variable: 1, time: 1 } },
    {
      $group: {
        _id: { dId: '$dId', variable: '$variable' },
        lastTime: { $max: '$time' },
        count: { $sum: 1 },
        times: { $push: '$time' },
      },
    },
    // ≥2 lecturas (caso raro #1: 1 sola lectura no tiene cadencia → no se evalúa callada).
    { $match: { count: { $gte: 2 } } },
    { $project: { _id: 0, dId: '$_id.dId', variable: '$_id.variable', lastTime: 1, count: 1, times: 1 } },
  ];
}

// Mediana de las diferencias de `time` consecutivos (inter-arribos) de un array YA ordenado asc.
function medianaInterArribos(times) {
  const deltas = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
  deltas.sort((a, b) => a - b);
  const n = deltas.length;
  if (!n) return null;
  return n % 2 ? deltas[(n - 1) / 2] : (deltas[n / 2 - 1] + deltas[n / 2]) / 2;
}

// Núcleo reusado por run() y computeSilent(): agrega en Mongo y decide "callada" por fuente.
// Devuelve { now, pisoMs, fuentes:[{dId,variable,lastTime,cadenciaMs,gapMs,callada}] }.
async function evaluarFuentes(windowH) {
  const db = mongoose.connection.db;
  const ventanaH = Number(windowH || QA_DH_WINDOW_H);
  const now = Date.now();
  const windowStartMs = now - ventanaH * 3600000;
  const pisoMs = QA_STALE_MIN_MIN * 60000; // caso raro #2: piso contra cadencia ruidosa de device nuevo.

  const rows = await db.collection('data').aggregate(buildPipeline(windowStartMs), { allowDiskUse: true }).toArray();

  const fuentes = [];
  for (const r of rows) {
    const cadenciaMs = medianaInterArribos(r.times);
    if (cadenciaMs == null) continue; // sin cadencia (defensa; el pipeline ya exige count≥2)
    const gapMs = now - r.lastTime;
    const umbralMs = Math.max(QA_STALE_MULT * cadenciaMs, pisoMs);
    fuentes.push({
      dId: r.dId,
      variable: r.variable,
      lastTime: r.lastTime,
      cadenciaMs,
      gapMs,
      callada: gapMs > umbralMs,
    });
  }
  return { now, pisoMs, fuentes };
}

// Mapa dId -> siteId (siteCode) desde `devices`, con fallback a SITE_ID del worker.
async function mapaSiteCode() {
  const db = mongoose.connection.db;
  const devs = await db.collection('devices').find({}, { projection: { _id: 0, dId: 1, siteId: 1 } }).toArray();
  const m = new Map();
  for (const d of devs) if (d.dId) m.set(d.dId, d.siteId || SITE_ID);
  return m;
}

// run() — Capa B: escribe un finding INGESTA (soft) por fuente callada y devuelve la cobertura
// que agrega qa/index.js (devicesCovered + findingsWritten). Dedup por corrida: la agregación
// da UNA fila por (dId,variable), así que un upsert por fuente callada no duplica (contrato §4).
async function run() {
  const { fuentes } = await evaluarFuentes(QA_DH_WINDOW_H);
  const site = await mapaSiteCode();

  const devicesCovered = new Set();
  let findingsWritten = 0;

  for (const f of fuentes) {
    devicesCovered.add(f.dId);
    if (!f.callada) continue;
    await upsertFinding({
      type: 'INGESTA',
      severity: 'soft',
      layer: 'B',
      ruleId: null,
      dId: f.dId,
      variable: f.variable,     // en la clave de idempotencia → un finding por (device, variable)
      siteCode: site.get(f.dId) || SITE_ID,
      evidence: {
        variable: f.variable,
        lastSeen: f.lastTime,     // epoch ms del último dato observado para la fuente
        cadenciaMs: f.cadenciaMs, // mediana de inter-arribos en la ventana
        gapMs: f.gapMs,           // cuánto hace que no llega (now - lastSeen)
      },
      suggestedAction: `La fuente ${f.dId}/${f.variable} dejó de reportar (gap ${Math.round(f.gapMs / 60000)} min, cadencia ~${Math.round(f.cadenciaMs / 1000)} s). Verificar conectividad del device o la publicación de la variable.`,
    });
    findingsWritten += 1;
  }

  return {
    check: 'data-health',
    rulesCovered: [],                   // este check no cubre reglas, cubre fuentes de ingesta
    devicesCovered: [...devicesCovered],
    findingsWritten,
  };
}

// computeSilent({windowH}) — para el bloque 138 (oráculo, Capa C): Set de claves 'dId|variable'
// calladas. Permite que 138 NO marque "muerta" una regla cuyo insumo está callado (anti falso-muerto).
// No escribe nada; recomputa de `data` con la misma lógica que run().
async function computeSilent(opts) {
  const windowH = opts && opts.windowH != null ? opts.windowH : QA_DH_WINDOW_H;
  const { fuentes } = await evaluarFuentes(windowH);
  const silent = new Set();
  for (const f of fuentes) if (f.callada) silent.add(`${f.dId}|${f.variable}`);
  return silent;
}

module.exports = { layer: 'B', name: 'data-health', run, computeSilent };
