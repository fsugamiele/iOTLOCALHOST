'use strict';
// spec_supervisor_confiabilidad_v2 (R1) — calcula la foto de CONFIABILIDAD del sitio y la guarda
// en `reliability_snapshots` (Qs4: precalculado; la UI solo lee). Corre en el tick de la Capa B
// pero recalcula solo cada `qa_config.everyMin` (60 min por defecto). READ-ONLY sobre el motor:
// lee notifications / data / devices / sites (acceso crudo, el worker no tiene babel).
// No escribe hallazgos: los veredictos de reglas son R2 y la integridad es R3.

const mongoose = require('mongoose');
const R = require('../lib/reliability');
const QaConfig = require('../../app/api/models/qa_config');
const Snapshot = require('../../app/api/models/reliability_snapshot');

const SITE_ID = process.env.SITE_ID || 'CR00061';
const BUCKET_MS = 5 * 60000;
const PRIOR_LOOKBACK_D = 90;     // aviso abierto antes de la ventana: se busca hasta 90 días atrás
// Mediciones que se publican solo en ciertas condiciones (grupo en marcha, derivadas del motor):
// no cuentan para la completitud del equipo (misma lista que tools/diagnostico_variables_reglas.js).
const INTERMITENTES = ['autonomy_hours', 'autonomy_source', 'autonomy_lph', 'autonomy_liters', 'fuel_efficiency', 'consumption_tank'];

async function loadConfig() {
  const doc = await QaConfig.findById('default').lean();
  const def = new QaConfig({ _id: 'default' }).toObject();
  return { ...def, ...(doc || {}) };
}

// Cobertura de datos (ventanas de 5 min con lectura) por equipo y medición, con caché DIARIA en
// `qa_coverage`: un día cerrado hace más de 2 h no cambia → se agrega una sola vez. Cada corrida
// horaria recorre solo hoy (y lo que falte). Primera corrida: recorre la ventana completa.
const DAY = 86400000;
async function coverage(db, dIds, w0, t1, b0, b1) {
  const C = db.collection('qa_coverage');
  await C.createIndex({ dId: 1, variable: 1, day: 1 }, { unique: true });
  const d0 = Math.floor(w0 / DAY), d1 = Math.floor(t1 / DAY);
  const cached = await C.find({ dId: { $in: dIds }, day: { $gte: d0, $lte: d1 }, final: true }).toArray();
  const listos = new Set(cached.map((c) => c.day));
  const faltan = []; for (let d = d0; d <= d1; d++) if (!listos.has(d)) faltan.push(d);
  let nuevos = [];
  if (faltan.length) {
    const desde = Math.min(...faltan) * DAY;
    const rows = await db.collection('data').aggregate([
      { $match: { dId: { $in: dIds }, time: { $gte: desde, $lte: t1 } } },
      { $group: { _id: { d: '$dId', v: '$variable', b: { $floor: { $divide: ['$time', BUCKET_MS] } } }, c: { $sum: 1 } } },
    ], { allowDiskUse: true }).toArray();
    const porDia = new Map();
    for (const r of rows) {
      const day = Math.floor(r._id.b * BUCKET_MS / DAY); if (listos.has(day)) continue;
      const k = `${r._id.d}|${r._id.v}|${day}`;
      const e = porDia.get(k) || { dId: r._id.d, variable: r._id.v, day, b: [], n: [] };
      e.b.push(r._id.b); e.n.push(r.c); porDia.set(k, e);
    }
    nuevos = [...porDia.values()];
    for (const e of nuevos) {
      e.final = (e.day + 1) * DAY < t1 - 2 * 3600000;
      await C.updateOne({ dId: e.dId, variable: e.variable, day: e.day }, { $set: e }, { upsert: true });
    }
  }
  const out = new Map();
  for (const e of [...cached, ...nuevos]) {
    const k = `${e.dId}|${e.variable}`;
    const o = out.get(k) || { _id: { d: e.dId, v: e.variable }, b: [], c: 0 };
    e.b.forEach((b, i) => { if (b >= b0 && b <= b1) { o.b.push(b); o.c += e.n[i]; } });
    out.set(k, o);
  }
  return [...out.values()].filter((o) => o.b.length);
}

