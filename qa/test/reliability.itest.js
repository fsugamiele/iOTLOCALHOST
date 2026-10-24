// Integración de qa/checks/reliability.js con una base falsa (sin Mongo). En el worker:  docker exec wanomi-qa node /home/qa/qa/test/reliability.itest.js
const assert = require('assert');
const REPO = require('path').join(__dirname, '../..');
const mongoose = require('mongoose');
const QaConfig = require(REPO + '/app/api/models/qa_config');
const Snap = require(REPO + '/app/api/models/reliability_snapshot');
const H = 3600000, NOW = Date.UTC(2026, 9, 24, 12), W0 = NOW - 720 * H;
const at = (h) => W0 + h * H;
// ── datos ──
const devices = [
  { dId: 'GE', name: 'Grupo electrógeno', deviceType: 'cummins-pcc', profileId: 'cummins-pcc1302' },
  { dId: 'ATS', name: 'Tablero de transferencia', deviceType: 'ATS' },
  { dId: 'R1', name: 'Rectificador 1', deviceType: 'ELTEK' },
  { dId: 'R2', name: 'Rectificador 2', deviceType: 'ELTEK' },
  { dId: 'SEC', name: 'Seguridad del shelter', deviceType: 'SEC' },
];
const data = [];
const apagada = (t) => t >= at(200) && t < at(224);              // plataforma apagada 24 h (Qs9)
const pub = (dId, v, fromH, toH, stepS = 60, skip = () => false) => { for (let t = at(fromH); t < at(toH); t += stepS * 1000) if (!skip(t) && !apagada(t)) data.push({ dId, variable: v, time: t }); };
pub('GE', 'rpm', 0, 720); pub('GE', 'fuel_efficiency', 100, 110); pub('R2', '_divergeHigh', 10, 11);
pub('ATS', 'mains_v', 0, 480);                                     // calla los últimos 10 días
const lvd = (t) => t >= at(480) && t < at(481);                   // 1 h sin rectificadores
pub('R1', 'dc_bus_v', 0, 720, 60, lvd); pub('R2', 'dc_bus_v', 0, 720, 60, lvd);
pub('SEC', 'shelter_temp', 600, 720, 120);                         // equipo nuevo: 120 h
const n = (o) => ({ siteId: 'CR00061', severity: 'critical', label: o.ruleId, ...o });
const notifs = [
  n({ ruleId: 'A0', dId: 'GE', kind: 'fire', time: W0 - 2 * H }), n({ ruleId: 'A0', dId: 'GE', kind: 'resolve', time: at(1) }),  // abierta antes
  n({ ruleId: 'GE-04', dId: 'GE', kind: 'fire', time: at(100), ackAt: at(100.5) }), n({ ruleId: 'GE-04', dId: 'GE', kind: 'resolve', time: at(102) }),
  n({ ruleId: 'GE-07', dId: 'GE', kind: 'fire', time: at(101), ackAt: at(101.2) }), n({ ruleId: 'GE-07', dId: 'GE', kind: 'resolve', time: at(103) }), // superpuesta
  n({ ruleId: 'GE-04', dId: 'GE', kind: 'fire', time: at(102.2) }), n({ ruleId: 'GE-04', dId: 'GE', kind: 'resolve', time: at(103.3) }),  // rebote (Qs8)
  n({ ruleId: 'W', dId: 'GE', kind: 'fire', severity: 'warning', time: at(300) }),
  n({ ruleId: 'AC', dId: 'ATS', kind: 'fire', time: at(300) }), n({ ruleId: 'AC', dId: 'ATS', kind: 'resolve', time: at(302) }),  // red
  n({ ruleId: 'PUERTA', dId: 'SEC', kind: 'fire', time: at(650) }), n({ ruleId: 'PUERTA', dId: 'SEC', kind: 'resolve', time: at(650.1) }),  // seguridad
  n({ ruleId: 'NUEVA', dId: 'GE', kind: 'fire', time: at(500) }), n({ ruleId: 'NUEVA', dId: 'GE', kind: 'resolve', time: at(500.5) }),  // sin clasificar
  n({ ruleId: 'X', dId: 'SEC', kind: 'fire', time: at(480), label: 'Bus DC bajo' }), n({ ruleId: 'X', dId: 'R2', kind: 'resolve', time: at(481) }), // cierre en otro equipo
  n({ ruleId: 'Z', dId: 'SEC', kind: 'resolve', time: at(50) }),
];
for (let i = 0; i < 12; i++) notifs.push(n({ ruleId: 'F2a', dId: 'ATS', kind: 'fire', severity: 'warning', time: NOW - 30 * H + i * 30000 }));
// ── base falsa ──
const cache = new Map(); const stats = { aggData: 0 };
const cursor = (arr) => ({ project() { return this; }, sort(s) { const k = Object.keys(s)[0]; arr = [...arr].sort((a, b) => s[k] * (a[k] - b[k])); return this; }, toArray: async () => arr });
const match = (doc, q) => Object.entries(q).every(([k, c]) => {
  const v = doc[k];
  if (c && typeof c === 'object' && !Array.isArray(c)) return Object.entries(c).every(([op, x]) => ({ $in: () => x.includes(v), $ne: () => v !== x, $gte: () => v >= x, $lte: () => v <= x, $lt: () => v < x }[op])());
  return v === c; });
