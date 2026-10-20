// spec_sim_cascada_energia §5 (Franco 2026-10-20) — lleva a la base las variables del Wanomi
// Sense sobre el grupo: las AGREGA a la ficha GEN y a las plantillas del GEN (no quita nada).
// Va por la API (PUT /api/equipmentsheet/GEN y PUT /api/template), camino productivo.
// Definiciones: tools/device_simulator/lib/sense_gen_vars.js (fuente única).
//
//   docker exec -i node node - < tools/sync_sense_gen.js            → simulación
//   docker exec -i node node - --apply < tools/sync_sense_gen.js    → aplica
// Después: docker restart wanomi-sim (los equipos simulados toman la plantilla nueva).
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const { SENSE_GEN_WIDGETS, SENSE_GEN_SHEET_VARS } = require('/home/node/tools/device_simulator/lib/sense_gen_vars.js');
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
const plain = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  // 1 · Ficha GEN: agregar las variables que falten (las existentes no se tocan).
  const sh = await req('GET', '/api/equipmentsheet');
  const sheets = (sh.json && sh.json.data) || [];
  const gen = sheets.find((s) => s.deviceType === 'GEN');
  if (!gen) throw new Error('no existe la ficha GEN');
  const tiene = new Set((gen.variables || []).map((v) => v.name));
  const nuevasFicha = SENSE_GEN_SHEET_VARS.filter((v) => !tiene.has(v.name));
  console.log(`Ficha GEN: ${nuevasFicha.length ? 'agrega ' + nuevasFicha.map((v) => v.name).join(', ') : 'ya tiene todas'}`);
  if (APPLY && nuevasFicha.length) {
    const variables = plain(gen.variables || []).map((v) => { delete v._id; return v; }).concat(nuevasFicha);
    const put = await req('PUT', '/api/equipmentsheet/GEN', { newEquipmentSheet: { variables } });
    console.log(`  PUT ficha → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    if (put.status !== 200) process.exit(1);
  }
  // 2 · Plantillas del GEN: agregar los widgets que falten.
  const tl = await req('GET', '/api/template');
  const tpls = ((tl.json && tl.json.data) || []).filter((t) => t.deviceType === 'GEN');
  if (!tpls.length) console.log('No hay plantillas con tipo GEN.');
  for (const t of tpls) {
    const vars = new Set((t.widgets || []).map((w) => w.variable));
    const nuevos = SENSE_GEN_WIDGETS.filter((w) => !vars.has(w.variable));
    console.log(`Plantilla «${t.name}»: ${nuevos.length ? 'agrega ' + nuevos.map((w) => w.variable).join(', ') : 'ya tiene todas'}`);
    if (!APPLY || !nuevos.length) continue;
    const template = plain(t); delete template._id; delete template.__v;
    template.widgets = template.widgets.concat(nuevos);
    const put = await req('PUT', '/api/template', { templateId: t._id, template });
    console.log(`  PUT plantilla → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  console.log(APPLY ? '\n── aplicado: reiniciá wanomi-sim para que los equipos simulados publiquen las variables nuevas ──' : '\n(simulación; usar --apply)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
