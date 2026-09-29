#!/usr/bin/env node
'use strict';
// Seed Ola A — alineación sistema ↔ catálogo de fallas (catalogo_fallas_equipos.html).
// Siembra las reglas DEMOSTRABLES con los equipos/escenarios actuales que faltaban:
//   · Pack Seguridad (no existía ninguno): intrusión / cerco / robo de cobre / tierra / temp de sala.
//   · Sifoneo de combustible (⭐ pitch): salto abrupto de fuel_level en grupo (GEN + Cummins).
//   · Desbalance de rectificadores: spread de dc_load_current (ELTEK).
//   · Deja de reportar (staleness) y sensor clavado (flatline) en planta DC y grupo.
//   · Flapping de red (ATS).
// IDEMPOTENTE (dedup por ruleId), gate con el validador real (validateRule).
//
// Uso: node -r /root/IotLocalhost/app/node_modules/dotenv/config \
//        tools/seed_packs_catalogo/seed.js dotenv_config_path=/root/IotLocalhost/app/.env [--dry-run]

const path = require('path');
const APP = '/root/IotLocalhost/app';
const { MongoClient } = require(path.join(APP, 'node_modules/mongodb'));
const { validateRule } = require(path.join(APP, 'api/services/ruleValidation.js'));

const URI = process.env.MONGODB_URI;
const DRY = process.argv.includes('--dry-run');
if (!URI) { console.error('ERROR: falta MONGODB_URI'); process.exit(1); }

const COMMON = {
  correlationParent: null, cooldownSec: 300, escalateAfterMinutes: null,
  fallbackToD: false, crossExpr: null, resolveGraceSec: 0, mParams: {},
  inputs: null, mWindow: null, setpointSource: { scale: 1 }, window: { matchCondition: null },
  source_filter: null, on_missing_ref: 'ignore', reset_behavior: 'auto',
};
const D = (deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, op, value, reco) =>
  Object.assign({}, COMMON, { type: 'D', deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, condition: { op, value }, recommendation: reco });
const M = (deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, metric, op, value, extra, reco) =>
  Object.assign({}, COMMON, { type: 'M', deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, metric, condition: { op, value }, recommendation: reco }, extra || {});
const S = (deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, win, reco) =>
  Object.assign({}, COMMON, { type: 'S', deviceType, ruleId, label, variableLabel, unit, inferenceId, severity, variable, condition: null, window: win, recommendation: reco });

// ── Pack Seguridad (NUEVO) ──────────────────────────────────────────────
const SEC_RULES = [
  D('SEC', 'sec-intrusion-puerta', 'Apertura de puerta', 'Puerta del shelter', '', 'SEC_DOOR', 'critical', 'door_shelter', 'gte', 1,
    'Apertura de puerta del shelter fuera de una visita programada. Verificar el sitio y despachar según protocolo.'),
  D('SEC', 'sec-intrusion-mov', 'Movimiento interior', 'Movimiento (PIR)', '', 'SEC_PIR', 'critical', 'pir_motion', 'gte', 1,
    'Movimiento interior detectado sin visita programada. Verificar el sitio.'),
  D('SEC', 'sec-cerco', 'Golpe o corte de cerco', 'Vibración de cerco', '', 'SEC_FENCE', 'warning', 'fence_vibration', 'gte', 1,
    'Golpe o corte en el cerco perimetral. Verificar el perímetro del sitio.'),
  D('SEC', 'sec-robo-cobre', 'Movimiento de cobre', 'Anomalía de cobre', '', 'SEC_COPPER', 'critical', 'copper_field_anomaly', 'gte', 1,
    'Movimiento de cobre en el perímetro. Inspección física inmediata del sitio.'),
  D('SEC', 'sec-tierra', 'Pérdida de tierra', 'Continuidad de tierra', '', 'SEC_GND', 'warning', 'ground_continuity', 'lte', 0,
    'Pérdida de continuidad de tierra: posible corte o robo de cobre. Inspección física.'),
  D('SEC', 'sec-sala-warn', 'Sala caliente', 'Temperatura de sala', '°C', 'SEC_TEMP1', 'warning', 'shelter_temp', 'gt', 40,
    'Temperatura de sala alta: verificar la climatización del sitio.'),
  D('SEC', 'sec-sala-crit', 'Sala muy caliente', 'Temperatura de sala', '°C', 'SEC_TEMP2', 'critical', 'shelter_temp', 'gt', 45,
    'Temperatura de sala crítica: riesgo térmico para los equipos. Despachar climatización con prioridad.'),
];
const SEC_PACK = {
  packId: 'sec-seguridad-v1', deviceType: 'SEC', version: 1, canary: false,
  description: 'Seguridad del sitio (intrusión, cerco, cobre, tierra, temperatura de sala) — catálogo de fallas',
  rules: SEC_RULES,
};

