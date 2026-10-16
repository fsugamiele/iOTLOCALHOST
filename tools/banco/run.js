'use strict';
// Banco de conformidad del ciclo de vida — B0 · tipo D (plan_banco_conformidad_reglas.md).
//
// Prueba una regla D del pack de banco (`banco-conformidad`) contra los controles C1–C12 del
// mockup "Ciclo de vida de una regla". CAMINO PRODUCTIVO (DEC-PROC-5): la regla se crea por la
// API real (PUT /api/rulepacks), el estímulo va por la API del simulador (POST /simulator/set,
// el mismo camino que el botón Aplicar y que los guiones), y el resultado se lee de lo que dejó
// el sistema: bitácora `ruletransitions`, estado `rulefsm` y consola `notifications` + el
// detalle de alarma de la API. El corredor NO evalúa reglas: solo observa y compara.
//
// Uso (contenedor node — tiene la API en localhost:3001, Mongo y EMQX):
//   docker exec -i node node - --list < tools/banco/run.js
//   docker exec -i node node - --dId XXXXXXXX --var VARIABLE [--T 100] < tools/banco/run.js
//   (la fase posterior al reinicio del edge la orquesta tools/banco/banco.sh)
//
// Resultados: VERDE (cumple el mockup) · ROJO (no cumple, con evidencia) · OBSERVADO (el
// mockup no fija el comportamiento exacto: se describe lo que pasó, es pregunta de diseño).

const http = require('http');
const fs = require('fs');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const mongoose = require(NM + 'mongoose');
const mqtt = require(NM + 'mqtt');

const e = process.env;
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const PACK = 'banco-conformidad';
const RULE = 'banco-D';
const GRACE = 30, CLOSE = 30;          // Qc2 — tiempos comprimidos del banco
const TICK = 5;                         // tolerancia (s): tick del motor
const STATE_FILE = '/tmp/banco_D_state.json';
const SITE = e.SITE_ID;
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } },
  e.JWT_SECRET, { expiresIn: '2h' });

// ── utilidades ───────────────────────────────────────────────────────────────
function api(method, path, obj) {
  return new Promise((ok, ko) => {
    const body = obj ? Buffer.from(JSON.stringify(obj)) : null;
    const h = { token: TOKEN, 'Content-Type': 'application/json' };
    if (body) h['Content-Length'] = body.length;
    const r = http.request({ host: 'localhost', port: parseInt(e.API_PORT || '3001', 10), method, path: '/api' + path, headers: h }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} ok({ status: res.statusCode, json: j, raw: b }); });
    });
    r.on('error', ko); if (body) r.write(body); r.end();
  });
}
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const now = () => Date.now();
const fmt = (ms) => new Date(ms).toISOString().slice(11, 19);
const log = (...a) => console.log(`[${fmt(now())}]`, ...a);
let db;
const trans = async (since) => (await db.collection('ruletransitions')
  .find({ ruleId: RULE, ts: { $gte: new Date(since) } }).sort({ ts: 1, _id: 1 }).toArray());
const notifs = async (since) => (await db.collection('notifications')
  .find({ ruleId: RULE, time: { $gte: since } }).sort({ time: 1, _id: 1 }).toArray());
const fsmRow = async (dId) => db.collection('rulefsm').findOne({ siteId: SITE, key: `${RULE}:${dId}` });
const steps = (ts) => ts.map((t) => `${t.from}→${t.to}${t.action ? '(' + t.action + ')' : ''}`).join(' · ') || '(sin transiciones)';

const RESULTS = [];
function result(c, estado, que, evidencia) {
  RESULTS.push({ c, estado, que, evidencia });
  const icon = { VERDE: '✓', ROJO: '✗', OBSERVADO: '◐' }[estado] || '?';
  log(`${icon} ${c} ${estado} — ${que}${evidencia ? '\n           evidencia: ' + evidencia : ''}`);
}

let mq;
function mqttCmd(dId, command) {
  return new Promise((ok, ko) => mq.publish(`simulator/${dId}/control`, JSON.stringify({ command }), { qos: 1 }, (err) => err ? ko(err) : ok()));
}
async function setVal(dId, variable, value) {
  const r = await api('POST', '/simulator/set', { dId, sensor: variable, value });
  if (r.status !== 200) throw new Error(`simulator/set ${variable}=${value} → ${r.status} ${r.raw.slice(0, 160)}`);
  log(`   set ${variable} = ${value}`);
}

