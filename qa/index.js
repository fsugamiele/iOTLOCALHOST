'use strict';
// DEC-REF-134 — WORKER del Supervisor de Calidad (`wanomi-qa`, 5ta pata viva).
// ANDAMIAJE: conecta a Mongo (read-only sobre el motor), arma los SLOTS del scheduler
// (Capa B periódica, Capa C nocturna) y un http INTERNO con /health. La LÓGICA de cada
// check NO vive acá — se cablea por AUTO-DESCUBRIMIENTO (ver loadDir): cada bloque futuro
// AGREGA un archivo en qa/checks/ (checks B/C) o qa/routes/ (http on-demand) y NO toca
// este index → bloques implementables en PARALELO sin colisión. Sin checks = los slots
// solo loguean: el supervisor no inventa hallazgos hasta tener lógica propia (§0 diseño).
//
// Corre como `node qa/index.js` SIN babel (igual que el edge): por eso solo requiere
// modelos `module.exports` (quality_finding / qa_run) y mongoose del mount ./app.
//
// Contrato de extensión:
//   qa/checks/<x>.js  → module.exports = { layer:'B'|'C', name:'I1',
//                        run: async () => ({ check, rulesCovered[], devicesCovered[], findingsWritten }) }
//   qa/routes/<x>.js  → module.exports = { method:'POST', path:'/backtest',
//                        handler: async (req, res) => {...} }

// dotenv NO pisa process.env ya seteado → coexiste con el env_file del compose (igual
// que edge con .env.edge). path explícito: el cwd del container es /home/qa/qa.
require('dotenv').config({ path: require('path').join(__dirname, '.env.qa') });

const fs = require('fs');
const path = require('path');
const http = require('http');
const mongoose = require('mongoose');   // resuelto vía NODE_PATH=/home/qa/app/node_modules

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wanomi';
const SITE_ID   = process.env.SITE_ID    || 'CR00061';
const ENABLED   = process.env.QA_ENABLED === 'true';
const HTTP_PORT = parseInt(process.env.QA_HTTP_PORT || '3010', 10);
const B_MS      = parseInt(process.env.QA_CAPA_B_INTERVAL_MS || '300000', 10);  // 5 min
const C_HOUR    = parseInt(process.env.QA_CAPA_C_HOUR || '3', 10);              // 03:00 local

// Auto-descubre módulos en un subdirectorio. Ausente = []. Un módulo roto NO tumba el
// worker: se loguea y se saltea (un bloque futuro con bug no deja al supervisor sin arrancar).
function loadDir(sub) {
  const dir = path.join(__dirname, sub);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    try { out.push(require(path.join(dir, f))); }
    catch (e) { console.error(`[qa] no pude cargar ${sub}/${f}:`, e && (e.stack || e.message)); }
  }
  return out;
}

// Muerte muda → muerte registrada + relanzada por restart:always (patrón edge).
process.on('unhandledRejection', (reason) => {
  console.error('[qa] unhandledRejection:', reason && (reason.stack || reason.message || reason));
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[qa] uncaughtException:', err && (err.stack || err.message || err));
  process.exit(1);
});

