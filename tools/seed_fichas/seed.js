'use strict';
// seed_fichas — crea el catálogo de fichas de equipo de Wanomi por la API
// (POST /equipmentsheet, validación Mongoose = path productivo). Idempotente:
// GET previo y saltea las que ya existen. No borra ni edita: para actualizar
// fichas existentes usar tools/sync_auditoria_p0/sync.js (PUT, DEC-REF-111). Fuente de las variables: cruce template ↔
// sensor-engine del simulador (DEC-REF-91/108/109, adenda bitácora #81-c).
//
// Auth sin password: firma un JWT con JWT_SECRET para el _id del superadmin
// (el middleware relee grants de DB → RBAC pasa). Patrón seed F3.
//
// Uso:
//   ADMIN_ID=<_id de un usuario superadmin> \
//   node tools/seed_fichas/seed.js
//   # ADMIN_ID por defecto = admin@wanomi.com en dev; obtenerlo con:
//   #   db.users.findOne({email:"admin@wanomi.com"},{_id:1})
//   # API_HOST/API_PORT overridean el destino (default localhost:3001).
const fs = require('fs');
const http = require('http');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const jwt = require(path.join(REPO, 'app/node_modules/jsonwebtoken'));

const env = fs.readFileSync(path.join(REPO, 'app/.env'), 'utf8');
const JWT_SECRET = (env.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const ADMIN_ID = process.env.ADMIN_ID || '6a32e105be5ca779169754af';   // dev: admin@wanomi.com
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);

const token = jwt.sign({ userData: { _id: ADMIN_ID, email: 'admin@wanomi.com' } }, JWT_SECRET, { expiresIn: '10m' });

// Auditoría 2026-10-14 — el catálogo vive en fichas.js (fuente única, también
// lo usa tools/sync_auditoria_p0/sync.js para la base productiva).
const { FICHAS } = require('./fichas');

function call(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { token };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ host: API_HOST, port: API_PORT, path: '/api' + p, method, headers }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({ code: res.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ code: 'ERR', body: e.message }));
    if (data) req.write(data); req.end();
  });
}

(async () => {
  const existing = await call('GET', '/equipmentsheet');
  let have = [];
  try { have = (JSON.parse(existing.body).data || []).map((f) => f.deviceType); } catch (e) {}
  for (const f of FICHAS) {
    if (have.includes(f.deviceType)) { console.log(`skip   ${f.deviceType} (ya existe)`); continue; }
    const r = await call('POST', '/equipmentsheet', { newEquipmentSheet: f });
    console.log(`${r.code === 200 ? 'create' : 'FAIL  '} ${f.deviceType} (${f.variables.length} vars) ${r.code === 200 ? '' : r.body.slice(0, 140)}`);
  }
})();
