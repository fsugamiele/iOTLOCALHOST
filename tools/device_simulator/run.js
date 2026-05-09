#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const api = require('./lib/api.js');
const { SimulatedDevice } = require('./lib/device.js');

const STATE_FILE = path.join(__dirname, 'devices_state.json');

const EMAIL = process.env.USER_EMAIL;
const PASSWORD = process.env.USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: USER_EMAIL y USER_PASSWORD son requeridos');
  process.exit(1);
}

if (!fs.existsSync(STATE_FILE)) {
  console.error('ERROR: devices_state.json no encontrado — correr "node seed.js" primero');
  process.exit(1);
}

// Filtro opcional: --site=CR00015 para correr solo ese site
const args = process.argv.slice(2);
const siteFilter = (args.find(a => a.startsWith('--site=')) || '').replace('--site=', '') || null;

async function main() {
  console.log('=== WN-SITE-SEC/GEN Simulator ===\n');

  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  let entries = Object.entries(state);

  if (siteFilter) {
    entries = entries.filter(([siteCode]) => siteCode === siteFilter);
    if (entries.length === 0) {
      console.error(`ERROR: site "${siteFilter}" no encontrado en devices_state.json`);
      process.exit(1);
    }
  }

  // Aplanar a lista de devices: [{ siteCode, role, dId, password }]
  const configs = [];
  for (const [siteCode, roles] of entries) {
    for (const [role, dev] of Object.entries(roles)) {
      configs.push({ siteCode, role, dId: dev.dId, password: dev.password });
    }
  }

  console.log(`Bootstrapping ${configs.length} devices...`);
  if (process.env.SIMULATOR_MODE === 'true') {
    console.log('SIMULATOR_MODE=true — control channel ACTIVE');
  } else {
    console.log('SIMULATOR_MODE not set — control channel DISABLED (devices publish autonomously)');
  }
  console.log('');

  // Bootstrap: para cada device, llamar al mismo endpoint que un ESP32 real
  // y obtener credenciales MQTT en plain.
  const devices = [];
  for (const cfg of configs) {
    try {
      console.log(`Bootstrapping ${cfg.siteCode}/${cfg.role} (${cfg.dId})...`);
      const creds = await api.getDeviceCredentials(cfg.dId, cfg.password);
      // El topic viene como "userId/dId/" — extraemos el userId
      const userId = creds.topic.split('/')[0];

      devices.push(new SimulatedDevice({
        dId: cfg.dId,
        role: cfg.role,
        siteCode: cfg.siteCode,
        mqttUsername: creds.username,
        mqttPassword: creds.password, // NUNCA logueado
        userId,
        variables: creds.variables,
      }));
    } catch (err) {
      console.error(`Failed to bootstrap ${cfg.siteCode}/${cfg.role}: ${err.message}`);
    }
  }

  if (devices.length === 0) {
    console.error('\nNo devices bootstrapped. Verificar:');
    console.error('  - Backend está corriendo y accesible en el puerto correcto');
    console.error('  - devices_state.json contiene devices que existen en el backend');
    process.exit(1);
  }

  // Conectar todos en paralelo
  console.log(`\nConnecting ${devices.length} device(s) to MQTT...`);
  await Promise.all(devices.map(d => d.connect()));

  console.log(`\n${devices.length} devices online. Publishing started. Ctrl+C to stop.\n`);
  devices.forEach(d => d.startPublishing());

  // Shutdown limpio
  async function shutdown() {
    console.log('\nShutting down...');
    await Promise.all(devices.map(d => d.disconnect()));
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
