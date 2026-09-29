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
const APP = '/root/IotLocalhost/app';
const { MongoClient, ObjectId } = require(path.join(APP, 'node_modules/mongodb'));
const axios = require(path.join(APP, 'node_modules/axios'));

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('ERROR: falta MONGODB_URI'); process.exit(1); }

// EMQX REST (mismo patrón que devices.js) — para crear la SAVER-RULE del device
// (persistencia): sin ella el interruptor de base de datos queda en OFF.
const EMQX_HOST = process.env.EMQX_API_HOST || 'localhost';
const EMQX_AUTH = { auth: { username: 'admin', password: process.env.EMQX_DEFAULT_APPLICATION_SECRET } };
let _saverResource = null;
async function saverResourceId() {
  if (_saverResource) return _saverResource;
  const r = await axios.get(`http://${EMQX_HOST}:8085/api/v4/rules`, EMQX_AUTH);
  const s = (r.data.data || []).find((x) => /SAVER/i.test(x.description || '') && x.actions && x.actions[0] && x.actions[0].params && x.actions[0].params.$resource);
  if (!s) throw new Error('no hay SAVER-RULE existente de la cual tomar el resource id');
  _saverResource = s.actions[0].params.$resource;
  return _saverResource;
}
async function ensureSaverRule(db, userId, dId) {
  if (await db.collection('saverrules').findOne({ dId })) { console.log(`    · saver de ${dId} ya existía`); return; }
  const resource = await saverResourceId();
  const topic = `${userId}/${dId}/+/sdata`;
  const newRule = {
    rawsql: `SELECT topic, payload FROM "${topic}" WHERE payload.save = 1`,
    actions: [{ name: 'data_to_webserver', params: { $resource: resource, payload_tmpl: `{"userId":"${userId}","payload":\${payload},"topic":"\${topic}"}` } }],
    description: 'SAVER-RULE', enabled: true,
  };
  const res = await axios.post(`http://${EMQX_HOST}:8085/api/v4/rules`, newRule, EMQX_AUTH);
  if (res.status === 200 && res.data.data) {
    await db.collection('saverrules').insertOne({ userId, dId, emqxRuleId: res.data.data.id, status: true, __v: 0 });
    console.log(`    + saver rule creada para ${dId} (${res.data.data.id})`);
  } else throw new Error('EMQX no devolvió rule id');
}
const ADMIN = '6a32e105be5ca779169754af';
const SITE = 'CR00061';
const now = Date.now();

const V = (name, label, type, unit, deadband) => ({ name, label, type, unit, deadband, limits: [], factoryRange: '' });
// Forma de widget alineada con los templates que SÍ renderizan (SEC/ELTEK):
// bool → booleanDwell · float → numeric+render, ambos con column + enumValues + bitmapDictionary.
const W = (variable, variableFullName, variableType, unit, deadband, icon) => {
  const isBool = variableType === 'bool';
  const w = {
    variable, variableFullName, variableType, variableSendFreq: 30, unit: unit || '',
    enumValues: [], bitmapDictionary: [], column: 'col-3',
    icon: icon || (isBool ? 'fa-bell' : 'fa-tachometer-alt'),
  };
  if (isBool) { w.widget = 'booleanDwell'; w.dwellWindowHours = 24; }
  else { w.widget = 'numeric'; w.render = 'valueStatus'; w.deadband = deadband; w.decimalPlaces = null; w.factoryRange = ''; }
  return w;
};

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
      W('battery_theft_alarm', 'Robo de baterías', 'bool', '', undefined),
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
      W('unit1_status', 'Aire 1 en marcha', 'bool', '', undefined),
      W('unit1_fault', 'Falla aire 1', 'bool', '', undefined),
      W('unit2_status', 'Aire 2 en marcha', 'bool', '', undefined),
      W('unit2_fault', 'Falla aire 2', 'bool', '', undefined),
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

    // 2) template — upsert por name, con _id estable. Los widgets SIEMPRE se
    //    re-escriben (forma correcta: booleanDwell/numeric + column) aunque exista.
    let tpl = await db.collection('templates').findOne({ name: e.templateName });
    const _id = tpl ? tpl._id : new ObjectId();
    await db.collection('templates').updateOne(
      { name: e.templateName },
      { $set: { widgets: e.widgets, heartbeatSec: 300, deviceType: e.deviceType },
        $setOnInsert: { _id, name: e.templateName, description: `${e.manufacturer} ${e.model} (Wanomi sim)`, userId: ADMIN, createdTime: now } },
      { upsert: true });
    tpl = { _id };

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

    // 5) regla saver (persistencia en base de datos) — interruptor ON
    await ensureSaverRule(db, ADMIN, e.dId);
  }

  const site = await db.collection('sites').findOne({ siteCode: SITE });
  console.log(`\nsite ${SITE} devices: ${(site.devices || []).join(', ')}`);
  await client.close();
  process.exit(0);
})().catch((e) => { console.error('seed error:', e.message); process.exit(1); });
