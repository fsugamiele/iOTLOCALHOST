// spec_supervisor_confiabilidad_v2 (Qs7) — PROPONE la clase de cada regla para la confiabilidad y,
// con --apply, la guarda (solo en las reglas que todavía no tienen clase; lo ya clasificado a mano
// no se toca). Clases: equipo (falla: MTBF/MTTR) · red (disponibilidad del sitio) · seguridad ·
// combustible · operacion (eventos, no fallas). Las combinadas de "equipo" indican qué equipo falla.
// La propuesta sale de palabras clave del nombre: REVISAR la tabla antes de aplicar; las marcadas
// «?» son dudosas. Va por la API (PUT /api/rulepacks/:packId). Clasificar no cierra alarmas.
//   docker exec -i node node - < tools/clasificar_reglas.js            → muestra la propuesta
//   docker exec -i node node - --apply < tools/clasificar_reglas.js    → la guarda
//   docker exec -i node node - --apply cat-SEC-05=operacion cat-X=equipo:ATS < tools/clasificar_reglas.js
//        → aplica con correcciones (ruleId=clase o ruleId=equipo:tipoQueFalla)
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const e = process.env;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CLASES = ['equipo', 'red', 'seguridad', 'combustible', 'operacion'];
const OVR = {};
for (const a of args.filter((x) => x.includes('='))) {
  const [id, v] = a.split('='); const [c, t] = v.split(':');
  if (!CLASES.includes(c)) { console.error(`clase inválida en ${a} (usar ${CLASES.join(', ')})`); process.exit(1); }
  OVR[id] = { eventClass: c, failDeviceType: t || undefined };
}
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const GRUPOS = ['cummins-pcc', 'GEN'];

