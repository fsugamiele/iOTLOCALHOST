#!/usr/bin/env node
'use strict';

// ASSUMPTION: device.password se guarda en plain text en MongoDB (ver routes/devices.js POST /device).
// Esto es lo que permite el bootstrap del ESP32 vía POST /api/getdevicecredentials —
// el mismo path que usa este simulador.
// El password MQTT (en EmqxAuthRule) SÍ rota en cada llamada a /getdevicecredentials,
// pero device.password persiste. Si la plataforma rota device.password en el futuro,
// borrar devices_state.json y re-correr seed.js.

const fs = require('fs');
const path = require('path');
const api = require('./lib/api.js');

const SITES_FILE = path.join(__dirname, 'sites_real.json');
const STATE_FILE = path.join(__dirname, 'devices_state.json');

const EMAIL = process.env.USER_EMAIL;
const PASSWORD = process.env.USER_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('ERROR: USER_EMAIL y USER_PASSWORD son requeridos');
  process.exit(1);
}

if (!fs.existsSync(SITES_FILE)) {
  console.error(`ERROR: ${SITES_FILE} no encontrado`);
  console.error('  → cp sites_real.example.json sites_real.json y completar con datos reales');
  process.exit(1);
}

// Cada widget: { variable, variableFullName, variableType, variableSendFreq }
// getdevicecredentials retorna template.widgets mapeados a este schema.
// IMPORTANTE: los nombres de 'variable' deben matchear el VARIABLE_MAP del
// forensic_dispatcher para que se generen ForensicEvents correctamente.

// SEC: 10 variables de seguridad
const SEC_TEMPLATE = {
  name: 'WN-SITE-SEC v2',
  description: 'Anti-robo y anti-intrusión para sites de telco. 4 puntos de apertura, sensórica perimetral y BLE tracking de baterías.',
  widgets: [
    { variable: 'door_shelter',          variableFullName: 'Puerta shelter',                 variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'door_front',            variableFullName: 'Puerta frente',                  variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'door_rear',             variableFullName: 'Puerta trasera',                 variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'door_battery_cabinet',  variableFullName: 'Gabinete de baterías',           variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'pir_motion',            variableFullName: 'Movimiento interior (PIR)',      variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'fence_vibration',       variableFullName: 'Vibración cerco (corte/golpe)',  variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'copper_field_anomaly',  variableFullName: 'Movimiento de cobre',            variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'ground_continuity',     variableFullName: 'Continuidad de tierra',          variableType: 'bool',        variableSendFreq: 60 },
    { variable: 'battery_beacons_count', variableFullName: 'BLE beacons baterías presentes', variableType: 'int',         variableSendFreq: 60 },
    { variable: 'shelter_temp',          variableFullName: 'Temperatura shelter (°C)',       variableType: 'float',       variableSendFreq: 120 },
  ],
};

// GEN: 9 variables de generador/energía
const GEN_TEMPLATE = {
  name: 'WN-SITE-GEN v2',
  description: 'Monitoreo predictivo de grupo electrógeno. MODBUS solo-lectura + sensórica externa con FFT on-edge.',
  widgets: [
    { variable: 'fuel_level',             variableFullName: 'Nivel combustible (%)',          variableType: 'float',       variableSendFreq: 60 },
    { variable: 'genset_running',         variableFullName: 'Motor en marcha',                variableType: 'bool',        variableSendFreq: 30 },
    { variable: 'exhaust_temp',           variableFullName: 'Temperatura escape (°C)',        variableType: 'float',       variableSendFreq: 60 },
    { variable: 'vibration_signature',    variableFullName: 'Firma vibracional (FFT)',        variableType: 'categorical', variableSendFreq: 60 },
    { variable: 'crank_current',          variableFullName: 'Corriente arranque (A)',         variableType: 'float',       variableSendFreq: 30 },
    { variable: 'alternator_voltage',     variableFullName: 'Tensión alternador (V)',         variableType: 'float',       variableSendFreq: 60 },
    { variable: 'battery_voltage',        variableFullName: 'Tensión batería arranque (V)',   variableType: 'float',       variableSendFreq: 60 },
    { variable: 'crank_attempts_failed',  variableFullName: 'Intentos fallidos consecutivos', variableType: 'int',         variableSendFreq: 30 },
    { variable: 'mains_voltage',          variableFullName: 'Tensión red eléctrica (V)',      variableType: 'float',       variableSendFreq: 60 },
  ],
};

