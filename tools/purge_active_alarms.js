// Borra de Mongo TODAS las alarmas activas de la consola (pedido de Franco, 2026-10-15).
// Alarma activa = pareja ruleId+dId cuyo último evento no es 'resolve'. Se borran los eventos
// del episodio abierto (posteriores al último resolve) y las instancias GRAFCET abiertas
// (rulefsm alarmOpen:true). El historial ya cerrado NO se toca.
//
// Correr con el edge DETENIDO (tiene las instancias en memoria y las volvería a escribir):
//   docker stop wanomi-edge
//   docker exec -i node node - < tools/purge_active_alarms.js            → solo muestra
//   docker exec -i node node - --apply < tools/purge_active_alarms.js    → borra
//   docker start wanomi-edge
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const APPLY = process.argv.includes('--apply');
const e = process.env;

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const notifs = db.collection('notifications');

  const groups = await notifs.aggregate([
    { $match: { ruleId: { $ne: null } } },
    { $sort: { time: -1 } },
    { $group: { _id: { ruleId: '$ruleId', dId: '$dId' }, lastKind: { $first: '$kind' } } },
    { $match: { lastKind: { $ne: 'resolve' } } },
  ]).toArray();

  let total = 0;
  for (const g of groups) {
    const { ruleId, dId } = g._id;
    const lastRes = await notifs.find({ ruleId, dId, kind: 'resolve' }).sort({ time: -1 }).limit(1).next();
    const filter = { ruleId, dId, ...(lastRes ? { time: { $gt: lastRes.time } } : {}) };
    const n = await notifs.countDocuments(filter);
    total += n;
    console.log(`${ruleId} · ${dId}: ${n} evento(s)`);
    if (APPLY) await notifs.deleteMany(filter);
  }
  const fsmOpen = await db.collection('rulefsm').countDocuments({ alarmOpen: true });
  console.log(`\nAlarmas activas: ${groups.length} · eventos: ${total} · instancias GRAFCET abiertas: ${fsmOpen}`);
  if (APPLY) {
    await db.collection('rulefsm').deleteMany({ alarmOpen: true });
    console.log('── BORRADO ──');
  } else {
    console.log('(simulación; usar --apply para borrar)');
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
