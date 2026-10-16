// spec_grafcet_g1b (DEC-REF-146 · Qb3) — marca reset_behavior:'manual' en las reglas
// que cierran por acción humana: salto abrupto (stepJump, robo) y vida de aceite
// (accumulator). Va por la API (PUT /api/rulepacks/:packId, camino productivo,
// DEC-PROC-5) con un JWT firmado con JWT_SECRET — mismo patrón que seed_rulepacks_f3.
//
//   node tools/set_reset_behavior.js            → simulación (no escribe)
//   node tools/set_reset_behavior.js --apply    → marca 'manual'
//   node tools/set_reset_behavior.js --revert   → vuelve esas reglas a 'auto'
//
// Correr dentro del contenedor node (tiene JWT_SECRET y la API en localhost:3001):
//   docker exec -i node node - --apply < tools/set_reset_behavior.js

const http = require('http');
// JWT_SECRET y API_PORT viven en app/.env (los carga la app con dotenv, no el contenedor).
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }

const API_HOST    = process.env.API_HOST  || 'localhost';
const API_PORT    = parseInt(process.env.API_PORT || '3001', 10);
const JWT_SECRET  = process.env.JWT_SECRET;
const ADMIN_ID    = process.env.ADMIN_ID    || '6a32e105be5ca779169754af';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@wanomi.com';
const MANUAL_METRICS = ['stepJump', 'accumulator'];   // Qb3 firmada

const APPLY  = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
if (!JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: ADMIN_ID, email: ADMIN_EMAIL } }, JWT_SECRET, { expiresIn: '10m' });

function req(method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const opts = { host: API_HOST, port: API_PORT, method, path, headers: { token: TOKEN, 'Content-Type': 'application/json' } };
    if (body) opts.headers['Content-Length'] = body.length;
    const r = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const target = REVERT ? 'auto' : 'manual';
  const list = await req('GET', '/api/rulepacks');
  if (list.status !== 200) { console.error('GET /api/rulepacks →', list.status, list.raw.slice(0, 200)); process.exit(1); }
  const packs = (list.json && list.json.data) || [];
  let total = 0;
  for (const p0 of packs) {
    const full = await req('GET', `/api/rulepacks/${encodeURIComponent(p0.packId)}`);
    const pack = full.json && full.json.data;
    if (!pack) continue;
    const changed = [];
    const rules = (pack.rules || []).map((r) => {
      if (r.type !== 'M' || !MANUAL_METRICS.includes(r.metric)) return r;
      if ((r.reset_behavior || 'auto') === target) return r;
      changed.push(`${r.ruleId} (${r.metric}): ${r.reset_behavior || 'auto'} → ${target}`);
      return { ...r, reset_behavior: target };
    });
    if (!changed.length) continue;
    total += changed.length;
    console.log(`\n${pack.packId}:`); changed.forEach((c) => console.log('  ' + c));
    if (!APPLY && !REVERT) continue;
    const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1,
      description: pack.description || '', canary: !!pack.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(pack.packId)}`, body);
    console.log(`  PUT → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 200) : ''}`);
  }
  console.log(`\n── ${total} regla(s) ${APPLY || REVERT ? 'actualizadas' : 'a cambiar (simulación; usar --apply)'} ──`);
})().catch((e) => { console.error(e.message); process.exit(1); });
