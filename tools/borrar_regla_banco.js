// Auditoría del simulador 2026-10-20 §3 — Franco 2026-10-22 "avanza": borrar del pack de pruebas
// «banco-conformidad» la regla suelta «BATERIA EN DESSCARGA» [GEN-sifoneo-de-combustible]
// (mide un salto de presión de aceite ≥ 8: saltaba en cada arranque y sus avisos se mezclaban
// con los reales). Va por la API (PUT /api/rulepacks/banco-conformidad).
//
//   docker exec -i node node - < tools/borrar_regla_banco.js            → simulación
//   docker exec -i node node - --apply < tools/borrar_regla_banco.js    → aplica
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const APPLY = process.argv.includes('--apply');
const RULE = 'GEN-sifoneo-de-combustible';
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});

(async () => {
  const pack = ((await req('GET', '/api/rulepacks/banco-conformidad')).json || {}).data;
  if (!pack) { console.log('No existe el pack banco-conformidad: nada que borrar.'); process.exit(0); }
  const r = (pack.rules || []).find((x) => x.ruleId === RULE);
  if (!r) { console.log(`✓ ${RULE} ya no está en banco-conformidad`); process.exit(0); }
  console.log(`→ borrar «${r.label}» [${RULE}] de banco-conformidad${APPLY ? '' : ' (simulación; usar --apply)'}`);
  if (!APPLY) process.exit(0);
  const rules = pack.rules.filter((x) => x.ruleId !== RULE);
  const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
  const put = await req('PUT', `/api/rulepacks/${pack.packId}`, body);
  console.log(`PUT pack → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  process.exit(put.status === 200 ? 0 : 1);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
