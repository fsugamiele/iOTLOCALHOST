// Cierra las alarmas ACTIVAS cuyo aviso tiene más de N horas (pedido de Franco, 2026-10-19:
// "las que tienen más de seis horas"; eligió cerrarlas, no borrarlas).
// Alarma activa = pareja ruleId+dId cuyo último evento no es 'resolve'. A cada una se le agrega
// un cierre real (kind:'resolve', reason:'cleanup-closed', mode:'resolve-by-cleanup'): sale de
// activas y su historia queda completa. También se quita su instancia GRAFCET abierta (rulefsm),
// para que el edge no la siga dando por abierta. Nada se borra de notifications.
//
// Correr con el edge DETENIDO (tiene las instancias en memoria y las volvería a escribir):
//   docker stop wanomi-edge
//   docker exec -i node node - < tools/cerrar_alarmas_viejas.js                 → solo muestra
//   docker exec -i node node - --apply < tools/cerrar_alarmas_viejas.js         → cierra
//   docker exec -i node node - --apply --horas 12 < tools/cerrar_alarmas_viejas.js
//   docker start wanomi-edge
// Si la condición sigue presente, el edge la vuelve a avisar al arrancar (después de la espera).
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const APPLY = process.argv.includes('--apply');
const hi = process.argv.indexOf('--horas');
const HORAS = hi > 0 ? Number(process.argv[hi + 1]) : 6;
const e = process.env;

(async () => {
  if (!(HORAS > 0)) throw new Error('--horas tiene que ser un número mayor que cero');
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const notifs = db.collection('notifications');
  const now = Date.now();
  const limite = now - HORAS * 3600000;

  const groups = await notifs.aggregate([
    { $match: { ruleId: { $ne: null } } },
    { $sort: { time: -1 } },
    { $group: { _id: { ruleId: '$ruleId', dId: '$dId' }, last: { $first: '$$ROOT' } } },
    { $match: { 'last.kind': { $ne: 'resolve' }, 'last.time': { $lt: limite } } },
    { $sort: { 'last.time': 1 } },
  ]).toArray();

  const fmt = (t) => new Date(t).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  let fsmN = 0;
  for (const g of groups) {
    const l = g.last;
    const horas = Math.round((now - l.time) / 360000) / 10;
    console.log(`${fmt(l.time)} · ${horas} h · ${l.siteId || '—'} · ${l.deviceName || l.dId} · ${l.label || l.ruleId}`);
    if (!APPLY) continue;
    await notifs.insertOne({
      userId: l.userId || 'edge', dId: l.dId, deviceName: l.deviceName || l.dId,
      topic: 'api/cleanup-close', value: typeof l.value === 'number' ? l.value : 0,
      variable: l.variable || '', variableFullName: l.variableFullName || '',
      ruleId: l.ruleId, inferenceId: l.inferenceId, label: l.label, severity: l.severity,
      recommendation: `Cerrada por limpieza: llevaba más de ${HORAS} h abierta.`,
      siteId: l.siteId, reason: 'cleanup-closed', source: 'api', mode: 'resolve-by-cleanup',
      thresholdUsed: l.thresholdUsed != null ? l.thresholdUsed : undefined, unit: l.unit || '',
      correlationParent: l.correlationParent || null, kind: 'resolve', readed: false, time: now,
    });
    const r = await db.collection('rulefsm').deleteMany({ ruleId: l.ruleId, alarmOpen: true,
      $or: [{ dId: l.dId }, { key: `${l.ruleId}:${l.siteId}` }] });
    fsmN += r.deletedCount || 0;
  }
  console.log(`\nAlarmas activas con más de ${HORAS} h: ${groups.length}`);
  if (APPLY) console.log(`── CERRADAS: ${groups.length} · instancias GRAFCET quitadas: ${fsmN} ──`);
  else console.log('(simulación; usar --apply para cerrarlas)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