async function putRule(base, rule) {
  const pack = { packId: PACK, deviceType: base.deviceType, description: 'Banco de conformidad del ciclo de vida (plan_banco_conformidad_reglas.md). No productivo.', canary: false, rules: [rule] };
  const cur = await api('GET', `/rulepacks/${PACK}`);
  const version = cur.status === 200 && cur.json && cur.json.data ? (cur.json.data.version || 1) + 1 : 1;
  const r = await api('PUT', `/rulepacks/${PACK}`, { rulepack: { ...pack, version } });
  if (r.status !== 200) throw new Error(`PUT pack → ${r.status} ${r.raw.slice(0, 200)}`);
}

function ruleD(st, T) {
  return {
    ruleId: RULE, label: 'Banco · umbral fijo (D)', inferenceId: 'BANCO_D', type: 'D', severity: 'warning',
    deviceType: st.deviceType, variable: st.variable, unit: st.unit || '',
    cooldownSec: 300,                       // default productivo del asistente (no se comprime)
    graceSec: GRACE, resolveGraceSec: CLOSE,
    condition: { op: 'gt', value: T, deadband: 2 * st.u },
    recommendation: 'Regla de banco: no requiere acción.', enabled: true,
  };
}

// ── --list: candidatos ───────────────────────────────────────────────────────
async function list() {
  const devs = await db.collection('devices').find({ firmwareType: 'wanomi-sim', siteId: SITE }).toArray();
  const packs = await db.collection('rulepacks').find({}).toArray();
  const usos = new Map();
  for (const p of packs) for (const r of p.rules || []) {
    const s = JSON.stringify(r); const add = (v) => v && usos.set(`${r.deviceType}|${v}`, (usos.get(`${r.deviceType}|${v}`) || 0) + 1);
    add(r.variable); for (const m of s.matchAll(/"variable":"([^"]+)"/g)) add(m[1]);
  }
  console.log(`Equipos simulados del sitio ${SITE} y variables numéricas (reglas que ya la usan · deadband del simulador):\n`);
  for (const d of devs) {
    const tpl = await db.collection('templates').findOne({ _id: mongoose.Types.ObjectId.isValid(d.templateId) ? new mongoose.Types.ObjectId(d.templateId) : d.templateId });
    const vars = ((tpl && tpl.widgets) || []).filter((w) => w.variableType === 'float' && w.variable);
    console.log(`  ${d.dId}  ${d.deviceType || '?'}  ${d.name || ''}`);
    for (const w of vars) console.log(`      ${w.variable.padEnd(28)} reglas:${String(usos.get(`${d.deviceType}|${w.variable}`) || 0).padStart(2)}  deadband:${w.deadband || 0}`);
  }
  console.log('\nElegí una variable con 0 reglas (no dispara alarmas productivas) y corré con --dId y --var.');
}

