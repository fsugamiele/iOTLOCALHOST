// Diagnóstico de UNA alarma: qué guardó el motor, qué dice la regla hoy y qué pasó alrededor.
//   docker exec -i node node - <alarmId> < tools/ver_alarma.js > ver_alarma.txt
// Solo lectura. Horas en hora local (America/Argentina/Buenos_Aires) y UTC.
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const http = require('http');
const jwt = require(NM + 'jsonwebtoken');
const e = process.env;
const ID = process.argv.slice(2).find((a) => /^[0-9a-f]{24}$/i.test(a));
if (!ID) { console.error('Uso: docker exec -i node node - <alarmId de 24 hex> < tools/ver_alarma.js'); process.exit(1); }
const TZ = 'America/Argentina/Buenos_Aires';
const H = (ms) => (ms == null ? '—' : `${new Date(ms).toLocaleString('es-AR', { hour12: false, timeZone: TZ })} (UTC ${new Date(ms).toISOString().slice(11, 19)})`);
const J = (x) => JSON.stringify(x);
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '5m' });
const get = (path) => new Promise((ok) => {
  http.get({ host: 'localhost', port: Number(e.API_PORT || 3001), path, headers: { token: TOKEN } }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => { try { ok(JSON.parse(b)); } catch (_) { ok(null); } });
  }).on('error', () => ok(null));
});

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  console.log(`Ahora: ${H(Date.now())} · hora del contenedor node: ${new Date().toTimeString().slice(0, 17)}`);

  const n = await db.collection('notifications').findOne({ _id: new mongoose.Types.ObjectId(ID) });
  if (!n) { console.log(`No existe la alarma ${ID} en notifications.`); process.exit(0); }
  const { payload, ...resto } = n;
  console.log('\n== 1 · ALARMA GUARDADA ==');
  console.log(`saltó: ${H(n.time)}`);
  console.log(J(resto));
  if (payload) console.log('payload:', J(payload).slice(0, 1500));

  console.log('\n== 2 · REGLA HOY (pack en la base) ==');
  const pack = await db.collection('rulepacks').findOne({ 'rules.ruleId': n.ruleId });
  const rule = pack && (pack.rules || []).find((r) => r.ruleId === n.ruleId);
  if (!rule) console.log(`La regla ${n.ruleId} ya no está en ningún pack.`);
  else {
    const { meaning, steps, recommendation, ...motor } = rule;
    console.log(`pack ${pack.packId} v${pack.version} · actualizado ${H(pack.updatedAt ? new Date(pack.updatedAt).getTime() : null)}`);
    console.log(J(motor));
    console.log('textos:', J({ recommendation, meaning, steps }));
  }
  const otras = pack ? (pack.rules || []).filter((r) => r.ruleId !== n.ruleId && r.variable === (rule && rule.variable)) : [];
  if (otras.length) {
    console.log(`\nOtras reglas del pack sobre la misma medición (${rule.variable}):`);
    otras.forEach((r) => console.log(`  ${r.ruleId} «${r.label}» ${r.severity} · cond ${J(r.condition)} · espera ${r.graceSec || 0}s / cierre ${r.resolveGraceSec || 0}s · enabled ${r.enabled !== false}`));
  }

  console.log('\n== 3 · ESTADO DEL MOTOR (rulefsm) de las reglas de ese equipo ==');
  const fsm = await db.collection('rulefsm').find({ dId: n.dId }).toArray();
  fsm.forEach((x) => console.log(`  ${x.ruleId} · ${x.step} · abierta ${!!x.alarmOpen} · desde ${H(x.since)} · avisó ${H(x.firedAt)} · espera desde ${H(x.graceStart)} · confirmada ${!!x.acked} · lastCtx ${J(x.lastCtx).slice(0, 300)}`));
  if (!fsm.length) console.log('  (sin filas: todas en reposo)');

  const t0 = n.time - 30 * 60000, t1 = n.time + 30 * 60000;
  console.log(`\n== 4 · PASOS DEL MOTOR en ese equipo, de ${H(t0)} a ${H(t1)} ==`);
  const tr = await db.collection('ruletransitions').find({ dId: n.dId, ts: { $gte: new Date(t0), $lte: new Date(t1) } }).sort({ ts: 1 }).limit(300).toArray();
  tr.forEach((x) => console.log(`  ${H(new Date(x.ts).getTime())} ${x.ruleId} ${x.from}→${x.to} ${x.action || ''} valor=${J(x.value)} umbral=${J(x.thresholdUsed)} R=${J(x.receptivity).slice(0, 160)}`));
  if (!tr.length) console.log('  (sin pasos guardados: se conservan 30 días)');

  console.log('\n== 5 · LECTURAS alrededor (±15 min) ==');
  const vars = [...new Set([n.variable, rule && rule.variable, 'fault_code', 'intake_temp', 'intake_manifold_temp', 'coolant_temp', 'rpm'].filter(Boolean))];
  for (const v of vars) {
    const rows = await db.collection('data').find({ dId: n.dId, variable: v, time: { $gte: n.time - 15 * 60000, $lte: n.time + 15 * 60000 } }).sort({ time: 1 }).limit(400).toArray();
    if (!rows.length) { console.log(`  ${v}: sin lecturas`); continue; }
    // comprimido: solo los cambios de valor
    const cambios = []; let prev;
    rows.forEach((r) => { if (J(r.value) !== prev) { cambios.push(`${new Date(r.time).toLocaleTimeString('es-AR', { hour12: false, timeZone: TZ })}=${J(r.value)}`); prev = J(r.value); } });
    const dt = rows.length > 1 ? Math.round((rows[rows.length - 1].time - rows[0].time) / (rows.length - 1) / 1000) : 0;
    console.log(`  ${v}: ${rows.length} lecturas (cada ~${dt}s) · cambios: ${cambios.slice(0, 40).join('  ')}`);
  }
  const ult = await db.collection('data').find({ dId: n.dId, variable: (rule && rule.variable) || n.variable }).sort({ time: -1 }).limit(1).next();
  console.log(`  última lectura de ${(rule && rule.variable) || n.variable}: ${ult ? J(ult.value) + ' · ' + H(ult.time) : '—'}`);

  console.log('\n== 6 · OTRAS ALARMAS de ese equipo ese día (±6 h) ==');
  const al = await db.collection('notifications').find({ dId: n.dId, time: { $gte: n.time - 6 * 3600000, $lte: n.time + 6 * 3600000 } }).sort({ time: 1 }).limit(80).toArray();
  al.forEach((x) => console.log(`  ${H(x.time)} ${String(x._id)} ${x.kind || 'fire'} ${x.ruleId} «${x.label}» ${x.severity} valor=${J(x.value)} umbral=${J(x.thresholdUsed)} mode=${x.mode}`));

  console.log('\n== 7 · LO QUE MUESTRA EL DETALLE (API) ==');
  const d = await get(`/api/alarms/${ID}/detail`);
  const dd = d && (d.data || d);
  if (!dd) console.log('  sin respuesta');
  else {
    console.log('  rule:', J(dd.rule).slice(0, 1200));
    console.log('  conditions:', J(dd.conditions || (dd.v2 && dd.v2.conditions)).slice(0, 1500));
    console.log('  alarm:', J(dd.alarm).slice(0, 800));
    console.log('  fsm:', J(dd.fsm).slice(0, 600));
    // Lo que recibe el gráfico: por medición, qué mira la regla, el límite que se dibuja y el rango medido.
    console.log('  gráfico:');
    ((dd.v2 && dd.v2.series) || []).forEach((x) => {
      const vs = (x.points || []).map((q) => q.value).filter((q) => typeof q === 'number');
      console.log(`    ${x.dId} ${x.variable} (${x.unit || 'sin unidad'}, ${x.type || '?'}) · mira=${x.measure} · límite regla=${J(x.threshold)} · al avisar=${J(x.atFire)} · límites ficha=${J(x.limits)} · ${vs.length} puntos, de ${vs.length ? Math.min(...vs) : '—'} a ${vs.length ? Math.max(...vs) : '—'}`);
    });
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
