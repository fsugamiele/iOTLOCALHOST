// Verificación G1b: última alarma de vida de aceite → qué recibe la página de detalle.
//   docker exec -i node node - < tools/check_oil_detail.js
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const mongoose = require(NM + 'mongoose');

const TOKEN = jwt.sign({ userData: { _id: process.env.ADMIN_ID || '6a32e105be5ca779169754af',
  email: process.env.ADMIN_EMAIL || 'admin@wanomi.com' } }, process.env.JWT_SECRET, { expiresIn: '5m' });

function get(path) {
  return new Promise((ok, ko) => {
    http.get({ host: 'localhost', port: parseInt(process.env.API_PORT || '3001', 10), path, headers: { token: TOKEN } }, (res) => {
      let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => ok({ status: res.statusCode, body: b }));
    }).on('error', ko);
  });
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const n = await mongoose.connection.db.collection('notifications')
    .find({ ruleId: /oil-life/, kind: { $ne: 'resolve' } }).sort({ time: -1 }).limit(1).next();
  if (!n) { console.log('No hay alarmas de vida de aceite.'); process.exit(0); }
  console.log('Alarma:', String(n._id), n.ruleId, n.dId, new Date(n.time).toISOString());
  const r = await get(`/api/alarms/${n._id}/detail`);
  console.log('HTTP', r.status);
  let j = null; try { j = JSON.parse(r.body); } catch (_) {}
  const d = j && (j.data || j);
  console.log('rule =', JSON.stringify(d && d.rule));
  console.log('fsm  =', JSON.stringify(d && d.fsm));
  const fsm = await mongoose.connection.db.collection('rulefsm').find({ ruleId: n.ruleId }).toArray();
  console.log('rulefsm =', JSON.stringify(fsm.map((x) => ({ key: x.key, step: x.step, alarmOpen: x.alarmOpen, acked: x.acked }))));
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