const coll = {
  rulepacks: { find: () => cursor([{ rules: [
    { ruleId: 'A0', eventClass: 'equipo' }, { ruleId: 'GE-04', eventClass: 'equipo' }, { ruleId: 'GE-07', eventClass: 'equipo' },
    { ruleId: 'X', type: 'cross', eventClass: 'equipo', failDeviceType: 'ELTEK' }, { ruleId: 'AC', eventClass: 'red' },
    { ruleId: 'PUERTA', eventClass: 'seguridad' }, { ruleId: 'W', eventClass: 'equipo' } ] }]) },
  sites: { findOne: async () => ({ siteCode: 'CR00061', devices: devices.map((d) => d.dId) }) },
  devices: { find: (q) => cursor(devices.filter((d) => match(d, q))) },
  controllerprofiles: { find: () => cursor([{ profileId: 'cummins-pcc1302', manufacturer: 'Cummins', model: 'PCC 1302' }]) },
  equipmentsheets: { find: () => cursor([{ deviceType: 'ELTEK', manufacturer: 'Eltek', model: 'Smartpack S' }]) },
  notifications: {
    find: (q) => cursor(notifs.filter((d) => match(d, q))),
    aggregate: (p) => { const q = p[0].$match; const last = new Map();
      for (const d of notifs.filter((x) => match(x, q)).sort((a, b) => b.time - a.time)) { const k = d.ruleId + '|' + d.dId; if (!last.has(k)) last.set(k, d); }
      return cursor([...last.values()].filter((d) => d.kind !== 'resolve').map((d) => ({ last: d }))); },
  },
  data: { aggregate: (p) => { const q = p[0].$match; const g = new Map(); stats.aggData++;
    for (const d of data) { if (!match(d, q)) continue; const b = Math.floor(d.time / 300000); const k = d.dId + '|' + d.variable + '|' + b;
      const e = g.get(k) || { _id: { d: d.dId, v: d.variable, b }, c: 0 }; e.c++; g.set(k, e); }
    stats.desde = q.time.$gte; return cursor([...g.values()]); } },
  qa_coverage: {
    createIndex: async () => {},
    find: (q) => cursor([...cache.values()].filter((d) => match(d, q))),
    updateOne: async (k, u) => { cache.set(`${k.dId}|${k.variable}|${k.day}`, { ...u.$set }); },
  },
};
mongoose.connection.db = { collection: (n) => coll[n] };
QaConfig.findById = () => ({ lean: async () => null });
let saved = null;
Snap.findOne = () => ({ sort: () => ({ select: () => ({ lean: async () => null }) }) });
Snap.create = async (s) => { saved = s; return s; };
(async () => {
  const { compute } = require(REPO + '/qa/checks/reliability');
  const s = await compute({ now: NOW });
  const json = JSON.stringify(s);
  assert(!/NaN|Infinity/.test(json), 'hay NaN/Infinity');
  const E = Object.fromEntries(s.equipos.map((e) => [e.dId, e]));
  console.log(s.equipos.map((e) => `${e.nombre.padEnd(26)} n=${e.n} T=${e.T} TO=${e.TO} MTBF=${e.mtbf} [${e.mtbf_lo}–${e.mtbf_hi}] MTTR=${e.mttr} Ao=${e.Ao} comp=${e.completitud} ${e.conf} · ${e.modelo}`).join('\n'));
  console.log('sitio', s.sitio, '\nagg', { n: s.agg.n, mtbf: s.agg.mtbf, lo: s.agg.mtbf_lo, hi: s.agg.mtbf_hi, mttr: s.agg.mttr, Ao: s.agg.Ao, conf: s.agg.conf });
  console.log('isa', { ...s.isa, horas: undefined }, '\nnotas', s.notas);
  assert.strictEqual(E.GE.n, 2);                                  // A0 recortada + (GE-04 ∪ GE-07 ∪ rebote); W no crítica; NUEVA sin clasificar
  assert.deepStrictEqual(E.GE.fallas[1].causas, ['GE-04', 'GE-07']);
  assert(Math.abs(E.GE.fallas[1].fuera - 3.3) < 0.1, 'el rebote extiende la falla');
  assert.strictEqual(E.GE.mttr, 2.8); assert.strictEqual(E.GE.mrt, 0.5);
  assert.strictEqual(E.GE.modelo, 'Cummins PCC 1302');
  assert(Math.abs(E.GE.T - 696) < 0.1, 'exposición = horas con la plataforma viva');
  assert(E.GE.completitud > 99.9, 'la plataforma apagada no baja la completitud del equipo');
  assert.strictEqual(E.R1.n, 1, 'la combinada se imputa al rectificador (failDeviceType)'); assert.strictEqual(E.SEC.n, 0);
  assert.strictEqual(E.R1.fallas[0].reconstruida, true); assert.strictEqual(E.R2.n, 0);
  assert(E.ATS.completitud < 70 && E.ATS.conf === 'baja'); assert.strictEqual(E.ATS.n, 0, 'red no es falla del ATS');
  assert(Math.abs(E.SEC.T - 120) < 0.1);
  assert(Math.abs(s.sitio.carga.downH - 1) < 0.1 && s.sitio.carga.caidas === 1);
  assert.strictEqual(s.sitio.red.n, 1); assert.strictEqual(s.sitio.red.horas, 2);
  assert.strictEqual(s.sitio.eventos.seguridad, 1); assert.deepStrictEqual(s.sitio.sinClasificar.map((x) => x.ruleId), ['NUEVA']);
  assert(Math.abs(s.sitio.plataforma.sinDatosPct - 100 * 24 / 720) < 0.1);
  assert(!s.datos.some((d) => d.variable.startsWith('_')));
  assert.strictEqual(s.isa.max10, 12); assert(s.isa.flood_pct > 0);
  assert(s.notas.some((x) => /reconstruido/.test(x)) && s.notas.some((x) => /sin aviso abierto/.test(x)) && s.notas.some((x) => /rebotes/.test(x)));
  // segunda corrida 1 h después: solo agrega lo que no está cerrado (hoy), no la ventana entera
  const s2 = await compute({ now: NOW + H, force: true });
  assert(stats.desde >= Math.floor((NOW + H) / 86400000) * 86400000 - 86400000, 'la 2ª corrida recorrió días ya cerrados');
  const E2 = Object.fromEntries(s2.equipos.map((e) => [e.dId, e]));
  assert(Math.abs(E2.GE.completitud - E.GE.completitud) < 0.5 && s2.sitio.carga.caidas === 1);
  console.log('\nintegración OK (2ª corrida desde', new Date(stats.desde).toISOString(), ')');
})().catch((e) => { console.error(e); process.exit(1); });