// Corre los checks registrados de una capa y deja un qa_run (auto-auditoría §4). Guard
// `running` para que una corrida lenta no se solape con el próximo tick.
const runningLayer = { B: false, C: false };
async function runLayer(layer, checks) {
  if (!checks.length) { console.log(`[qa] Capa ${layer}: sin checks en qa/checks/ (los agrega ${layer === 'B' ? '135' : '138'})`); return; }
  if (runningLayer[layer]) { console.warn(`[qa] Capa ${layer}: corrida anterior aún en curso, salteo este tick`); return; }
  runningLayer[layer] = true;
  const QaRun = require('../app/api/models/qa_run');
  const agg = { checks: [], rulesCovered: new Set(), devicesCovered: new Set(), findingsWritten: 0, startedAt: new Date() };
  try {
    for (const c of checks) {
      const r = (await c.run()) || {};
      agg.checks.push(r.check || c.name);
      (r.rulesCovered   || []).forEach(x => agg.rulesCovered.add(x));
      (r.devicesCovered || []).forEach(x => agg.devicesCovered.add(x));
      agg.findingsWritten += (r.findingsWritten || 0);
    }
    await QaRun.create({ layer, checks: agg.checks, rulesCovered: [...agg.rulesCovered],
      devicesCovered: [...agg.devicesCovered], findingsWritten: agg.findingsWritten,
      startedAt: agg.startedAt, finishedAt: new Date(), ok: true });
    console.log(`[qa] Capa ${layer} OK · checks=${agg.checks.join(',')} · findings=${agg.findingsWritten}`);
  } catch (e) {
    await QaRun.create({ layer, checks: agg.checks, startedAt: agg.startedAt, finishedAt: new Date(),
      ok: false, error: e && (e.stack || e.message) }).catch(() => {});
    console.error(`[qa] Capa ${layer} FALLÓ:`, e && (e.stack || e.message));
  } finally {
    runningLayer[layer] = false;
  }
}

// Arma la Capa C para el próximo C_HOUR local y se re-agenda cada 24 h.
function scheduleCapaC(capaC) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(C_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;
  console.log(`[qa] Capa C agendada para ${next.toISOString()} (en ${(ms / 3600000).toFixed(1)} h)`);
  setTimeout(async () => {
    await runLayer('C', capaC);
    scheduleCapaC(capaC);
  }, ms);
}

function startHttp(routes) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, site: SITE_ID, enabled: ENABLED, mongo: mongoose.connection.readyState === 1 }));
      return;
    }
    // Rutas on-demand auto-descubiertas (ej. POST /backtest del bloque 136).
    const route = routes.find(r => r.method === req.method && r.path === req.url.split('?')[0]);
    if (route) {
      try { await route.handler(req, res); }
      catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: e && e.message })); }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  // Sin ports: al host en el compose → solo alcanzable por `wanomi-qa:<HTTP_PORT>`
  // dentro de la red docker (node lo consume en 136). 0.0.0.0 para la red interna.
  server.listen(HTTP_PORT, '0.0.0.0', () => console.log(`[qa] http interno escuchando en :${HTTP_PORT} · rutas on-demand: ${routes.map(r => r.method + ' ' + r.path).join(', ') || '(ninguna aún)'}`));
  return server;
}

async function start() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
    serverSelectionTimeoutMS: 5000,   // fast-fail (patrón DEC-REF-68.c del edge)
  });
  // Redactado: NUNCA loguear credenciales (a diferencia del edge). Muestra solo host/db.
  console.log(`[qa] Mongo conectado — ${MONGO_URI.replace(/\/\/[^@]*@/, '//***:***@')}`);

  const checkMods = loadDir('checks');
  const capaB = checkMods.filter(m => m && m.layer === 'B');
  const capaC = checkMods.filter(m => m && m.layer === 'C');
  const routes = loadDir('routes').filter(r => r && r.method && r.path && typeof r.handler === 'function');
  console.log(`[qa] checks descubiertos · B:[${capaB.map(c => c.name).join(',')}] C:[${capaC.map(c => c.name).join(',')}]`);

  const server = startHttp(routes);

  if (!ENABLED) {
    console.log('[qa] idle (QA_ENABLED != true): conectado y con /health, SIN agendar capas.');
  } else {
    console.log(`[qa] scheduler armado · Capa B cada ${B_MS} ms · Capa C a las ${String(C_HOUR).padStart(2, '0')}:00`);
    setInterval(() => { runLayer('B', capaB).catch(() => {}); }, B_MS);
    scheduleCapaC(capaC);
  }

  process.on('SIGTERM', async () => {
    console.log('[qa] SIGTERM — cerrando...');
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  });
}

start().catch((e) => {
  console.error('[qa] no pudo arrancar:', e && (e.stack || e.message));
  process.exit(1);
});
