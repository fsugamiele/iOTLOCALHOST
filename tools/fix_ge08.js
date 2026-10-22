// Franco 2026-10-22 — «Marcha inestable (Oscilación)» [cat-GE-08]: la pendiente ±15 saltaba en cada
// arranque y parada. Pasa a: dispersión (σ) de rpm en 10 min > 15 rpm Y grupo en marcha el 99 % o
// más de esos 10 min (excluye arranque y parada). Espera 3 min, cierre 1 min.
// Referencia: ISO 8528-5 G2 — banda de frecuencia en régimen 1,5 % (≈ 22 rpm p-p, σ ≈ 8 rpm).
// Va por la API (PUT /api/rulepacks/cummins-pcc-v1).
//   docker exec -i node node - < tools/fix_ge08.js            → simulación
//   docker exec -i node node - --apply < tools/fix_ge08.js    → aplica
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const APPLY = process.argv.includes('--apply');
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
  const pack = ((await req('GET', '/api/rulepacks/cummins-pcc-v1')).json || {}).data;
  if (!pack) throw new Error('no existe el pack cummins-pcc-v1');
  const i = pack.rules.findIndex((r) => r.ruleId === 'cat-GE-08');
  if (i < 0) { console.log('· cat-GE-08 no está en el pack'); process.exit(0); }
  const r0 = pack.rules[i];
  const ya = JSON.stringify(r0.crossExpr || {}).includes('"variance"') && JSON.stringify(r0.crossExpr || {}).includes('"dutyCycle"');
  if (ya) { console.log('✓ cat-GE-08 ya usa dispersión en marcha estable'); process.exit(0); }
  const first = (r0.crossExpr && r0.crossExpr.children && r0.crossExpr.children[0]) || {};
  const extra = first.pick ? { pick: first.pick } : {};
  const leaf = (o) => ({ deviceType: 'cummins-pcc', variable: 'rpm', measure: 'metric', ...extra, ...o });
  const nueva = {
    ...r0,
    type: 'cross', variable: 'rpm', severity: r0.severity || 'warning',
    crossExpr: { op: 'AND', children: [
      leaf({ metric: 'variance', mWindow: { durationSec: 600, minSamples: 10 }, condition: { op: 'gt', value: 15 } }),
      leaf({ metric: 'dutyCycle', mWindow: { durationSec: 600, minSamples: 2 }, condition: { op: 'gte', value: 99 } }),
    ] },
    graceSec: 180, resolveGraceSec: 60,
    meaning: 'Con el grupo en marcha estable (los últimos 10 min completos), las rpm se dispersan más de 15 rpm (σ): el regulador de velocidad está oscilando (“hunting”). La norma ISO 8528-5 (G2) admite una banda de ±0,75 % (≈ 22 rpm de pico a pico); esto es aproximadamente el doble.',
    recommendation: 'Revisar el regulador de velocidad (ganancias del gobernador), el actuador de combustible y el suministro de combustible.',
    steps: [
      'Ver en el detalle si la oscilación coincide con cambios de carga.',
      'Revisar filtros y presión de suministro de combustible (el Sense la mide).',
      'Pedir al técnico revisar las ganancias del gobernador electrónico y el actuador.',
    ],
  };
  console.log(`→ cat-GE-08: pendiente ±15 → σ(rpm, 10 min) > 15 rpm Y en marcha ≥ 99 % de los 10 min · espera 180 s${APPLY ? '' : '  (simulación; usar --apply)'}`);
  if (!APPLY) process.exit(0);
  const rules = pack.rules.slice(); rules[i] = nueva;
  const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
  const put = await req('PUT', `/api/rulepacks/${pack.packId}`, body);
  console.log(`PUT pack → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  process.exit(put.status === 200 ? 0 : 1);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