// Propuesta por palabras clave (orden = prioridad). dudosa = conviene que Franco la mire.
function proponer(r, pack) {
  const t = norm(`${r.label} ${r.ruleId}`);
  const tipos = new Set([pack.deviceType, r.deviceType, ...JSON.stringify(r.crossExpr || {}).match(/"deviceType":"[^"]+"/g)?.map((x) => x.slice(14, -1)) || []]);
  const grupo = [...tipos].find((x) => GRUPOS.includes(x)) || 'cummins-pcc';
  const has = (...w) => w.some((x) => t.includes(x));
  if (has('test')) return { c: 'operacion', why: 'regla de prueba', dudosa: true };
  if (has('robo de bater')) return { c: 'seguridad', why: 'robo de baterías' };
  if (has('deja de reportar')) return { c: 'operacion', why: 'comunicación del equipo con la plataforma' };
  if (has('retorno de red')) return { c: 'equipo', ft: 'ATS', why: 'no retransfiere con la red presente' };
  if (has('cambio de aceite')) return { c: 'operacion', why: 'mantenimiento' };
  if (has('gasoil', 'proyeccion')) return { c: 'combustible', why: 'combustible' };
  if (has('tension dc', 'dc-bus')) return { c: 'red', why: 'energía DC del sitio' };
  if (has('sin arranque del grupo', 'corriendo sin generar')) return { c: 'equipo', ft: grupo, why: 'el grupo no responde' };
  if (has('transferencia')) return { c: 'equipo', ft: 'ATS', why: 'falla del tablero de transferencia' };
  if (has('puerta', 'door', 'movimiento', 'pir', 'cobre', 'copper', 'cerco', 'fence', 'intrus', 'tamper', 'apertura', 'baliza', 'beacon', 'tierra', 'ground')) return { c: 'seguridad', why: 'intrusión / perímetro' };
  if (has('combustible', 'fuel', 'sifoneo', 'robo', 'autonomia', 'autonomy', 'tanque', 'caudal')) return { c: 'combustible', why: 'combustible', dudosa: has('caudalimetro', 'averiado') };
  if (has('no en automatico', 'derivacion', 'manual', 'ejercicio', 'service', 'mantenimiento', 'vida del aceite', 'vida de aceite', 'horas de marcha')) return { c: 'operacion', why: 'modo de operación / mantenimiento' };
  if (has('perdida de ac', 'corte de energia', 'red ', ' red', 'mains', 'subfrecuencia', 'sobrefrecuencia', 'cascada', 'bus dc critica', 'bus dc baja', 'desconexion por bateria', 'lvd', 'bateria en des')) return { c: 'red', why: 'red / energía del sitio', dudosa: has('bateria en des') };
  if (has('sala', 'shelter', 'temperatura ambiente')) return { c: 'operacion', why: 'ambiente del shelter', dudosa: true };
  if (has('comunicacion', 'enlace', 'sin datos')) return { c: 'equipo', why: 'pérdida de comunicación', dudosa: true };
  if (has('corriente de carga dc critica')) return { c: 'equipo', why: 'sobrecarga del rectificador', dudosa: true };
  return { c: 'equipo', why: 'falla del equipo (por defecto)' };
}

// Avisos de los últimos 90 días cuyas reglas ya no están en ningún pack (lectura directa de Mongo).
async function notifsBorradas(vivas) {
  const mongoose = require('/home/node/app/node_modules/mongoose');
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const rows = await mongoose.connection.db.collection('notifications').aggregate([
    { $match: { ruleId: { $nin: [null, ...vivas] }, time: { $gte: Date.now() - 90 * 86400000 }, kind: { $ne: 'resolve' } } },
    { $sort: { time: -1 } },
    { $group: { _id: '$ruleId', label: { $first: '$label' }, severity: { $first: '$severity' }, dId: { $first: '$dId' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  const devs = new Map((await mongoose.connection.db.collection('devices').find({}).project({ dId: 1, deviceType: 1 }).toArray()).map((d) => [d.dId, d.deviceType]));
  await mongoose.disconnect();
  return rows.map((r) => ({ ruleId: r._id, label: r.label || r._id, severity: r.severity, deviceType: devs.get(r.dId), n: r.n }));
}

(async () => {
  const packs = ((await req('GET', '/api/rulepacks')).json || {}).data || [];
  const cambios = new Map(); let n = 0, ya = 0;
  const SEV = { critical: 'CRÍT', warning: 'adv ', info: 'info' };
  for (const p of packs) {
    console.log(`\n${p.packId} (${p.deviceType})`);
    for (const [i, r] of (p.rules || []).entries()) {
      if (r.eventClass && !OVR[r.ruleId]) { ya++; console.log(`  = ${SEV[r.severity] || r.severity} ${r.ruleId.padEnd(38)} ${r.eventClass}${r.failDeviceType ? ':' + r.failDeviceType : ''} · ya clasificada · ${r.label}`); continue; }
      const pr = OVR[r.ruleId] ? { c: OVR[r.ruleId].eventClass, ft: OVR[r.ruleId].failDeviceType, why: 'indicada a mano' } : proponer(r, p);
      const cross = r.type === 'cross';
      const ft = pr.c === 'equipo' && cross ? pr.ft : (pr.c === 'equipo' ? pr.ft : undefined);
      n++;
      console.log(`  ${pr.dudosa ? '?' : '→'} ${SEV[r.severity] || r.severity} ${r.ruleId.padEnd(38)} ${(pr.c + (ft ? ':' + ft : '')).padEnd(22)} ${r.label}  (${pr.why})`);
      const list = cambios.get(p.packId) || []; list.push({ i, eventClass: pr.c, failDeviceType: ft }); cambios.set(p.packId, list);
    }
  }
  // Reglas que ya no existen pero dejaron avisos en los últimos 90 días: se clasifican en qa_config.
  const vivas = new Set(packs.flatMap((p) => (p.rules || []).map((r) => r.ruleId)));
  const cfgActual = ((await req('GET', '/api/qa/config')).json || {}).data || {};
  const hist = { ...(cfgActual.clasesHistoricas || {}) };
  const borradas = await notifsBorradas(vivas);
  let nh = 0;
  if (borradas.length) console.log('\nreglas borradas con avisos en los últimos 90 días');
  for (const b of borradas) {
    if (hist[b.ruleId] && !OVR[b.ruleId]) { console.log(`  = ${b.ruleId.padEnd(38)} ${hist[b.ruleId].eventClass} · ya clasificada · ${b.label}`); continue; }
    const pr = OVR[b.ruleId] ? { c: OVR[b.ruleId].eventClass, ft: OVR[b.ruleId].failDeviceType, why: 'indicada a mano' } : proponer({ label: b.label, ruleId: b.ruleId }, { deviceType: b.deviceType });
    nh++;
    console.log(`  ${pr.dudosa ? '?' : '→'} ${(SEV[b.severity] || b.severity || '').padEnd(4)} ${b.ruleId.padEnd(38)} ${(pr.c + (pr.ft ? ':' + pr.ft : '')).padEnd(22)} ${b.label} · ${b.n} aviso(s)  (${pr.why})`);
    hist[b.ruleId] = { eventClass: pr.c, ...(pr.ft ? { failDeviceType: pr.ft } : {}), label: b.label };
  }
  console.log(`\n${n} regla(s) a clasificar · ${ya} ya clasificada(s) · ${nh} borrada(s) a clasificar.${APPLY ? '' : '  (simulación; usar --apply, con correcciones ruleId=clase si hace falta)'}`);
  if (!APPLY) process.exit(0);
  if (nh) { const put = await req('PUT', '/api/qa/config', { clasesHistoricas: hist }); console.log(`PUT qa_config (reglas borradas: ${nh}) → ${put.status}`); }
  for (const p of packs) {
    const list = cambios.get(p.packId); if (!list) continue;
    const rules = p.rules.map((r) => ({ ...r }));
    for (const c of list) { rules[c.i].eventClass = c.eventClass; if (c.failDeviceType) rules[c.i].failDeviceType = c.failDeviceType; else delete rules[c.i].failDeviceType; }
    const body = { rulepack: { packId: p.packId, deviceType: p.deviceType, version: (p.version || 1) + 1, description: p.description || '', canary: !!p.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${p.packId}`, body);
    console.log(`PUT ${p.packId} → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
