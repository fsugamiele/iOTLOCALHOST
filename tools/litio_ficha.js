// spec L1 (biblioteca de fallas, aprobado 2026-10-28) — carga en la ficha el valor de cada límite para
// plantas con baterías de LITIO (limits[].byBatteryTech.lifepo4). Lo usa el motor para los equipos con
// device.batteryTech = 'lifepo4' (cascada: equipo > perfil > ficha según batería > ficha).
//
//   docker exec -i node node - < tools/litio_ficha.js           → SIMULACIÓN
//   docker exec -i node node - --apply < tools/litio_ficha.js   → APLICA (PUT /api/equipmentsheet/:deviceType)
// Datos: app/api/data/litio_ficha.json. La tecnología de cada planta se elige en Dispositivos →
// «Parámetros de instalación» → «Baterías de la planta».
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
const dirOf = (op) => (op === 'lt' || op === 'lte' ? 'lt' : 'gt');
(async () => {
  const cfg = JSON.parse(fs.readFileSync('/home/node/app/api/data/litio_ficha.json', 'utf8'));
  const sheets = ((await req('GET', '/api/equipmentsheet')).json || {}).data || [];
  const devs = ((await req('GET', '/api/device')).json || {}).data || [];
  for (const dt of [...new Set(cfg.limites.map((l) => l.deviceType))]) {
    const sh = sheets.find((s) => s.deviceType === dt);
    if (!sh) { console.log(`ficha ${dt}: NO existe`); continue; }
    let n = 0;
    const variables = (sh.variables || []).map((v) => ({ ...v, limits: (v.limits || []).map((l) => {
      const q = cfg.limites.find((x) => x.deviceType === dt && x.variable === v.name && x.kind === l.kind && dirOf(x.op) === dirOf(l.op));
      if (!q) return l;
      const prev = l.byBatteryTech && l.byBatteryTech.lifepo4;
      if (prev && Number(prev.value) === Number(q.lifepo4)) { console.log(`ficha ${dt}.${v.name} ${l.kind} ${l.op}: litio ya en ${q.lifepo4}`); return l; }
      console.log(`ficha ${dt}.${v.name} ${l.kind} ${l.op} ${l.value} → con litio ${q.lifepo4} · ${q.source.slice(0, 90)}`);
      n++;
      return { ...l, byBatteryTech: { ...(l.byBatteryTech || {}), lifepo4: { value: q.lifepo4, source: q.source } } };
    }) }));
    if (n && APPLY) {
      const put = await req('PUT', `/api/equipmentsheet/${encodeURIComponent(dt)}`, { newEquipmentSheet: { variables } });
      console.log(`PUT ficha ${dt} (${n}) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    }
    const conTec = (Array.isArray(devs) ? devs : []).filter((d) => d.deviceType === dt);
    console.log(`equipos ${dt}: ${conTec.length} — con litio: ${conTec.filter((d) => d.batteryTech === 'lifepo4').map((d) => d.dId).join(', ') || 'ninguno (elegirlo en Dispositivos → Parámetros de instalación)'}`);
  }
  console.log('\nPendientes:'); (cfg.pendientes || []).forEach((p) => console.log('  - ' + p));
  console.log(APPLY ? '\nListo.' : '\nSimulación: correr con --apply para escribir.');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
