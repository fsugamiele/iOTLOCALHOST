// G1b · prueba — la regla cummins-pcc-oil-life quedó como cumulativeSince (debe ser accumulator).
// Muestra la foto original (rule_snapshots) para rastrear el origen y, con --apply, devuelve
// el cálculo a 'accumulator' (op gte) conservando el umbral actual. Va por la API (DEC-PROC-5).
//   docker exec -i node node - < tools/fix_oil_life_metric.js            → solo muestra
//   docker exec -i node node - --apply < tools/fix_oil_life_metric.js    → corrige
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const mongoose = require(NM + 'mongoose');
const RULE = 'cummins-pcc-oil-life';
const APPLY = process.argv.includes('--apply');
const e = process.env;
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } },
  e.JWT_SECRET, { expiresIn: '5m' });

function req(method, path, obj) {
  return new Promise((ok, ko) => {
    const body = obj ? Buffer.from(JSON.stringify(obj)) : null;
    const h = { token: TOKEN, 'Content-Type': 'application/json' };
    if (body) h['Content-Length'] = body.length;
    const r = http.request({ host: 'localhost', port: parseInt(e.API_PORT || '3001', 10), method, path, headers: h }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} ok({ status: res.statusCode, json: j, raw: b }); });
    });
    r.on('error', ko); if (body) r.write(body); r.end();
  });
}
const pick = (r) => r && JSON.stringify({ metric: r.metric, reset_behavior: r.reset_behavior, variable: r.variable, condition: r.condition });

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const snap = await mongoose.connection.db.collection('rule_snapshots').findOne({ ruleId: RULE });
  console.log('foto original :', snap ? `${pick(snap.definition)} (${snap.capturedFrom}, ${new Date(snap.capturedAt).toISOString()})` : 'no hay');

  const pack = (await req('GET', '/api/rulepacks/cummins-pcc-v1')).json.data;
  const i = pack.rules.findIndex((r) => r.ruleId === RULE);
  console.log('hoy           :', pick(pack.rules[i]), `pack v${pack.version}`);
  if (!APPLY) { console.log('\n(simulación; usar --apply para corregir)'); process.exit(0); }

  const r = pack.rules[i];
  pack.rules[i] = { ...r, metric: 'accumulator', condition: { ...r.condition, op: 'gte' } };
  const put = await req('PUT', '/api/rulepacks/cummins-pcc-v1', { rulepack: { packId: pack.packId, deviceType: pack.deviceType,
    version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules: pack.rules } });
  console.log('PUT →', put.status, put.status !== 200 ? put.raw.slice(0, 200) : '');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