// ── Agregados a packs existentes ─────────────────────────────────────────
const SIFONEO = (dt) => M(dt, dt.toLowerCase() + '-sifoneo', 'Robo de combustible (sifoneo)', 'Nivel de combustible', '%', 'FUEL_SIPHON', 'critical',
  'fuel_level', 'stepJump', 'gte', 4, { mWindow: { durationSec: 600, minSamples: 2 } },
  'Caída brusca de combustible no explicada por consumo: posible sifoneo o fuga. Inspección física del sitio.');
const STALE = (dt, variable) => M(dt, dt.toLowerCase() + '-deja-reportar', 'El equipo deja de reportar', 'Comunicación', 'min', 'STALE', 'critical',
  variable, 'staleness', 'gte', 10, null,
  'El equipo dejó de reportar por más de 10 min: revisar el enlace de comunicación y la alimentación del controlador.');

const ADD = {
  'gen-grupo-v1': [ SIFONEO('GEN'), STALE('GEN', 'fuel_level') ],
  'cummins-pcc-v1': [ SIFONEO('cummins-pcc'), STALE('cummins-pcc', 'coolant_temp') ],
  'eltek-smartpack-v1': [
    M('ELTEK', 'eltek-desbalance', 'Rectificador desbalanceado', 'Corriente de carga', 'A', 'RECT_SPREAD', 'warning',
      'dc_load_current', 'spread', 'gt', 30, null,
      'Un rectificador se lleva mucha más carga que el resto (posible degradación del módulo). Revisar el módulo señalado.'),
    M('ELTEK', 'eltek-sensor-clavado', 'Sensor de tensión DC clavado', 'Tensión DC', 'V', 'DC_FLATLINE', 'warning',
      'dc_bus_voltage', 'flatline', 'lte', 0.2, { mWindow: { durationSec: 120, minSamples: 3 } },
      'Lectura de tensión DC congelada: sensor muerto o driver colgado. Revisar el sensor.'),
    STALE('ELTEK', 'dc_bus_voltage'),
  ],
  'ats-inteliats-v1': [
    S('ATS', 'ats-flapping', 'Red inestable (flapping)', 'Tensión de red', 'V', 'MAINS_FLAP', 'warning', 'mains_voltage',
      { durationSec: 600, countThreshold: 4, matchCondition: { op: 'lt', value: 100 } },
      'La red entra y sale repetidamente (inestable): reportar la calidad de red al distribuidor eléctrico.'),
  ],
};

(async () => {
  // Gate de validación
  let bad = 0;
  const all = [...SEC_RULES, ...Object.values(ADD).flat()];
  for (const r of all) {
    const v = validateRule(r);
    if (!v.ok) { console.error(`  ✗ ${r.ruleId} [${r.type}${r.metric ? ':' + r.metric : ''}]: ${v.reason}`); bad++; }
    else console.log(`  ✓ ${r.ruleId} [${r.type}${r.metric ? ':' + r.metric : ''}]`);
  }
  if (bad) { console.error(`ABORT: ${bad} inválida(s).`); process.exit(1); }
  if (DRY) { console.log('\n--dry-run: no se escribió nada.'); process.exit(0); }

  const client = new MongoClient(URI, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  const packs = db.collection('rulepacks');
  let added = 0;

  // SEC pack: crear si no existe; si existe, agregar reglas faltantes.
  const sec = await packs.findOne({ packId: SEC_PACK.packId });
  if (!sec) { await packs.insertOne(SEC_PACK); added += SEC_RULES.length; console.log(`  + creado pack ${SEC_PACK.packId} (${SEC_RULES.length} reglas)`); }
  else {
    const have = new Set((sec.rules || []).map((x) => x.ruleId));
    const toAdd = SEC_RULES.filter((r) => !have.has(r.ruleId));
    if (toAdd.length) { await packs.updateOne({ packId: SEC_PACK.packId }, { $push: { rules: { $each: toAdd } }, $inc: { version: 1 } }); added += toAdd.length; console.log(`  + ${SEC_PACK.packId}: ${toAdd.map(r => r.ruleId).join(', ')}`); }
    else console.log(`  · ${SEC_PACK.packId}: nada nuevo`);
  }

  for (const [packId, rules] of Object.entries(ADD)) {
    const p = await packs.findOne({ packId });
    if (!p) { console.warn(`  · ${packId} no existe — omitido`); continue; }
    const have = new Set((p.rules || []).map((x) => x.ruleId));
    const toAdd = rules.filter((r) => !have.has(r.ruleId));
    if (!toAdd.length) { console.log(`  · ${packId}: nada nuevo`); continue; }
    await packs.updateOne({ packId }, { $push: { rules: { $each: toAdd } }, $inc: { version: 1 } });
    added += toAdd.length;
    console.log(`  + ${packId}: ${toAdd.map(r => r.ruleId).join(', ')}`);
  }
  console.log(`\nseed Ola A: +${added} reglas.`);
  await client.close();
  process.exit(0);
})().catch((e) => { console.error('seed error:', e.message); process.exit(1); });