// ── fase principal ───────────────────────────────────────────────────────────
async function main() {
  const dId = arg('dId'), variable = arg('var');
  const dev = await db.collection('devices').findOne({ dId });
  if (!dev) throw new Error(`no existe el equipo ${dId}`);
  if (dev.firmwareType !== 'wanomi-sim') throw new Error(`${dId} no es un equipo simulado`);
  const tpl = await db.collection('templates').findOne({ _id: new mongoose.Types.ObjectId(dev.templateId) });
  const w = ((tpl && tpl.widgets) || []).find((x) => x.variable === variable);
  if (!w || w.variableType !== 'float') throw new Error(`${variable} no es una variable float del template de ${dId}`);
  const u = Math.max(1, 3 * (Number(w.deadband) || 0));
  const T = Number(arg('T', 100));
  const st = { dId, variable, deviceType: dev.deviceType, unit: w.unit || '', u, T, t0: now() };
  const lo = T - 3 * u, hi = T + 3 * u, hi2 = T + 5 * u, band = T - u;
  log(`Banco D sobre ${dId} (${dev.deviceType}) · ${variable} · umbral > ${T} · banda ${2 * u} · espera ${GRACE}s · cierre ${CLOSE}s`);
  log(`Valores: debajo ${lo} · encima ${hi} · en banda ${band}`);

  // Preparación: valor normal + regla de banco.
  await mqttCmd(dId, 'resume_publishing');
  await setVal(dId, variable, lo);
  await sleep(8);
  await putRule(st, ruleD(st, T));
  log('Regla de banco creada/recargada. Esperando la recarga del edge…');
  await sleep(15);

  // C1a — debajo del umbral: nada.
  let s = now(); await setVal(dId, variable, lo); await sleep(GRACE + 10);
  let ts = await trans(s), ns = await notifs(s);
  result('C1a', !ts.length && !ns.length ? 'VERDE' : 'ROJO', 'debajo del umbral no pasa nada', `${steps(ts)} · avisos: ${ns.length}`);

  // C2b — supera y vuelve antes de la espera: E1→E2→E1 sin aviso.
  s = now(); await setVal(dId, variable, hi); await sleep(GRACE / 2); await setVal(dId, variable, lo); await sleep(10);
  ts = await trans(s); ns = await notifs(s);
  const c2b = ts.some((t) => t.from === 'E1' && t.to === 'E2') && ts.some((t) => t.from === 'E2' && t.to === 'E1') && !ns.length;
  result('C2b', c2b ? 'VERDE' : 'ROJO', 'si se normaliza antes de la espera, vuelve a Vigilando sin avisar', `${steps(ts)} · avisos: ${ns.length}`);

  // C1/C2 — supera y se sostiene: aviso tras la espera, con valor y umbral reales.
  s = now(); await setVal(dId, variable, hi); await sleep(GRACE + 15);
  ts = await trans(s); ns = await notifs(s);
  const t12 = ts.find((t) => t.from === 'E1' && t.to === 'E2'), t23 = ts.find((t) => t.from === 'E2' && t.to === 'E3');
  const fire = ns.find((n) => (n.kind || 'fire') === 'fire');
  const espera = t12 && t23 ? (t23.ts - t12.ts) / 1000 : null;
  result('C2', espera != null && espera >= GRACE - TICK && espera <= GRACE + 2 * TICK ? 'VERDE' : 'ROJO',
    `espera de ${GRACE}s antes de avisar`, `${steps(ts)} · espera medida: ${espera != null ? espera.toFixed(0) + 's' : '—'}`);
  result('C1', fire && Math.abs(fire.value - hi) < 1e-6 && Number(fire.thresholdUsed) === T ? 'VERDE' : 'ROJO',
    'el aviso guarda el valor y el umbral reales', fire ? `value=${fire.value} (esperado ${hi}) · thresholdUsed=${fire.thresholdUsed} (esperado ${T})` : 'no hubo aviso de disparo en la consola');
  st.fireId = fire ? String(fire._id) : null; st.fireTime = fire ? fire.time : null; st.t23 = t23 ? +t23.ts : null;

  // C3 — sigue en alarma con otro valor: sin avisos repetidos.
  s = now(); await setVal(dId, variable, hi2); await sleep(GRACE + 10);
  ns = await notifs(s);
  result('C3', !ns.length ? 'VERDE' : 'ROJO', 'un solo aviso por episodio', `avisos nuevos: ${ns.length}`);

  // C4 — dentro de la banda (debajo del umbral pero sin cruzar la banda): sigue en Alarma.
  s = now(); await setVal(dId, variable, band); await sleep(CLOSE + 10);
  ts = await trans(s); ns = await notifs(s);
  result('C4', !ts.some((t) => t.to === 'E4' || t.to === 'E1') && !ns.length ? 'VERDE' : 'ROJO',
    `dentro de la banda (${band}) la alarma se mantiene`, `${steps(ts)} · avisos: ${ns.length}`);

  // C6 — empieza a cerrar y recae: E3→E4→E3 sin aviso nuevo.
  s = now(); await setVal(dId, variable, lo); await sleep(CLOSE / 2); await setVal(dId, variable, hi); await sleep(10);
  ts = await trans(s); ns = await notifs(s);
  const c6 = ts.some((t) => t.from === 'E3' && t.to === 'E4') && ts.some((t) => t.from === 'E4' && t.to === 'E3') && !ns.length;
  result('C6', c6 ? 'VERDE' : 'ROJO', 'si recae durante el cierre, es la misma alarma (sin aviso nuevo)', `${steps(ts)} · avisos: ${ns.length}`);

  // C5 — se normaliza: cierre tras el tiempo de cierre, un solo aviso de cierre.
  s = now(); await setVal(dId, variable, lo); await sleep(CLOSE + 15);
  ts = await trans(s); ns = await notifs(s);
  const t34 = ts.find((t) => t.from === 'E3' && t.to === 'E4'), t41 = ts.find((t) => t.from === 'E4' && t.to === 'E1');
  const res = ns.filter((n) => n.kind === 'resolve');
  const cierre = t34 && t41 ? (t41.ts - t34.ts) / 1000 : null;
  result('C5', cierre != null && cierre >= CLOSE - TICK && cierre <= CLOSE + 2 * TICK && res.length === 1 ? 'VERDE' : 'ROJO',
    `cierre ${CLOSE}s después de normalizarse, con un aviso de cierre`, `${steps(ts)} · cierre medido: ${cierre != null ? cierre.toFixed(0) + 's' : '—'} · avisos de cierre: ${res.length}`);
  st.resolveTime = res[0] ? res[0].time : null; st.t41 = t41 ? +t41.ts : null;

  // C11 — coherencia de tiempos: consola (detalle de la API) vs bitácora.
  if (st.fireId) {
    const d = await api('GET', `/alarms/${st.fireId}/detail`);
    const a = d.json && (d.json.data || d.json);
    const al = a && (a.alarm || a);
    const firedAt = al && al.firedAt, resolvedAt = al && al.resolvedAt;
    const okF = firedAt && st.t23 && Math.abs(firedAt - st.t23) <= TICK * 1000;
    const okR = resolvedAt && st.t41 && Math.abs(resolvedAt - st.t41) <= TICK * 1000;
    result('C11', okF && okR ? 'VERDE' : 'ROJO', 'los tiempos de la consola coinciden con la bitácora',
      `consola: disparo ${firedAt ? fmt(firedAt) : '—'} · cierre ${resolvedAt ? fmt(resolvedAt) : '—'} · duración ${al && al.durationSec != null ? al.durationSec + 's' : '—'}  |  bitácora: E2→E3 ${st.t23 ? fmt(st.t23) : '—'} · E4→E1 ${st.t41 ? fmt(st.t41) : '—'}`);
  } else result('C11', 'ROJO', 'los tiempos de la consola coinciden con la bitácora', 'no hubo aviso de disparo para comparar');

  // Re-disparo dentro del cooldown (300 s desde el primer aviso): ¿la consola se entera?
  s = now(); await setVal(dId, variable, hi); await sleep(GRACE + 15);
  ts = await trans(s); ns = await notifs(s);
  const refire = ns.find((n) => (n.kind || 'fire') === 'fire');
  const enE3 = ts.some((t) => t.to === 'E3');
  result('C3b', enE3 && refire ? 'VERDE' : enE3 && !refire ? 'ROJO' : 'ROJO',
    'un episodio NUEVO (después de un cierre) avisa aunque no hayan pasado 5 min (cooldown)',
    `${steps(ts)} · aviso de disparo en la consola: ${refire ? 'sí' : 'NO'}`);

  // C7 — se corta el dato con la alarma abierta.
  s = now(); await mqttCmd(dId, 'stop_publishing'); log('   simulador: stop_publishing'); await sleep(90);
  ts = await trans(s); const row7 = await fsmRow(dId);
  result('C7', ts.some((t) => t.to === 'E5') ? 'VERDE' : 'OBSERVADO',
    'sin datos → "Sin datos" (E5) y la alarma sigue abierta',
    `90 s sin publicar: ${steps(ts)} · etapa ${row7 ? row7.step : 'E1 (sin fila)'} · alarma abierta: ${row7 ? !!row7.alarmOpen : false}. ` +
    'El tipo D se evalúa solo cuando llega un mensaje; no hay un tiempo de "sin datos" definido para D.');
  await mqttCmd(dId, 'resume_publishing'); log('   simulador: resume_publishing'); await sleep(10);

  // C9 — edición de la regla con la alarma abierta.
  const row9 = await fsmRow(dId);
  if (!row9 || !row9.alarmOpen) { await setVal(dId, variable, lo); await sleep(8); await setVal(dId, variable, hi); await sleep(GRACE + 15); }
  s = now();
  const T2 = T + 10 * u;                  // nuevo umbral: el valor actual (hi) queda debajo
  await putRule(st, ruleD(st, T2)); log(`   regla editada: umbral ${T} → ${T2}`); await sleep(20);
  ns = await notifs(s); ts = await trans(s);
  const rEdit = ns.find((n) => n.kind === 'resolve' && n.mode === 'resolve-by-edit');
  const row9b = await fsmRow(dId);
  result('C9', rEdit && !(row9b && row9b.alarmOpen) ? 'VERDE' : 'ROJO',
    'al editar la regla con la alarma abierta se cierra por edición y rige el umbral nuevo',
    `cierre por edición: ${rEdit ? 'sí' : 'NO'} · ${steps(ts)} · alarma abierta después: ${row9b ? !!row9b.alarmOpen : false}`);

  // Prepara C10: umbral original + alarma abierta. La fase post-reinicio la verifica.
  // (el simulador no republica un valor repetido: se baja y se vuelve a subir)
  await putRule(st, ruleD(st, T)); await sleep(15);
  await setVal(dId, variable, lo); await sleep(8);
  await setVal(dId, variable, hi); await sleep(GRACE + 15);
  const row10 = await fsmRow(dId);
  st.c10 = { before: row10 ? { step: row10.step, alarmOpen: !!row10.alarmOpen } : null, t: now() };
  fs.writeFileSync(STATE_FILE, JSON.stringify({ st, RESULTS }));
  log(`Listo para C10 (alarma abierta: ${row10 ? !!row10.alarmOpen : false}). Ahora se reinicia el edge.`);
}