// ATS: 7 variables ComAp InteliATS PWR (honra DEC-REF-16)
const ATS_TEMPLATE = {
  name: 'WN-ATS-InteliATS-PWR',
  description: 'ComAp InteliATS PWR — estado de transferencia, tensiones y frecuencias de red y generador.',
  widgets: [
    { variable: 'transfer_state', variableFullName: 'Estado de transferencia',        variableType: 'categorical', variableSendFreq: 30 },
    { variable: 'mains_voltage',  variableFullName: 'Tensión red (V)',                variableType: 'float',       variableSendFreq: 60 },
    { variable: 'mains_freq',     variableFullName: 'Frecuencia red (Hz)',            variableType: 'float',       variableSendFreq: 60 },
    { variable: 'gen_voltage',    variableFullName: 'Tensión generador (V)',          variableType: 'float',       variableSendFreq: 60 },
    { variable: 'gen_freq',       variableFullName: 'Frecuencia generador (Hz)',      variableType: 'float',       variableSendFreq: 60 },
    { variable: 'load_kw',        variableFullName: 'Carga activa (kW)',              variableType: 'float',       variableSendFreq: 60 },
    { variable: 'gen_status',     variableFullName: 'Estado del generador',          variableType: 'categorical', variableSendFreq: 30 },
  ],
};

// CUMMINS: 11 variables Cummins PowerCommand (honra DEC-REF-16)
const CUMMINS_TEMPLATE = {
  name: 'WN-GEN-Cummins-PowerCommand',
  description: 'Cummins PowerCommand — monitoreo mecánico y eléctrico del grupo electrógeno.',
  widgets: [
    { variable: 'oil_pressure',    variableFullName: 'Presión aceite (psi)',          variableType: 'float', variableSendFreq: 60 },
    { variable: 'coolant_temp',    variableFullName: 'Temperatura refrigerante (°C)', variableType: 'float', variableSendFreq: 60 },
    { variable: 'rpm',             variableFullName: 'RPM motor',                     variableType: 'int',   variableSendFreq: 30 },
    { variable: 'run_hours',       variableFullName: 'Horas de marcha (h)',           variableType: 'float', variableSendFreq: 60 },
    { variable: 'battery_voltage', variableFullName: 'Tensión batería arranque (V)',  variableType: 'float', variableSendFreq: 60 },
    { variable: 'fuel_level',      variableFullName: 'Nivel combustible (%)',         variableType: 'float', variableSendFreq: 60 },
    { variable: 'fault_code',      variableFullName: 'Código de falla',              variableType: 'int',   variableSendFreq: 30 },
    { variable: 'bitmap_42100',    variableFullName: 'Status word (42100)',           variableType: 'int',   variableSendFreq: 60 },
    { variable: 'bitmap_42101',    variableFullName: 'Alarm word 1 (42101)',          variableType: 'int',   variableSendFreq: 60 },
    { variable: 'bitmap_42102',    variableFullName: 'Alarm word 2 (42102)',          variableType: 'int',   variableSendFreq: 60 },
    { variable: 'bitmap_42110',    variableFullName: 'Event word (42110)',            variableType: 'int',   variableSendFreq: 60 },
  ],
};

const readState = () => fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const writeState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

async function ensureTemplate(token, tplDef) {
  const templates = await api.getTemplates(token);
  const existing = templates.find(t => t.name === tplDef.name);
  if (existing) {
    console.log(`  template "${tplDef.name}" already exists (${existing._id})`);
    return existing._id;
  }
  await api.createTemplate(token, tplDef);
  // POST /api/template retorna {status:"success"} sin _id — re-fetch para resolver
  const updated = await api.getTemplates(token);
  const created = updated.find(t => t.name === tplDef.name);
  if (!created) throw new Error(`Template "${tplDef.name}" not found after creation`);
  console.log(`  template "${tplDef.name}" created (${created._id})`);
  return created._id;
}

async function ensureSite(token, site) {
  const all = await api.getSites(token);
  if (all.find(s => s.siteCode === site.siteCode)) {
    console.log(`  site ${site.siteCode} already exists`);
    return;
  }
  await api.createSite(token, site);
  console.log(`  site ${site.siteCode} created`);
}

async function ensureDevice(token, siteCode, role, templateId, templateName) {
  // Defensa: templateName requerido por el schema de Device (Mongoose required:[true])
  if (!templateName) throw new Error('templateName required for ensureDevice');

  const all = await api.getDevices(token);

  // Buscar device existente Y bindeado al site.
  // CASO DE BORDE: si createDevice tuvo éxito pero bindDevice falló, queda
  // un device con name correcto pero sin siteId. En ese caso este check
  // no lo encuentra → re-crear falla por unique constraint en dId.
  // Si esto ocurre, el operador debe limpiar manualmente.
  const existing = all.find(d => d.siteId === siteCode && d.name === `${siteCode}-${role}`);
  if (existing) {
    console.warn(`  WARNING: ${siteCode}-${role} exists in backend but not in devices_state.json`);
    console.warn(`           Delete it manually and re-run seed to recover credentials`);
    return null;
  }

  const r = await api.createDevice(token, {
    name: `${siteCode}-${role}`,
    templateId,
    templateName,
    firmwareType: 'wanomi-sim',
    deviceType: role,
    driverConfig: { protocol: 'wanomi-sim' },
  });
  await api.bindDevice(token, r.dId, siteCode);
  console.log(`  ${siteCode}-${role} created (dId: ${r.dId}), bound to ${siteCode}`);
  return { dId: r.dId, password: r.password };
}

