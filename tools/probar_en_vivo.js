// Prueba EN VIVO de una regla (Franco 2026-10-19): fija un valor en un equipo del simulador,
// espera, y muestra qué hizo el motor (etapa en rulefsm + cambios de etapa + avisos). Al final
// suelta el valor (solo esa variable: /simulator/release). Va por la API (/api/simulator/*), camino productivo.
//
//   docker exec -i node node - <dId> <variable> <valor> [segundos] < tools/probar_en_vivo.js
//   ej.: docker exec -i node node - Z5tKK1rN fuel_level 10 90 < tools/probar_en_vivo.js
// Solo para equipos del SIMULADOR. Mientras corre, el equipo publica ese valor fijo.
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const mongoose = require(NM + 'mongoose');
const e = process.env;
const [dId, variable, rawVal, segStr] = process.argv.slice(2);
const SEG = Number(segStr) || 90;
if (!dId || !variable || rawVal === undefined) { console.error('uso: <dId> <variable> <valor> [segundos]'); process.exit(1); }
const value = isNaN(Number(rawVal)) ? rawVal : Number(rawVal);
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const api = (method, path, body) => new Promise((ok) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => ok({ status: res.statusCode, raw }));
  });
  r.on('error', (err) => ok({ status: 0, raw: err.message })); if (b) r.write(b); r.end();
});
const t = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const dev = await db.collection('devices').findOne({ dId });
  if (!dev) throw new Error(`no existe el equipo ${dId}`);
  const packs = await db.collection('rulepacks').find({}).toArray();
  const usa = (r) => r.variable === variable || JSON.stringify(r.crossExpr || {}).includes(`"${variable}"`) || JSON.stringify(r.inputs || []).includes(`"${variable}"`);
  const reglas = packs.flatMap((p) => (p.rules || []).filter((r) => usa(r)).map((r) => ({ ...r, packId: p.packId })));
  console.log(`${dev.name || dId} (${dev.deviceType}) · ${variable} = ${JSON.stringify(value)} durante ${SEG} s · ${reglas.length} regla(s) usan esa medición`);
  const desde = Date.now();
  const s = await api('POST', '/api/simulator/set', { dId, sensor: variable, value });
  if (s.status !== 200) throw new Error(`no se pudo fijar el valor: ${s.status} ${s.raw.slice(0, 200)}`);
  for (let i = 0; i < SEG; i += 15) { await sleep(Math.min(15, SEG - i) * 1000); process.stdout.write(`  … ${Math.min(i + 15, SEG)} s\n`); }
  const llegaron = await db.collection('data').countDocuments({ dId, variable, time: { $gte: desde } });
  console.log(`\nLecturas guardadas de ${variable} en la prueba: ${llegaron}`);
  for (const r of reglas) {
    const tr = await db.collection('ruletransitions').find({ ruleId: r.ruleId, ts: { $gte: new Date(desde) } }).sort({ ts: 1 }).toArray();
    const row = await db.collection('rulefsm').findOne({ ruleId: r.ruleId, $or: [{ dId }, { key: new RegExp(`^${r.ruleId}:`) }] });
    const av = await db.collection('notifications').countDocuments({ ruleId: r.ruleId, time: { $gte: desde }, kind: { $ne: 'resolve' } });
    console.log(`• ${r.label} [${r.ruleId}] (${r.packId}${r.enabled === false ? ', APAGADA' : ''}) · etapa ahora ${row ? row.step : 'E1 (reposo)'} · avisos ${av}`);
    tr.forEach((x) => console.log(`    ${t(new Date(x.ts).getTime())} ${x.from}→${x.to} valor ${JSON.stringify(x.value)} umbral ${JSON.stringify(x.thresholdUsed)}`));
    if (!tr.length) console.log('    (el motor no cambió de etapa)');
  }
  // Suelta SOLO esta variable (no reset del equipo: el reset vuelve el tanque a 75 % de golpe,
  // que el motor lee como una recarga).
  const rs = await api('POST', '/api/simulator/release', { dId, sensor: variable });
  console.log(rs.status === 200 ? `\nValor liberado: ${variable} vuelve a evolucionar desde ${JSON.stringify(value)}.` : `\n⚠ no se pudo liberar el valor (${rs.status}): hacé reset del equipo desde el simulador.`);
  process.exit(0);
})().catch(async (err) => { console.error('ERROR:', err.message); try { await api('POST', '/api/simulator/release', { dId, sensor: variable }); } catch (_) {} process.exit(1); });
