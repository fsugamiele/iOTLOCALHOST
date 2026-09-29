#!/usr/bin/env node
'use strict';
// Ola B — reglas de batería litio (LITIO) y aire acondicionado (AA), sobre los
// devices simulados que creó tools/seed_devices_sim/. Idempotente, gate validateRule.
//
// Uso: node -r /root/IotLocalhost/app/node_modules/dotenv/config \
//        tools/seed_packs_litio_aa/seed.js dotenv_config_path=/root/IotLocalhost/app/.env [--dry-run]

const path = require('path');
const APP = '/root/IotLocalhost/app';
const { MongoClient } = require(path.join(APP, 'node_modules/mongodb'));
const { validateRule } = require(path.join(APP, 'api/services/ruleValidation.js'));

const URI = process.env.MONGODB_URI;
const DRY = process.argv.includes('--dry-run');
if (!URI) { console.error('ERROR: falta MONGODB_URI'); process.exit(1); }

const COMMON = { correlationParent: null, cooldownSec: 300, escalateAfterMinutes: null, fallbackToD: false, crossExpr: null, resolveGraceSec: 0, mParams: {}, inputs: null, mWindow: null, setpointSource: { scale: 1 }, window: { matchCondition: null }, source_filter: null, on_missing_ref: 'ignore', reset_behavior: 'auto' };
const D = (dt, ruleId, label, variableLabel, unit, inf, sev, variable, op, value, reco) =>
  Object.assign({}, COMMON, { type: 'D', deviceType: dt, ruleId, label, variableLabel, unit, inferenceId: inf, severity: sev, variable, condition: { op, value }, recommendation: reco });
const CROSS = (dt, ruleId, label, inf, sev, children, reco) =>
  Object.assign({}, COMMON, { type: 'cross', deviceType: dt, ruleId, label, variableLabel: '', unit: '', inferenceId: inf, severity: sev, variable: null, condition: null, crossExpr: { op: 'AND', children }, recommendation: reco });

const LITIO_PACK = {
  packId: 'litio-bateria-v1', deviceType: 'LITIO', version: 1, canary: false,
  description: 'Banco de baterías litio (carga, tensión, celdas, robo) — catálogo de fallas',
  rules: [
    D('LITIO', 'litio-soc-warn', 'Carga del banco baja', 'Estado de carga', '%', 'LITIO_SOC1', 'warning', 'soc', 'lt', 30,
      'Carga del banco baja: menos respaldo ante un corte. Verificar la energía de entrada y los rectificadores.'),
    D('LITIO', 'litio-soc-crit', 'Carga del banco crítica', 'Estado de carga', '%', 'LITIO_SOC2', 'critical', 'soc', 'lt', 15,
      'Carga del banco crítica: riesgo de corte por batería agotada. Verificar la energía de entrada con urgencia.'),
    D('LITIO', 'litio-pack-lvd', 'Tensión del banco al mínimo', 'Tensión del banco', 'V', 'LITIO_PACKV', 'critical', 'pack_voltage', 'lt', 42,
      'Tensión del banco cerca del mínimo de desconexión. Verificar rectificadores y energía de entrada antes de que corte.'),
    D('LITIO', 'litio-celda-desbalance', 'Celda desbalanceada', 'Desbalance de celdas', 'V', 'LITIO_CELL', 'warning', 'cell_voltage_spread', 'gt', 0.06,
      'Celda desbalanceada: anticipa la degradación del módulo. Programar el reemplazo antes de perder autonomía.'),
    D('LITIO', 'litio-celda-caliente', 'Celda caliente', 'Temperatura de celda', '°C', 'LITIO_CTEMP', 'warning', 'cell_temp_max', 'gt', 45,
      'Celda caliente aislada: revisar la ventilación y el estado del módulo.'),
    D('LITIO', 'litio-robo', 'Robo de baterías', 'Robo de baterías', '', 'LITIO_THEFT', 'critical', 'battery_theft_alarm', 'gte', 1,
      'Alarma de robo de baterías del BMS. Inspección física inmediata del sitio.'),
  ],
};

const AA_PACK = {
  packId: 'aa-clima-v1', deviceType: 'AA', version: 1, canary: false,
  description: 'Climatización (falla de equipo, temperatura de sala) — catálogo de fallas',
  rules: [
    D('AA', 'aa-falla-punta', 'Falla del aire de punta', 'Falla aire 1', '', 'AA_FAULT1', 'warning', 'unit1_fault', 'gte', 1,
      'Falla del aire de punta: la reserva tomó la carga. Despachar service de clima antes del alza térmica.'),
    D('AA', 'aa-sala-warn', 'Sala caliente', 'Temperatura de sala', '°C', 'AA_TEMP1', 'warning', 'room_temp', 'gt', 40,
      'Temperatura de sala alta: verificar la climatización del sitio.'),
    D('AA', 'aa-sala-crit', 'Sala muy caliente', 'Temperatura de sala', '°C', 'AA_TEMP2', 'critical', 'room_temp', 'gt', 45,
      'Temperatura de sala crítica: riesgo térmico para los equipos. Despachar climatización con prioridad.'),
    CROSS('AA', 'aa-doble-falla', 'Ambos aires en falla', 'AA_BOTH', 'critical',
      [{ deviceType: 'AA', variable: 'unit1_fault', condition: { op: 'gte', value: 1 } },
       { deviceType: 'AA', variable: 'unit2_fault', condition: { op: 'gte', value: 1 } }],
      'Ambos equipos de aire en falla: riesgo térmico inminente. Despacho urgente de climatización.'),
  ],
};

(async () => {
  const packs = [LITIO_PACK, AA_PACK];
  let bad = 0;
  for (const p of packs) for (const r of p.rules) {
    const v = validateRule(r);
    if (!v.ok) { console.error(`  ✗ ${r.ruleId} [${r.type}]: ${v.reason}`); bad++; }
    else console.log(`  ✓ ${r.ruleId} [${r.type}]`);
  }
  if (bad) { console.error(`ABORT: ${bad} inválida(s).`); process.exit(1); }
  if (DRY) { console.log('\n--dry-run: no se escribió nada.'); process.exit(0); }

  const client = new MongoClient(URI, { useUnifiedTopology: true });
  await client.connect();
  const col = client.db().collection('rulepacks');
  for (const P of packs) {
    const ex = await col.findOne({ packId: P.packId });
    if (!ex) { await col.insertOne(P); console.log(`  + creado ${P.packId} (${P.rules.length} reglas)`); continue; }
    const have = new Set((ex.rules || []).map((x) => x.ruleId));
    const toAdd = P.rules.filter((r) => !have.has(r.ruleId));
    if (toAdd.length) { await col.updateOne({ packId: P.packId }, { $push: { rules: { $each: toAdd } }, $inc: { version: 1 } }); console.log(`  + ${P.packId}: ${toAdd.map(r => r.ruleId).join(', ')}`); }
    else console.log(`  · ${P.packId}: nada nuevo`);
  }
  await client.close();
  process.exit(0);
})().catch((e) => { console.error('seed error:', e.message); process.exit(1); });
