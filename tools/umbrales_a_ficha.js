// spec_textos_alarma_ficha · T3 (Qt2, firmado 2026-10-27; P1 de la biblioteca aprobado) — los
// umbrales FIJOS de algunas reglas pasan a la ficha, con su fuente. Mismo valor que hoy (la regla
// no cambia de comportamiento): solo pasa a seguir a la ficha y hereda sus textos.
//
//   docker exec -i node node - < tools/umbrales_a_ficha.js           → SIMULACIÓN
//   docker exec -i node node - --apply < tools/umbrales_a_ficha.js   → APLICA por la API:
//        1) agrega a la ficha los límites que faltan (PUT /api/equipmentsheet/:deviceType)
//        2) cambia la condición fija de cada regla por la referencia al límite (PUT /api/rulepacks/:packId)
// Datos: app/api/data/umbrales_ficha_t3.json. Cada cambio verifica la forma esperada (mismo valor y
// sentido); si la regla no está como se espera, NO la toca y lo informa.
const http = require('http');
const fs = require('fs');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
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
const dirOf = (op) => (op === 'lt' || op === 'lte' ? 'lt' : op === 'gt' || op === 'gte' ? 'gt' : op);

(async () => {
  const src = '/home/node/app/api/data/umbrales_ficha_t3.json';
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (err) { console.error(`No pude leer ${src}: ${err.message}`); process.exit(1); }

  // ── 1) Límites nuevos en las fichas ──
  const sheets = ((await req('GET', '/api/equipmentsheet')).json || {}).data || [];
  const porTipo = new Map();
  for (const l of cfg.limites) { if (!porTipo.has(l.deviceType)) porTipo.set(l.deviceType, []); porTipo.get(l.deviceType).push(l); }
  for (const [dt, lims] of porTipo) {
    const sh = sheets.find((s) => s.deviceType === dt);
    if (!sh) { console.log(`ficha ${dt}: NO existe — se omiten ${lims.length} límite(s)`); continue; }
    let n = 0;
    const variables = (sh.variables || []).map((v) => {
      const nuevos = lims.filter((l) => l.variable === v.name);
      if (!nuevos.length) return v;
      const limits = [...(v.limits || [])];
      for (const l of nuevos) {
        const ya = limits.find((x) => x.kind === l.kind && dirOf(x.op) === dirOf(l.op));
        if (ya) { console.log(`ficha ${dt}.${v.name} ${l.kind} ${l.op}: ya existe (${ya.op} ${ya.value}) — no se toca`); continue; }
        limits.push({ kind: l.kind, op: l.op, value: l.value, unit: l.unit, source: l.source });
        console.log(`ficha ${dt}.${v.name}: + ${l.kind} ${l.op} ${l.value} ${l.unit} · ${l.source.slice(0, 90)}`);
        n++;
      }
      return { ...v, limits };
    });
    const faltan = lims.filter((l) => !(sh.variables || []).some((v) => v.name === l.variable));
    faltan.forEach((l) => console.log(`ficha ${dt}: la variable ${l.variable} NO existe — se omite`));
    if (n && APPLY) {
      const put = await req('PUT', `/api/equipmentsheet/${encodeURIComponent(dt)}`, { newEquipmentSheet: { variables } });
      console.log(`PUT ficha ${dt} (${n} límite/s) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
      if (put.status !== 200) { console.log('Se detiene: sin la ficha no se pueden atar las reglas.'); process.exit(1); }
    }
  }

  // ── 2) Reglas: número fijo → referencia al límite ──
  const packs = ((await req('GET', '/api/rulepacks')).json || {}).data || [];
  let nPacks = 0;
  for (const p of packs) {
    const rules = (p.rules || []).map((x) => JSON.parse(JSON.stringify(x)));
    let cambios = 0;
    for (const r of rules) {
      const pedidos = cfg.reglas.filter((x) => x.ruleId === r.ruleId);
      for (const q of pedidos) {
        const igual = (c) => c && !c.limitRef && dirOf(c.op) === dirOf(q.op) && Number(c.value) === Number(q.value);
        let hecho = false;
        // D: condición propia
        if (r.condition && (r.deviceType || p.deviceType) === q.deviceType && r.variable === q.variable && igual(r.condition)) {
          r.condition = { op: r.condition.op, limitRef: q.kind, ...(r.condition.deadband != null ? { deadband: r.condition.deadband } : {}) };
          hecho = true;
        }
        // combinada: la hoja de esa medición
        const walk = (n) => {
          if (!n || hecho) return;
          if (Array.isArray(n.children)) { n.children.forEach(walk); return; }
          if (n.deviceType === q.deviceType && n.variable === q.variable && igual(n.condition)) {
            n.condition = { op: n.condition.op, limitRef: q.kind, ...(n.condition.deadband != null ? { deadband: n.condition.deadband } : {}) };
            hecho = true;
          }
        };
        if (!hecho && r.crossExpr) walk(r.crossExpr);
        console.log(hecho ? `[${p.packId}] ${r.ruleId}: ${q.deviceType}.${q.variable} ${q.op} ${q.value} fijo → límite ${q.kind} de la ficha`
          : `[${p.packId}] ${r.ruleId}: NO se toca — no hay condición ${q.deviceType}.${q.variable} ${q.op} ${q.value} con número fijo (¿ya está atada?)`);
        if (hecho) cambios++;
      }
    }
    if (!cambios) continue;
    nPacks++;
    if (APPLY) {
      const body = { rulepack: { packId: p.packId, deviceType: p.deviceType, version: (p.version || 1) + 1, description: p.description || '', canary: !!p.canary, rules } };
      const put = await req('PUT', `/api/rulepacks/${encodeURIComponent(p.packId)}`, body);
      console.log(`PUT ${p.packId} (${cambios} condición/es) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    }
  }
  console.log('\nQuedan con número fijo (no son límites del fabricante):');
  Object.entries(cfg.quedanFijos || {}).forEach(([k, v]) => console.log(`  - ${k}: ${v}`));
  console.log(`\n${nPacks} pack(s) ${APPLY ? 'actualizado(s)' : 'a actualizar (simulación: correr con --apply para escribir)'}. Después: tools/textos_fichas.js --apply para cargar los textos de los límites nuevos.`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
