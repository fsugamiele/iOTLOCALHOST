// Auditoría de umbrales vs fabricante — segunda tanda, firmada por Franco 2026-10-22:
//   ALT   — ficha GEN: tensión del alternador relativa a la tensión nominal de batería (P1).
//   DC09  — cat-DC-09 «Rectificador caliente»: 60 °C fijo → límite crítico de la ficha ELTEK (45 °C, PROVISORIO) (R10).
//   ACEITE— cummins-pcc-oil-life: cuenta solo con el motor en marcha (factor = rpm/1500) (R5).
//   SIFON — sifoneo del GEN en escalera: cat-CB-05 aviso (z<−3), gen-sifoneo-divergencia → «Sifoneo de
//           combustible» crítica con z<−5, GEN-sifoneo-motor-apagado apagada (duplicada).
// Va por la API (fichas y packs). Se aplican SOLO las claves pasadas.
//   docker exec -i node node - < tools/fix_umbrales_auditoria2.js                               → muestra
//   docker exec -i node node - --apply ALT,DC09,ACEITE,SIFON < tools/fix_umbrales_auditoria2.js
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const ai = process.argv.indexOf('--apply');
const APPLY = ai >= 0 ? new Set(String(process.argv[ai + 1] || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean)) : null;
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
const va = (k) => APPLY && APPLY.has(k);
const plain = (x) => JSON.parse(JSON.stringify(x));
const mapLeaves = (n, fn) => (Array.isArray(n.children) ? { ...n, children: n.children.map((c) => mapLeaves(c, fn)) } : fn(n));
const BATT_REL = { param: 'battery_nominal_v', base: 12 };

async function putPack(pack, rules) {
  const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
  const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(pack.packId)}`, body);
  console.log(`   PUT ${pack.packId} → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
}
async function editPack(packId, edits) {   // edits: [{ key, ruleId, fix(rule) → nueva | null }]
  const pack = ((await req('GET', `/api/rulepacks/${packId}`)).json || {}).data;
  if (!pack) { console.log(`· no existe el pack ${packId}`); return; }
  let tocado = false;
  const rules = pack.rules.map((r) => {
    const ed = edits.find((x) => x.ruleId === r.ruleId); if (!ed) return r;
    const n = ed.fix(r);
    if (!n) { console.log(`✓ ${ed.key.padEnd(6)} ${r.ruleId}: ya está bien`); return r; }
    console.log(`${va(ed.key) ? '→' : '·'} ${ed.key.padEnd(6)} ${r.ruleId}: ${ed.txt}${va(ed.key) ? '' : '  (no aplicada)'}`);
    if (!va(ed.key)) return r; tocado = true; return n;
  });
  for (const ed of edits) if (!pack.rules.some((r) => r.ruleId === ed.ruleId)) console.log(`· ${ed.key.padEnd(6)} ${ed.ruleId}: no está en ${packId}`);
  if (tocado) await putPack(pack, rules);
}

(async () => {
  // ALT — ficha GEN
  const gen = (((await req('GET', '/api/equipmentsheet')).json || {}).data || []).find((s) => s.deviceType === 'GEN');
  if (!gen) console.log('· no existe la ficha GEN');
  else {
    const vars = plain(gen.variables || []).map((v) => { delete v._id; return v; });
    const alt = vars.find((v) => v.name === 'alternator_voltage');
    const falta = alt && (alt.limits || []).some((l) => !l.relativeTo);
    if (!alt) console.log('· la ficha GEN no tiene alternator_voltage');
    else if (!falta) console.log('✓ ALT    ficha GEN: alternador ya relativo a la batería');
    else {
      console.log(`${va('ALT') ? '→' : '·'} ALT    ficha GEN: alternador 13,0 / 14,8 V pasa a relativo a la tensión nominal de batería (24 V → 26,0 / 29,6 V)${va('ALT') ? '' : '  (no aplicada)'}`);
      if (va('ALT')) {
        alt.limits = alt.limits.map((l) => (l.relativeTo ? l : { ...l, relativeTo: BATT_REL }));
        const put = await req('PUT', '/api/equipmentsheet/GEN', { newEquipmentSheet: { variables: vars } });
        console.log(`   PUT ficha GEN → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
      }
    }
  }
  // DC09
  await editPack('eltek-smartpack-v1', [{ key: 'DC09', ruleId: 'cat-DC-09', txt: 'temperatura > 60 °C fijo → > límite crítico de la ficha ELTEK (45 °C, PROVISORIO)',
    fix: (r) => (r.condition && r.condition.limitRef === 'trip' ? null : { ...r, condition: (() => { const c = { ...(r.condition || {}), op: 'gt', limitRef: 'trip' }; delete c.value; return c; })() }) }]);
  // ACEITE
  await editPack('cummins-pcc-v1', [{ key: 'ACEITE', ruleId: 'cummins-pcc-oil-life', txt: 'acumula horas solo con el motor en marcha (factor rpm/1500; detenido = 0). El acumulado se reinicia.',
    fix: (r) => { const p = r.mParams || {}; if (p.weightVariable === 'rpm' && p.weightFn === 'linear') return null;
      return { ...r, mParams: { ...p, weightVariable: 'rpm', weightFn: 'linear', weightRef: 1500, weightSlope: 1 / 1500, weightStep: undefined } }; } }]);
  // SIFON
  await editPack('gen-grupo-v1', [
    { key: 'SIFON', ruleId: 'gen-sifoneo-divergencia', txt: '«Sifoneo de combustible» crítica con «baje más de lo habitual» z < −5 (antes −1)',
      fix: (r) => { let ya = r.label === 'Sifoneo de combustible';
        const crossExpr = r.crossExpr && mapLeaves(r.crossExpr, (l) => { if (l.metric !== 'baseline') return l; const c = l.condition || {}; if (c.op === 'lt' && c.value === -5) return l; ya = false; return { ...l, condition: { ...c, op: 'lt', value: -5 } }; });
        return ya ? null : { ...r, label: 'Sifoneo de combustible', severity: 'critical', crossExpr }; } },
    { key: 'SIFON', ruleId: 'GEN-sifoneo-motor-apagado', txt: 'se apaga (duplicada de cat-CB-05)', fix: (r) => (r.enabled === false ? null : { ...r, enabled: false }) },
  ]);
  console.log(APPLY ? '\n── aplicado: el edge recarga solo ──' : '\n(simulación; --apply CLAVES)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
