// Auditoría de umbrales vs fabricante 2026-10-20 (auditoria_umbrales_fabricante_2026-10-20.md §4/§5).
// Corrige reglas que la deriva (tools/deriva_reglas.js) mostró invertidas respecto de su versión
// firmada. Cada corrección tiene una clave; se aplican SOLO las claves pasadas.
// Va por la API (PUT /api/rulepacks/:packId, camino productivo, DEC-PROC-5). El edge recarga solo.
//
//   docker exec -i node node - < tools/fix_umbrales_auditoria.js                          → muestra todo
//   docker exec -i node node - --apply A1,A2,TR09,AR08,ACCEL < tools/fix_umbrales_auditoria.js
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const ai = process.argv.indexOf('--apply');
const APPLY = ai >= 0 ? new Set(String(process.argv[ai + 1] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
if (APPLY && !APPLY.size) { console.error('uso: --apply CLAVE[,CLAVE…]'); process.exit(1); }
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});
const mapLeaves = (n, fn) => (Array.isArray(n.children) ? { ...n, children: n.children.map((c) => mapLeaves(c, fn)) } : fn(n));
const sinValor = (c) => { const x = { ...c }; delete x.value; return x; };

// clave → { ruleId, por qué, fix(regla) → regla corregida o null si ya está bien }
const FIXES = {
  A1: { ruleId: 'cat-eltek-A1', motivo: 'bus DC baja: lt −52 → gt [ficha:warning] (−52), convención negativa firmada (DEC-REF-123)',
    fix: (r) => (r.condition && r.condition.op === 'gt' && r.condition.limitRef === 'warning' ? null : { ...r, condition: { ...sinValor(r.condition || {}), op: 'gt', limitRef: 'warning', deadband: 0.5 } }) },
  A2: { ruleId: 'cat-eltek-A2', motivo: 'bus DC crítica: lt −48 → gt [ficha:trip] (−48)',
    fix: (r) => (r.condition && r.condition.op === 'gt' && r.condition.limitRef === 'trip' ? null : { ...r, condition: { ...sinValor(r.condition || {}), op: 'gt', limitRef: 'trip', deadband: 0.5 } }) },
  TR09: { ruleId: 'cat-TR-09', motivo: 'cascada completa: hoja ELTEK lt −48 → gt −50 (spec_signo_bus_dc)',
    fix: (r) => { let cambio = false; const crossExpr = mapLeaves(r.crossExpr, (l) => { if (l.variable !== 'dc_bus_voltage') return l; const c = l.condition || {}; if (c.op === 'gt' && c.value === -50) return l; cambio = true; return { ...l, condition: { ...c, op: 'gt', value: -50 } }; }); return cambio ? { ...r, crossExpr } : null; } },
  AR08: { ruleId: 'cat-AR-08', motivo: 'sin ejercicio semanal: dutyCycle gt 0,1 % → lt 0,1 % (la versión original; gt avisa cuando SÍ hizo ejercicio)',
    fix: (r) => (r.condition && r.condition.op === 'lt' ? null : { ...r, condition: { ...(r.condition || {}), op: 'lt' } }) },
  ACCEL: { ruleId: 'eltek-accel-dc-bus-voltage', motivo: 'tensión DC empeora más rápido: mira la sobrecarga (lt) — la spec la deja retirada → apagar',
    fix: (r) => (r.enabled === false ? null : { ...r, enabled: false }) },
  M1C1: { ruleId: ['cummins-M1-mains-loss', 'cummins-C1-mains-loss-gen-no-start'], motivo: 'pérdida de AC / corte sin arranque: red < [ficha:warning] 198 V (subtensión) → < 100 V (versión original)',
    fix: (r) => { const set = (c) => (c.limitRef || c.value !== 100 ? { ...sinValor(c), op: 'lt', value: 100, limitRef: undefined } : null);
      if (r.type === 'cross') { let cambio = false; const crossExpr = mapLeaves(r.crossExpr, (l) => { if (l.variable !== 'mains_voltage') return l; const c = set(l.condition || {}); if (!c) return l; cambio = true; delete c.limitRef; return { ...l, condition: c }; }); return cambio ? { ...r, crossExpr } : null; }
      const c = set(r.condition || {}); if (!c) return null; delete c.limitRef; return { ...r, condition: c }; } },
  AR04: { ruleId: 'cat-AR-04', motivo: 'batería degradada en el arranque: espera 60 s > duración del arranque (~15 s) → nunca dispara; volver a 0 s',
    fix: (r) => (r.graceSec === 0 ? null : { ...r, graceSec: 0 }) },
};

(async () => {
  const list = await req('GET', '/api/rulepacks');
  if (list.status !== 200) throw new Error(`GET /api/rulepacks → ${list.status}`);
  const porRegla = new Map();
  for (const [k, f] of Object.entries(FIXES)) for (const id of [].concat(f.ruleId)) porRegla.set(id, k);
  let pend = 0, aplic = 0;
  for (const p0 of (list.json && list.json.data) || []) {
    const pack = ((await req('GET', `/api/rulepacks/${encodeURIComponent(p0.packId)}`)).json || {}).data;
    if (!pack) continue;
    let tocado = false;
    const rules = (pack.rules || []).map((r) => {
      const k = porRegla.get(r.ruleId); if (!k) return r;
      const nueva = FIXES[k].fix(r);
      if (!nueva) { console.log(`  ✓ ${k.padEnd(5)} ${r.ruleId}: ya está bien`); return r; }
      pend++;
      const va = APPLY && APPLY.has(k);
      console.log(`  ${va ? '→' : '·'} ${k.padEnd(5)} ${r.ruleId}: ${FIXES[k].motivo}${va ? '' : '  (no aplicada)'}`);
      if (!va) return r;
      tocado = true; aplic++; return nueva;
    });
    if (!tocado) continue;
    const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(pack.packId)}`, body);
    console.log(`  PUT ${pack.packId} → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  console.log(`\n── ${pend} corrección(es) pendientes · ${aplic} aplicadas${APPLY ? '' : ' (simulación; --apply CLAVES)'} ──`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
