// Franco 2026-10-22 — alarmas que quedaron ABIERTAS en la lista aunque el motor ya las cerró:
// el cierre salió con OTRO equipo (defecto de las combinadas, corregido en el motor: QA I1).
// Huérfana = pareja ruleId+dId cuyo último evento es un aviso, mientras el motor (rulefsm) NO
// tiene esa alarma abierta en ese equipo. A cada una se le agrega su cierre real
// (kind:'resolve', reason:'orphan-closed', mode:'resolve-by-cleanup'). No borra nada y no toca
// el estado del motor: se puede correr con el edge andando.
//
//   docker exec -i node node - < tools/cerrar_alarmas_huerfanas.js            → solo muestra
//   docker exec -i node node - --apply < tools/cerrar_alarmas_huerfanas.js    → cierra
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
  const tipo = new Map();
  for (const p of await db.collection('rulepacks').find({}).project({ 'rules.ruleId': 1, 'rules.type': 1 }).toArray()) for (const r of (p.rules || [])) tipo.set(r.ruleId, r.type);
  const fsm = await db.collection('rulefsm').find({}).toArray();
  const abiertaEn = (ruleId, dId, siteId) => fsm.some((r) => r.ruleId === ruleId && r.alarmOpen &&
    (tipo.get(ruleId) === 'cross' ? (r.key === `${ruleId}:${siteId}` && (!r.dId || r.dId === dId)) : (r.key === `${ruleId}:${dId}` || r.dId === dId)));

  const groups = await notifs.aggregate([
    { $match: { ruleId: { $ne: null } } },
    { $sort: { time: -1 } },
    { $group: { _id: { ruleId: '$ruleId', dId: '$dId' }, last: { $first: '$$ROOT' } } },
    { $match: { 'last.kind': { $ne: 'resolve' } } },
    { $sort: { 'last.time': 1 } },
  ]).toArray();
  const fmt = (t) => new Date(t).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const now = Date.now();
  let n = 0;
  for (const g of groups) {
    const l = g.last;
    if (abiertaEn(l.ruleId, l.dId, l.siteId)) continue;   // el motor la tiene abierta: es real
    n++;
    console.log(`${fmt(l.time)} · ${l.siteId || '—'} · ${l.deviceName || l.dId} · ${l.label || l.ruleId} — el motor ya no la tiene abierta en este equipo`);
    if (!APPLY) continue;
    await notifs.insertOne({
      userId: l.userId || 'edge', dId: l.dId, deviceName: l.deviceName || l.dId,
      topic: 'api/cleanup-close', value: typeof l.value === 'number' ? l.value : 0,
      variable: l.variable || '', variableFullName: l.variableFullName || '',
      ruleId: l.ruleId, inferenceId: l.inferenceId, label: l.label, severity: l.severity,
      recommendation: 'Cerrada por limpieza: el motor ya la había cerrado, pero el cierre se registró en otro equipo.',
      siteId: l.siteId, reason: 'orphan-closed', source: 'api', mode: 'resolve-by-cleanup',
      thresholdUsed: l.thresholdUsed != null ? l.thresholdUsed : undefined, unit: l.unit || '',
      correlationParent: l.correlationParent || null, kind: 'resolve', readed: false, time: now,
    });
  }
  console.log(`\nAlarmas huérfanas: ${n}${APPLY ? ' · CERRADAS' : ' (simulación; usar --apply para cerrarlas)'}`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
