#!/usr/bin/env node
'use strict';

// DEC-REF-110 (#82) — el roster del simulador viene de la DB, no de un archivo
// fijo. Al arrancar y cada SIM_POLL_SEC, pide GET /simulator/roster (devices
// firmwareType='wanomi-sim') y RECONCILIA: bootstrapea los nuevos y desconecta
// los que ya no están. Así un device 'wanomi-sim' creado por la UI entra al sim
// en el próximo poll, sin reiniciar. Reemplaza el viejo devices_state.json.

const api = require('./lib/api.js');
const { SimulatedDevice } = require('./lib/device.js');
const engine = require('./lib/sensor-engine.js');

const ROSTER_TOKEN = process.env.EMQX_API_TOKEN;   // gate M2M del roster (mismo secreto que webhooks)
const POLL_MS = (Number(process.env.SIM_POLL_SEC) || 45) * 1000;

if (!ROSTER_TOKEN) {
  console.error('ERROR: EMQX_API_TOKEN es requerido (auth del roster /simulator/roster)');
  process.exit(1);
}

// deviceType de la ficha (DEC-REF-108) → rol que el sensor-engine sabe simular.
// Un deviceType fuera de este mapa no es simulable (la física está por rol).
const ROLE_BY_DEVICETYPE = { SEC: 'SEC', GEN: 'GEN', ATS: 'ATS', 'cummins-pcc': 'CUMMINS', ELTEK: 'ELTEK' };

const devices = new Map();   // dId -> SimulatedDevice (activos)
const siteShared = {};       // siteCode -> estado compartido (misma ref por site, BUG-SIM-1)
const skipped = new Set();   // dId sin rol simulable — avisar una sola vez

function roleFor(deviceType) {
  return ROLE_BY_DEVICETYPE[deviceType] || null;
}

async function bootstrapOne(entry) {
  const { dId, password, deviceType, siteId } = entry;
  const siteCode = siteId || 'UNKNOWN';
  const role = roleFor(deviceType);
  if (!role) {
    if (!skipped.has(dId)) {
      console.warn(`skip ${siteCode}/${dId}: deviceType "${deviceType || '(vacío)'}" sin rol simulable`);
      skipped.add(dId);
    }
    return;
  }
  try {
    const creds = await api.getDeviceCredentials(dId, password);   // { username, password, topic, variables, heartbeatSec }
    const userId = creds.topic.split('/')[0];
    if (!siteShared[siteCode]) siteShared[siteCode] = {};
    const dev = new SimulatedDevice({
      dId,
      role,
      siteCode,
      mqttUsername: creds.username,
      mqttPassword: creds.password,   // NUNCA logueado
      userId,
      variables: creds.variables,
      sharedState: siteShared[siteCode],
      heartbeatSec: creds.heartbeatSec,
    });
    await dev.connect();
    dev.startPublishing();
    devices.set(dId, dev);
    console.log(`+ ${siteCode}/${role} (${dId}) online — ${creds.variables.length} vars`);
  } catch (err) {
    console.error(`Failed to bootstrap ${siteCode}/${deviceType} (${dId}): ${err.message}`);
    // No se agrega a `devices`: el próximo poll reintenta (p.ej. si aún no tenía template).
  }
}

// Reconciliación: agrega los del roster que no estén, saca los que ya no están.
async function reconcile() {
  let roster;
  try {
    roster = await api.getRoster(ROSTER_TOKEN);
  } catch (err) {
    console.error(`reconcile: getRoster falló (se conserva el estado actual): ${err.message}`);
    return;
  }
  const rosterIds = new Set(roster.map(r => r.dId));

  for (const entry of roster) {
    if (!devices.has(entry.dId)) await bootstrapOne(entry);
  }
  for (const dId of [...devices.keys()]) {
    if (!rosterIds.has(dId)) {
      const dev = devices.get(dId);
      console.log(`- ${dev.tag} salió del roster — desconectando`);
      try { await dev.disconnect(); } catch (e) { /* best-effort */ }
      devices.delete(dId);
    }
    skipped.delete(dId);   // por si vuelve con deviceType válido
  }
  // Limpia del set `skipped` los que ya no están en el roster.
  for (const dId of [...skipped]) if (!rosterIds.has(dId)) skipped.delete(dId);
}

async function main() {
  console.log('=== Wanomi Simulator (roster desde DB · DEC-REF-110) ===');
  console.log(process.env.SIMULATOR_MODE === 'true'
    ? 'SIMULATOR_MODE=true — control channel ACTIVE'
    : 'SIMULATOR_MODE not set — control channel DISABLED');

  await reconcile();
  console.log(`\n${devices.size} device(s) online. Poll cada ${POLL_MS / 1000}s. Ctrl+C para parar.\n`);

  // DEC-REF-77-A / -79-B — scheduler del ejercicio semanal. Itera los ATS
  // ACTUALES en cada tick (así toma los que entren por poll). Guarda de
  // cadencia >= duración + margen 1 min (si no, un disparo cancela el apagado
  // del anterior y el motor no para — DEC-REF-79 iii).
  if (process.env.SIMULATOR_MODE === 'true') {
    const intervalMin = Number(process.env.WEEKLY_EXERCISE_INTERVAL_MIN) || 30;
    const intervalMs = intervalMin * 60 * 1000;
    const exerciseDurationMs = engine.SCENARIOS.weekly_exercise.duration_ms;
    const minCadenceMs = exerciseDurationMs + 60 * 1000;
    if (intervalMs < minCadenceMs) {
      console.error(
        `Weekly exercise scheduler ABORTED — WEEKLY_EXERCISE_INTERVAL_MIN=${intervalMin} ` +
        `es menor que el mínimo ${Math.ceil(minCadenceMs / 60000)} min.`
      );
    } else {
      console.log(`Weekly exercise scheduler ACTIVE — cadence ${intervalMin} min · duración ${exerciseDurationMs / 60000} min\n`);
      setInterval(() => {
        for (const dev of devices.values()) {
          if (dev.role === 'ATS') {
            console.log(`${dev.tag} weekly_exercise triggered by scheduler`);
            dev.runScenario('weekly_exercise');
          }
        }
      }, intervalMs);
    }
  }

  // Poll de reconciliación (DEC-REF-110 D-2): altas/bajas en caliente.
  setInterval(() => { reconcile().catch(e => console.error('reconcile error:', e.message)); }, POLL_MS);

  async function shutdown() {
    console.log('\nShutting down...');
    await Promise.all([...devices.values()].map(d => d.disconnect().catch(() => {})));
    console.log('All devices disconnected.');
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('\nRUN ERROR:', err.message);
  process.exit(1);
});

// Muerte VISIBLE (P1 · #79): un throw en un timer o una promise sin catch mataba
// el proceso sin rastro. Log + exit(1): el supervisor lo relanza.
process.on('uncaughtException', err => {
  console.error('\nUNCAUGHT EXCEPTION — el supervisor relanzará el sim:', err && err.stack || err);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('\nUNHANDLED REJECTION — el supervisor relanzará el sim:', err && err.stack || err);
  process.exit(1);
});