async function compute({ now = Date.now(), force = false } = {}) {
  const db = mongoose.connection.db;
  const cfg = await loadConfig();
  if (!force) {
    const last = await Snapshot.findOne({ siteCode: SITE_ID }).sort({ computedAt: -1 }).select('computedAt').lean();
    if (last && now - new Date(last.computedAt).getTime() < cfg.everyMin * 60000) return null;
  }
  const t0 = Date.now(); const notas = [];
  const t1 = now, w0 = t1 - cfg.windowDays * 24 * R.H;

  const site = await db.collection('sites').findOne({ siteCode: SITE_ID });
  const dIds = (site && site.devices) || [];
  const devs = await db.collection('devices').find({ dId: { $in: dIds } }).project({ dId: 1, name: 1, deviceType: 1, profileId: 1 }).toArray();
  const profiles = new Map((await db.collection('controllerprofiles').find({}).project({ profileId: 1, manufacturer: 1, model: 1 }).toArray()).map((p) => [p.profileId, p]));
  const sheets = new Map((await db.collection('equipmentsheets').find({}).project({ deviceType: 1, manufacturer: 1, model: 1 }).toArray()).map((s) => [s.deviceType, s]));

  // ── eventos: ventana + último evento de cada par antes de la ventana (si seguía abierto) ──
  const N = db.collection('notifications');
  const base = { ruleId: { $ne: null }, dId: { $in: dIds } };
  const proj = { ruleId: 1, dId: 1, siteId: 1, kind: 1, time: 1, ackAt: 1, severity: 1, label: 1, mode: 1 };
  const enVentana = await N.find({ ...base, time: { $gte: w0, $lte: t1 } }).project(proj).sort({ time: 1 }).toArray();
  const previos = await N.aggregate([
    { $match: { ...base, time: { $lt: w0, $gte: w0 - PRIOR_LOOKBACK_D * 24 * R.H } } },
    { $sort: { time: -1 } },
    { $group: { _id: { r: '$ruleId', d: '$dId' }, last: { $first: '$$ROOT' } } },
    { $match: { 'last.kind': { $ne: 'resolve' } } },
  ]).toArray();
  const norm = (e) => ({ ...e, kind: e.kind || 'fire', siteId: e.siteId || SITE_ID });
  const events = [...previos.map((p) => norm(p.last)), ...enVentana.map(norm)].sort((a, b) => a.time - b.time);
  const { episodes, huerfanos } = R.buildEpisodes(events);
  if (huerfanos) notas.push(`${huerfanos} cierre(s) sin aviso abierto en la ventana (los revisa Integridad).`);
  const recon = episodes.filter((e) => e.reconstruida).length;
  if (recon) notas.push(`${recon} episodio(s) reconstruido(s): el cierre se registró en otro equipo (anterior al fix del 22/10).`);

  // ── cobertura de datos en ventanas de 5 min, por equipo y por medición ──
  const b0 = Math.floor(w0 / BUCKET_MS), b1 = Math.floor(t1 / BUCKET_MS);
  const cov = await coverage(db, dIds, w0, t1, b0, b1);
  const porEquipo = new Map();            // dId → Set de ventanas con algún dato (sin intermitentes)
  const datos = [];
  for (const row of cov) {
    const { d, v } = row._id; const set = new Set(row.b);
    const first = Math.min(...row.b), last = Math.max(...row.b);
    let huecos = 0; for (let b = first + 1; b <= last; b++) if (!set.has(b) && set.has(b - 1)) huecos++;
    const intermitente = INTERMITENTES.includes(v);
    if (!intermitente) { const s = porEquipo.get(d) || new Set(); row.b.forEach((x) => s.add(x)); porEquipo.set(d, s); }
    const dev = devs.find((x) => x.dId === d);
    datos.push({ dId: d, equipo: (dev && dev.name) || d, variable: v, lecturas: row.c, ventanas: set.size,
      completitud: Math.round(10000 * set.size / (b1 - Math.max(b0, first) + 1)) / 100, huecos, intermitente });
  }
  datos.sort((a, b) => a.equipo.localeCompare(b.equipo) || a.completitud - b.completitud);

  // ── indicadores por equipo ──
  const equipos = []; const fallasAll = [];
  for (const d of devs) {
    const s = porEquipo.get(d.dId);
    const firstB = s && s.size ? Math.min(...s) : null;
    const tStart = firstB == null ? w0 : Math.max(w0, firstB * BUCKET_MS);
    const T = (t1 - tStart) / R.H;
    const comp = s && s.size ? 100 * s.size / (b1 - Math.floor(tStart / BUCKET_MS) + 1) : null;
    const eps = episodes.filter((e) => e.dId === d.dId && e.severity === 'critical');
    const fallas = R.failuresOf(eps, tStart, t1);
    fallasAll.push(...fallas);
    const ind = R.indicators(fallas, T, comp, cfg, tStart);
    const prof = d.profileId && profiles.get(d.profileId); const sh = sheets.get(d.deviceType);
    equipos.push({ dId: d.dId, nombre: d.name || d.dId, tipo: d.deviceType,
      modelo: prof ? `${prof.manufacturer} ${prof.model}` : sh ? `${sh.manufacturer || ''} ${sh.model || ''}`.trim() : d.deviceType,
      desde: tStart, ...ind,
      fallas: fallas.slice(-50).map((f) => ({ start: f.start, end: f.end, ackAt: f.ackAt, causas: [...new Set(f.causas)],
        censurada: f.censurada, reconstruida: f.reconstruida,
        resp: f.ackAt && f.ackAt >= f.start && f.ackAt <= f.end ? (f.ackAt - f.start) / R.H : null,
        rep: f.ackAt && f.ackAt >= f.start && f.ackAt <= f.end && !f.censurada ? (f.end - f.ackAt) / R.H : null,
        fuera: (f.end - f.start) / R.H })) });
    if (firstB == null) notas.push(`${d.name || d.dId}: sin lecturas en la ventana (indicadores no calculables).`);
  }

  // ── caídas del sitio: rectificadores callados mientras otro equipo publica ──
  const rect = devs.filter((d) => cfg.rectifierTypes.includes(d.deviceType)).map((d) => d.dId);
  const bucketsRect = new Set(), bucketsOtros = new Set();
  for (const row of cov) {
    const dst = rect.includes(row._id.d) ? bucketsRect : bucketsOtros;
    row.b.forEach((b) => dst.add(b));
  }
  const sitio = R.siteOutages(bucketsRect, bucketsOtros, b0, b1);
  if (!sitio) notas.push('Sin rectificadores con datos: no se puede calcular la disponibilidad del sitio.');

  const fires = enVentana.filter((e) => (e.kind || 'fire') !== 'resolve');
  const snap = {
    siteCode: SITE_ID, computedAt: new Date(now),
    window: { t0: w0, t1, T: cfg.windowDays * 24, isaDays: cfg.isaDays },
    config: cfg, sitio, agg: R.aggregate(equipos, fallasAll, cfg), equipos,
    isa: R.isaLoad(fires, episodes, t1, cfg), datos, notas, durationMs: Date.now() - t0,
  };
  await Snapshot.create(snap);
  return snap;
}

module.exports = {
  layer: 'B', name: 'REL', compute,
  run: async () => {
    const s = await compute();
    return { check: 'REL', rulesCovered: [], devicesCovered: s ? s.equipos.map((e) => e.dId) : [], findingsWritten: 0 };
  },
};
