#!/usr/bin/env node
'use strict';
// Ola B — devices simulados de batería litio (LITIO) y aire acondicionado (AA).
// Crea ficha + template + device + asignación al site CR00061. IDEMPOTENTE (por dId/name).
// El bootstrap del sim (getdevicecredentials) crea la auth MQTT solo; el reconcile
// del sim toma el device nuevo del roster. Las físicas viven en sensor-engine.js (roles
// LITIO/AA) y las reglas en tools/seed_packs_litio_aa/.
//
// Uso: node -r /root/IotLocalhost/app/node_modules/dotenv/config \
//        tools/seed_devices_sim/seed.js dotenv_config_path=/root/IotLocalhost/app/.env

const path = require('path');
const { MongoClient, ObjectId } = require(path.join('/root/IotLocalhost/app', 'node_modules/mongodb'));

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('ERROR: falta MONGODB_URI'); process.exit(1); }
const ADMIN = '6a32e105be5ca779169754af';
const SITE = 'CR00061';
const now = Date.now();

const V = (name, label, type, unit, deadband) => ({ name, label, type, unit, deadband, limits: [], factoryRange: '' });
const W = (variable, variableFullName, variableType, unit, deadband, widget) =>
  ({ variable, variableFullName, variableType, variableSendFreq: 30, unit, widget: widget || 'numeric', deadband });

const EQUIPOS = [
  {
    deviceType: 'LITIO', manufacturer: 'ZTE', model: 'ZXDU litio', domain: 'energia',
    dId: 'Lt7bAtR9', name: `${SITE}-LITIO`, templateName: 'WN-LITIO-ZX',
    vars: [
      V('soc', 'Estado de carga', 'float', '%', 1),
      V('pack_voltage', 'Tensión del banco', 'float', 'V', 0.2),
      V('cell_voltage_spread', 'Desbalance de celdas', 'float', 'V', 0.005),
      V('cell_temp_max', 'Temperatura de celda', 'float', '°C', 0.5),
      V('charge_current', 'Corriente de carga', 'float', 'A', 0.5),
      V('battery_theft_alarm', 'Robo de baterías', 'bool', '', undefined),
    ],
    widgets: [
      W('soc', 'Estado de carga', 'float', '%', 1),
      W('pack_voltage', 'Tensión del banco', 'float', 'V', 0.2),
      W('cell_voltage_spread', 'Desbalance de celdas', 'float', 'V', 0.005),
      W('cell_temp_max', 'Temperatura de celda', 'float', '°C', 0.5),
      W('charge_current', 'Corriente de carga', 'float', 'A', 0.5),
      W('battery_theft_alarm', 'Robo de baterías', 'bool', '', undefined, 'indicator'),
    ],
  },
  {
    deviceType: 'AA', manufacturer: 'Westric', model: 'SW-302', domain: 'clima',
    dId: 'Aa4C0oLr', name: `${SITE}-AA`, templateName: 'WN-AA-Westric',
    vars: [
      V('room_temp', 'Temperatura de sala', 'float', '°C', 0.3),
      V('unit1_status', 'Aire 1 en marcha', 'bool', '', undefined),
      V('unit1_fault', 'Falla aire 1', 'bool', '', undefined),
      V('unit2_status', 'Aire 2 en marcha', 'bool', '', undefined),
      V('unit2_fault', 'Falla aire 2', 'bool', '', undefined),
    ],
    widgets: [
      W('room_temp', 'Temperatura de sala', 'float', '°C', 0.3),
      W('unit1_status', 'Aire 1 en marcha', 'bool', '', undefined, 'indicator'),
      W('unit1_fault', 'Falla aire 1', 'bool', '', undefined, 'indicator'),
      W('unit2_status', 'Aire 2 en marcha', 'bool', '', undefined, 'indicator'),
      W('unit2_fault', 'Falla aire 2', 'bool', '', undefined, 'indicator'),
    ],
  },
];

(async () => {
  const client = new MongoClient(URI, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const password = 'simB0laPwd12';  // texto plano (igual que los demás sim); el roster lo devuelve

  for (const e of EQUIPOS) {
    // 1) ficha (equipmentsheet) — upsert por deviceType
    await db.collection('equipmentsheets').updateOne(
      { deviceType: e.deviceType },
      { $setOnInsert: { version: 1, manual: '', deviceType: e.deviceType, manufacturer: e.manufacturer, model: e.model, origin: 'wanomi', domain: e.domain, variables: e.vars, createdTime: now } },
      { upsert: true });

    // 2) template — upsert por name, con _id estable
    let tpl = await db.collection('templates').findOne({ name: e.templateName });
    if (!tpl) {
      const _id = new ObjectId();
      await db.collection('templates').insertOne({ _id, name: e.templateName, description: `${e.manufacturer} ${e.model} (Wanomi sim)`, userId: ADMIN, widgets: e.widgets, heartbeatSec: 300, deviceType: e.deviceType, createdTime: now });
      tpl = { _id };
    }

    // 3) device — crear si no existe
    const exists = await db.collection('devices').findOne({ dId: e.dId });
    if (!exists) {
      await db.collection('devices').insertOne({
        selected: false, firmwareType: 'wanomi-sim', tasmotaName: '', deviceType: e.deviceType,
        name: e.name, templateId: tpl._id, templateName: e.templateName, driverConfig: {},
        userId: ADMIN, createdTime: now, dId: e.dId, password, siteId: SITE,
      });
      console.log(`  + device ${e.dId} (${e.deviceType}) creado + template ${e.templateName} + ficha`);
    } else {
      console.log(`  · device ${e.dId} (${e.deviceType}) ya existía`);
    }

    // 4) asignar al site
    await db.collection('sites').updateOne({ siteCode: SITE }, { $addToSet: { devices: e.dId } });
  }

  const site = await db.collection('sites').findOne({ siteCode: SITE });
  console.log(`\nsite ${SITE} devices: ${(site.devices || []).join(', ')}`);
  await client.close();
  process.exit(0);
})().catch((e) => { console.error('seed error:', e.message); process.exit(1); });
