// spec_supervisor_confiabilidad_v2 (R2) — calidad de reglas con el motor real y una base falsa (3 días sintéticos).
//   docker exec wanomi-qa node /home/qa/qa/test/ruleQuality.itest.js
const assert = require('assert');
const REPO = require('path').join(__dirname, '../..');
process.env.EDGE_DIR = process.env.EDGE_DIR || (require('fs').existsSync('/home/qa/edge-engine') ? '/home/qa/edge-engine' : REPO + '/edge-engine');
const mongoose = require('mongoose');
const H = 3600000, NOW = Date.UTC(2026, 9, 24, 12), DAYS = 3, W0 = NOW - DAYS * 24 * H;
const devices = [{ dId: 'R1', name: 'Rect 1', deviceType: 'ELTEK' }, { dId: 'GE', name: 'Grupo', deviceType: 'cummins-pcc' }];
const data = [];
let seed = 1; const u = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let t = W0; t < NOW; t += 30000) {
  // bus DC ≈ 53,5 V con ruido; cada ~3 h un bajón corto de 40 s a 51,8 V (excursión corta) y un corte real de 30 min al día 2
  const h = (t - W0) / H;
  let v = 53.5 + (u() - 0.5) * 0.2;
  if (h % 3 < 0.011) v = 51.8;
  if (h > 30 && h < 30.5) v = 51.5;
  data.push({ dId: 'R1', variable: 'dc_bus_voltage', value: v, time: t });
  data.push({ dId: 'GE', variable: 'rpm', value: 1500 + (u() - 0.5) * 10, time: t });
}
const rules = [
  { ruleId: 'BUS', label: 'Bus DC bajo', type: 'D', severity: 'critical', deviceType: 'ELTEK', variable: 'dc_bus_voltage', inferenceId: 'i', condition: { op: 'lt', value: 52 }, graceSec: 0, resolveGraceSec: 60 },
  { ruleId: 'SOBREV', label: 'Sobrevelocidad', type: 'D', severity: 'critical', deviceType: 'cummins-pcc', variable: 'rpm', inferenceId: 'i', condition: { op: 'gt', limitRef: 'trip' }, graceSec: 0, resolveGraceSec: 60 },
  { ruleId: 'IMPOS', label: 'Imposible', type: 'D', severity: 'warning', deviceType: 'cummins-pcc', variable: 'rpm', inferenceId: 'i', condition: { op: 'gt', value: 5000 }, graceSec: 0, resolveGraceSec: 60 },
  { ruleId: 'FIJO', label: 'Bus DC fijo lejano', type: 'D', severity: 'warning', deviceType: 'ELTEK', variable: 'dc_bus_voltage', inferenceId: 'i', condition: { op: 'gt', value: 58 }, graceSec: 0, resolveGraceSec: 60 },
  { ruleId: 'NADA', label: 'Sin medición', type: 'D', severity: 'warning', deviceType: 'cummins-pcc', variable: 'oil_pressure', inferenceId: 'i', condition: { op: 'lt', value: 100 }, graceSec: 0, resolveGraceSec: 60 },
];
const sheets = [{ deviceType: 'cummins-pcc', variables: [{ name: 'rpm', factoryRange: '0–1800 rpm', limits: [{ kind: 'trip', op: 'gt', value: 1725 }] }] },
  { deviceType: 'ELTEK', variables: [{ name: 'dc_bus_voltage', factoryRange: '40–60 V', limits: [{ kind: 'trip', op: 'gt', value: 57.5 }] }] }];
const cursor = (arr) => ({ project() { return this; }, sort(s) { const k = Object.keys(s)[0]; arr = [...arr].sort((a, b) => s[k] * (a[k] - b[k])); return this; }, toArray: async () => arr, limit() { return this; } });
const inR = (v, c) => Object.entries(c).every(([op, x]) => ({ $in: () => x.includes(v), $gte: () => v >= x, $lt: () => v < x, $lte: () => v <= x, $ne: () => v !== x }[op])());
const match = (d, q) => Object.entries(q).every(([k, c]) => c && typeof c === 'object' && !Array.isArray(c) ? inR(d[k], c) : d[k] === c);
const coll = {
  sites: { findOne: async () => ({ siteCode: 'CR00061', devices: ['R1', 'GE'] }) },
  devices: { find: (q) => cursor(devices.filter((d) => match(d, q))) },
  controllerprofiles: { find: () => cursor([]) },
  equipmentsheets: { find: () => cursor(sheets) },
  rulepacks: { find: () => cursor([{ packId: 'p', deviceType: 'ELTEK', rules }]) },
  data: { find: (q) => cursor(data.filter((d) => match(d, q))) },
};
mongoose.connection.db = { collection: (n) => coll[n] };
(async () => {
  const { ruleQuality } = require(REPO + '/qa/lib/ruleQuality');
  const t = Date.now();
  const s = await ruleQuality({ days: DAYS, now: NOW });
  console.log(`${s.rows} lecturas en ${((Date.now() - t) / 1000).toFixed(1)} s`);
  for (const r of s.reglas) console.log(`\n[${r.veredicto}] ${r.label} · avisos ${r.avisos}\n  ${r.porque}\n  ${String(r.calculo).replace(/\n/g, '\n  ')}\n  → ${r.cambio}`);
  const V = Object.fromEntries(s.reglas.map((r) => [r.ruleId, r]));
  assert.strictEqual(V.BUS.veredicto, 'avisa_de_mas'); assert(V.BUS.propuesta.despues < V.BUS.avisos); assert.strictEqual(V.BUS.propuesta.perdidas, 0);
  assert.strictEqual(V.SOBREV.veredicto, 'proteccion'); assert.strictEqual(V.IMPOS.veredicto, 'inalcanzable');
  assert.strictEqual(V.FIJO.veredicto, 'umbral_revisar'); assert.strictEqual(V.NADA.veredicto, 'no_evalua');
  assert(!/NaN|Infinity/.test(JSON.stringify(s)));
  console.log('\nOK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
