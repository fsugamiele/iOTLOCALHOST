'use strict';
// Banco de conformidad — utilidades compartidas (B1 en adelante). Camino productivo (DEC-PROC-5):
// reglas por PUT /api/rulepacks, fichas por PUT /api/equipmentsheet, estímulo por
// POST /api/simulator/set (+ stop/resume_publishing por el tópico de control del simulador),
// lectura de ruletransitions / rulefsm / notifications. El banco NO evalúa reglas: observa.
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const mongoose = require(NM + 'mongoose');
const mqtt = require(NM + 'mqtt');

const e = process.env;
const PACK = 'banco-conformidad';
const GRACE = 30, CLOSE = 30, TICK = 5;
const SITE = e.SITE_ID;
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } },
  e.JWT_SECRET, { expiresIn: '3h' });

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const now = () => Date.now();
const fmt = (ms) => new Date(ms).toISOString().slice(11, 19);
const log = (...a) => console.log(`[${fmt(now())}]`, ...a);

function api(method, path, obj) {
  return new Promise((ok, ko) => {
    const body = obj ? Buffer.from(JSON.stringify(obj)) : null;
    const h = { token: TOKEN, 'Content-Type': 'application/json' };
    if (body) h['Content-Length'] = body.length;
    const r = http.request({ host: 'localhost', port: parseInt(e.API_PORT || '3001', 10), method, path: '/api' + path, headers: h }, (res) => {
      let b = ''; res.on('data', (c) => (b += c));
      res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) {} ok({ status: res.statusCode, json: j, raw: b }); });
    });
    r.on('error', ko); if (body) r.write(body); r.end();
  });
}

let db, mq;
async function connect() {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  db = mongoose.connection.db;
  mq = mqtt.connect('mqtt://' + e.EMQX_API_HOST, { port: 1883, username: e.EMQX_NODE_SUPERUSER_USER, password: e.EMQX_NODE_SUPERUSER_PASSWORD, clientId: 'banco_' + Math.round(Math.random() * 1e6) });
  await new Promise((ok, ko) => { mq.once('connect', ok); mq.once('error', ko); setTimeout(() => ko(new Error('MQTT sin conexión')), 10000); });
  return db;
}
const getDb = () => db;
const close = () => { try { mq.end(); } catch (_) {} };

const trans = async (ruleId, since) => (await db.collection('ruletransitions')
  .find({ ruleId, ts: { $gte: new Date(since) } }).sort({ ts: 1, _id: 1 }).toArray());
const notifs = async (ruleId, since) => (await db.collection('notifications')
  .find({ ruleId, time: { $gte: since } }).sort({ time: 1, _id: 1 }).toArray());
const fsmRow = async (key) => db.collection('rulefsm').findOne({ siteId: SITE, key });
const steps = (ts) => ts.map((t) => `${t.from}→${t.to}${t.action ? '(' + t.action + ')' : ''}`).join(' · ') || '(sin transiciones)';
const fires = (ns) => ns.filter((n) => (n.kind || 'fire') === 'fire' && n.severity !== 'info');
const resolves = (ns) => ns.filter((n) => n.kind === 'resolve');

const RESULTS = [];
function result(c, estado, que, evidencia) {
  RESULTS.push({ c, estado, que, evidencia });
  const icon = { VERDE: '✓', ROJO: '✗', OBSERVADO: '◐' }[estado] || '?';
  log(`${icon} ${c} ${estado} — ${que}${evidencia ? '\n           evidencia: ' + evidencia : ''}`);
}

function mqttCmd(dId, command, extra = {}) {
  return new Promise((ok, ko) => mq.publish(`simulator/${dId}/control`, JSON.stringify({ command, ...extra }), { qos: 1 }, (err) => err ? ko(err) : ok()));
}
async function setVal(dId, variable, value) {
  let r;
  // El cliente MQTT del backend puede estar reconectando: reintento corto y visible (no es fallo de la regla).
  for (let i = 0; i < 6; i++) {
    r = await api('POST', '/simulator/set', { dId, sensor: variable, value });
    if (!(r.status === 500 && /not connected/.test(r.raw))) break;
    log(`   (backend sin MQTT, reintento ${i + 1}/6 en 5 s)`);
    await new Promise((s) => setTimeout(s, 5000));
  }
  if (r.status !== 200) throw new Error(`simulator/set ${variable}=${value} → ${r.status} ${r.raw.slice(0, 160)}`);
  log(`   set ${variable} = ${value}`);
}

async function putPack(deviceType, rules) {
  const cur = await api('GET', `/rulepacks/${PACK}`);
  const version = cur.status === 200 && cur.json && cur.json.data ? (cur.json.data.version || 1) + 1 : 1;
  const r = await api('PUT', `/rulepacks/${PACK}`, { rulepack: { packId: PACK, deviceType, version, canary: false, rules,
    description: 'Banco de conformidad del ciclo de vida (plan_banco_conformidad_reglas.md). No productivo.' } });
  if (r.status !== 200) throw new Error(`PUT pack → ${r.status} ${r.raw.slice(0, 240)}`);
}

// Estructura común de una regla de banco (tiempos comprimidos Qc2; cooldown productivo).
const base = (ruleId, label, type, deviceType) => ({
  ruleId, label, inferenceId: ruleId.toUpperCase().replace(/-/g, '_'), type, severity: 'warning', deviceType,
  cooldownSec: 300, graceSec: GRACE, resolveGraceSec: CLOSE, recommendation: 'Regla de banco: no requiere acción.', enabled: true,
});

function informe(titulo, orden, extra) {
  if (orden) RESULTS.sort((a, b) => orden.indexOf(a.c) - orden.indexOf(b.c));
  const n = (k) => RESULTS.filter((r) => r.estado === k).length;
  console.log(`\n════════ ${titulo} ════════`);
  for (const r of RESULTS) console.log(`${r.c.padEnd(5)} ${r.estado.padEnd(9)} ${r.que}\n                ${r.evidencia || ''}`);
  console.log(`\nVERDE ${n('VERDE')} · ROJO ${n('ROJO')} · OBSERVADO ${n('OBSERVADO')}`);
  if (extra) console.log(extra);
}

module.exports = { e, PACK, GRACE, CLOSE, TICK, SITE, arg, has, sleep, now, fmt, log, api, connect, getDb, close,
  trans, notifs, fsmRow, steps, fires, resolves, RESULTS, result, mqttCmd, setVal, putPack, base, informe, mongoose };