// ── fase posterior al reinicio del edge (C10) + informe ──────────────────────
async function post() {
  const { st, RESULTS: prev } = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  RESULTS.push(...prev);
  const s = st.c10.t;
  await sleep(45);                         // el edge arranca, hidrata y recibe mensajes
  const ns = await notifs(s), row = await fsmRow(st.dId);
  const dup = ns.filter((n) => (n.kind || 'fire') === 'fire').length, falsos = ns.filter((n) => n.kind === 'resolve').length;
  result('C10', st.c10.before && st.c10.before.alarmOpen && row && row.alarmOpen && row.step === st.c10.before.step && !dup && !falsos ? 'VERDE' : 'ROJO',
    'tras reiniciar el edge: misma etapa, sin aviso duplicado ni cierre falso',
    `antes: ${st.c10.before ? st.c10.before.step + (st.c10.before.alarmOpen ? ' abierta' : '') : '—'} · después: ${row ? row.step + (row.alarmOpen ? ' abierta' : '') : 'E1 (sin fila)'} · avisos nuevos: ${dup} disparo / ${falsos} cierre`);

  // Limpieza: normaliza, espera el cierre y suelta el valor fijado del simulador.
  await setVal(st.dId, st.variable, st.T - 3 * st.u); await sleep(CLOSE + 15);
  await api('PATCH', `/rulepacks/${PACK}/rules/${RULE}/enabled`, { enabled: false });
  await api('POST', '/simulator/reset', { dId: st.dId });
  log('Limpieza: regla de banco apagada y simulador reseteado.');

  result('C8', 'OBSERVADO', 'cierre manual', 'no aplica al tipo D (la regla de banco es automática)');
  const fire = st.fireId;
  result('C12', 'OBSERVADO', 'UI del detalle contra el mockup (lo marca Franco)',
    fire ? `abrir http://localhost:3000/alarmas/${fire} y verificar la lista de abajo` : 'no hubo alarma para abrir');

  // Informe
  const orden = ['C1a', 'C1', 'C2b', 'C2', 'C3', 'C3b', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'];
  RESULTS.sort((a, b) => orden.indexOf(a.c) - orden.indexOf(b.c));
  const n = (k) => RESULTS.filter((r) => r.estado === k).length;
  console.log('\n════════ INFORME B0 · tipo D ════════');
  for (const r of RESULTS) console.log(`${r.c.padEnd(4)} ${r.estado.padEnd(9)} ${r.que}\n                ${r.evidencia || ''}`);
  console.log(`\nVERDE ${n('VERDE')} · ROJO ${n('ROJO')} · OBSERVADO ${n('OBSERVADO')}`);
  console.log(`
── C12 · lista de verificación de la UI (marcá sí/no y mandá la captura) ──
En el detalle de la alarma de banco:
  [ ] se ve la ETAPA actual del ciclo (Vigilando / Observando / Alarma / Recuperándose / Sin datos)
  [ ] se ve la línea de tiempo del episodio: cuándo empezó a observar, cuándo avisó, cuándo empezó a cerrar, cuándo cerró
  [ ] se ve el UMBRAL aplicado (${st.T}) y la BANDA (${2 * st.u}) junto al valor
  [ ] se ven la ESPERA (${GRACE}s) y el TIEMPO DE CIERRE (${CLOSE}s) de la regla
  [ ] se ve la BITÁCORA de transiciones (las del informe de arriba)
  [ ] la duración mostrada coincide con la del informe (C11)
  [ ] hay un acceso para EDITAR la regla desde la alarma
`);
}

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  db = mongoose.connection.db;
  if (has('list')) { await list(); process.exit(0); }
  mq = mqtt.connect('mqtt://' + e.EMQX_API_HOST, { port: 1883, username: e.EMQX_NODE_SUPERUSER_USER, password: e.EMQX_NODE_SUPERUSER_PASSWORD, clientId: 'banco_' + Math.round(Math.random() * 1e6) });
  await new Promise((ok, ko) => { mq.once('connect', ok); mq.once('error', ko); setTimeout(() => ko(new Error('MQTT sin conexión')), 10000); });
  if (has('post')) await post(); else await main();
  mq.end(); process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
