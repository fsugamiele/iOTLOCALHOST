// Franco 2026-10-19 (opción A): "fuera de lo habitual" (métrica baseline) compara el desvío CON
// SIGNO. Las reglas de pérdida de combustible estaban con «mayor que» → solo detectaban subidas
// (recargas). Esta herramienta las pasa a «baje más de lo habitual»: condition {op:'lt', value:−|v|}.
// Toca solo el sentido de la condición baseline de las reglas de la lista. Va por la API
// (PUT /api/rulepacks/:packId, camino productivo, DEC-PROC-5).
//
//   docker exec -i node node - < tools/fix_baseline_direccion.js            → simulación
//   docker exec -i node node - --apply < tools/fix_baseline_direccion.js    → aplica
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const APPLY = process.argv.includes('--apply');
const RULES = ['cat-CB-05', 'GEN-sifoneo-motor-apagado', 'cummins-pcc-sifoneo-divergencia'];
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});
const abajo = (c) => ({ ...c, op: 'lt', value: -Math.abs(Number(c.value)) });

(async () => {
  const list = await req('GET', '/api/rulepacks');
  if (list.status !== 200) throw new Error(`GET /api/rulepacks → ${list.status}`);
  let total = 0;
  for (const p0 of (list.json && list.json.data) || []) {
    const full = await req('GET', `/api/rulepacks/${encodeURIComponent(p0.packId)}`);
    const pack = full.json && full.json.data;
    if (!pack) continue;
    const cambios = [];
    const rules = (pack.rules || []).map((r) => {
      if (!RULES.includes(r.ruleId)) return r;
      if (r.type === 'M' && r.metric === 'baseline' && r.condition && ['gt', 'gte'].includes(r.condition.op)) {
        cambios.push(`${r.label} [${r.ruleId}]: ${r.condition.op} ${r.condition.value} → lt ${-Math.abs(Number(r.condition.value))}`);
        return { ...r, condition: abajo(r.condition) };
      }
      if (r.type === 'cross' && r.crossExpr) {
        const walk = (n) => {
          if (Array.isArray(n.children)) return { ...n, children: n.children.map(walk) };
          if (n.measure === 'metric' && n.metric === 'baseline' && n.condition && ['gt', 'gte'].includes(n.condition.op)) {
            cambios.push(`${r.label} [${r.ruleId}] ${n.leafId || ''} ${n.variable}: ${n.condition.op} ${n.condition.value} → lt ${-Math.abs(Number(n.condition.value))}`);
            return { ...n, condition: abajo(n.condition) };
          }
          return n;
        };
        return { ...r, crossExpr: walk(r.crossExpr) };
      }
      return r;
    });
    if (!cambios.length) continue;
    total += cambios.length;
    console.log(`\n${pack.packId}:`); cambios.forEach((c) => console.log('  ' + c));
    if (!APPLY) continue;
    const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1,
      description: pack.description || '', canary: !!pack.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(pack.packId)}`, body);
    console.log(`  PUT → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 200) : ''}`);
  }
  console.log(`\n── ${total} condición(es) ${APPLY ? 'corregidas: el edge recarga solo' : 'a corregir (simulación; usar --apply)'} ──`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