// Validar que cada dId del state local existe en el backend.
// Continuar con state inconsistente causaría errores crípticos en run.js.
async function validateState(token, state) {
  if (!state || Object.keys(state).length === 0) return;
  const devices = await api.getDevices(token);
  const dIds = new Set(devices.map(d => d.dId));
  const orphans = [];
  for (const [siteCode, roles] of Object.entries(state)) {
    for (const [role, info] of Object.entries(roles)) {
      if (!dIds.has(info.dId)) orphans.push(`${siteCode}/${role} (${info.dId})`);
    }
  }
  if (orphans.length > 0) {
    console.error('\nERROR: devices_state.json tiene entradas que no existen en el backend:');
    orphans.forEach(o => console.error(`  - ${o}`));
    console.error('\nResolution options:');
    console.error('  1. Si el backend fue reseteado: borrar devices_state.json y re-correr seed');
    console.error('  2. Si el backend está bien: editar devices_state.json manualmente');
    console.error('\nAborting to prevent inconsistent state.\n');
    process.exit(1);
  }
}

async function main() {
  console.log('=== WN-SITE-SEC/GEN Simulator — Seed ===\n');

  const sites = JSON.parse(fs.readFileSync(SITES_FILE, 'utf8'));
  console.log(`Provisioning ${sites.length} sites from sites_real.json\n`);

  const session = await api.login(EMAIL, PASSWORD);
  const token = session.token;
  console.log('Logged in\n');

  // Estado previo (para idempotencia)
  const existingState = readState();
  if (Object.keys(existingState).length > 0) {
    console.log('Loaded existing devices_state.json\n');
  }

  // Validar que el state local sea consistente con el backend
  await validateState(token, existingState);

  // ── Templates ─────────────────────────────────────────────────────
  console.log('── Templates ─────────────────────────────────────────');
  const secTemplateId     = await ensureTemplate(token, SEC_TEMPLATE);
  const genTemplateId     = await ensureTemplate(token, GEN_TEMPLATE);
  const atsTemplateId     = await ensureTemplate(token, ATS_TEMPLATE);
  const cumminsTemplateId = await ensureTemplate(token, CUMMINS_TEMPLATE);

  // ── Sites + Devices ────────────────────────────────────────────────
  const newState = { ...existingState };
  let sitesCreated = 0, sitesSkipped = 0, devsCreated = 0, devsSkipped = 0;
  // Roles por site: SEC+GEN para todos; ATS+CUMMINS solo en CR00061 (site MVP)
  const MVP_SITE = 'CR00061';

  for (const site of sites) {
    console.log(`\n── ${site.siteCode} — ${site.nombre} ──`);

    // Site
    const sitesBefore = (await api.getSites(token)).find(s => s.siteCode === site.siteCode);
    await ensureSite(token, site);
    if (sitesBefore) sitesSkipped++; else sitesCreated++;

    // Devices: SEC+GEN para todos; ATS+CUMMINS solo para el site MVP
    if (!newState[site.siteCode]) newState[site.siteCode] = {};

    const roles = [
      ['SEC', secTemplateId,     SEC_TEMPLATE.name],
      ['GEN', genTemplateId,     GEN_TEMPLATE.name],
    ];
    if (site.siteCode === MVP_SITE) {
      roles.push(['ATS',     atsTemplateId,     ATS_TEMPLATE.name]);
      roles.push(['CUMMINS', cumminsTemplateId, CUMMINS_TEMPLATE.name]);
    }

    for (const [role, templateId, templateName] of roles) {
      if (newState[site.siteCode][role]) {
        console.log(`  ${site.siteCode}-${role} already in state file (dId: ${newState[site.siteCode][role].dId})`);
        devsSkipped++;
      } else {
        const r = await ensureDevice(token, site.siteCode, role, templateId, templateName);
        if (r) {
          newState[site.siteCode][role] = r;
          devsCreated++;
        }
      }
    }
  }

  writeState(newState);

  console.log('\n── Summary ─────────────────────────────────────────');
  console.log(`  Sites:   ${sitesCreated} created · ${sitesSkipped} skipped`);
  console.log(`  Devices: ${devsCreated} created · ${devsSkipped} skipped`);
  console.log(`  State:   devices_state.json written (${Object.keys(newState).length} sites)`);
  console.log('\n=== Seed complete ===');
}

main().catch(err => {
  console.error('\nSEED ERROR:', err.message);
  process.exit(1);
});
