#!/usr/bin/env node
'use strict';
// Seed de reglas PRESET día-1 (motor M · §14B) — familias técnicas que la UI
// expone en "modo preset" (solo umbral/severidad/recomendación editables).
//
//   · baseline     — z-score = (valor−media)÷σ del buffer. AUTO-CALIBRANTE (aprende
//                    el "normal" del propio equipo). Umbral 3σ = convención estadística
//                    de anomalía (no es un valor de equipo inventado).
//   · acceleration — Δpendiente entre mitades de la ventana. El umbral (unidad/min por
//                    ventana) es un STARTING POINT conservador, editable en campo.
//   · accumulator  — Σ Δt(h) × factor(weightVar) (spec §6). "Vida de aceite" ponderada
//                    por temperatura (arrhenius: duplica cada 10°C sobre 90). Umbral en
//                    horas-equivalentes ≈ intervalo de cambio de aceite (250 h, editable).
//
// IDEMPOTENTE: agrega a los packs existentes por deviceType, dedup por ruleId
// (si ya está, no lo toca). Valida cada regla con el validador REAL (ruleValidation)
// antes de escribir. El edge las toma en el próximo reload (canal SF-3).
//
// Uso:  node -r /root/IotLocalhost/app/node_modules/dotenv/config \
//         tools/seed_packs_preset/seed.js dotenv_config_path=/root/IotLocalhost/app/.env [--dry-run]

const path = require('path');
const APP = '/root/IotLocalhost/app';
const { MongoClient } = require(path.join(APP, 'node_modules/mongodb'));
const { validateM } = require(path.join(APP, 'api/services/ruleValidation.js'));

const URI = process.env.MONGODB_URI;
const DRY = process.argv.includes('--dry-run');
if (!URI) { console.error('ERROR: falta MONGODB_URI (env).'); process.exit(1); }

// Campos por defecto de una regla M (paridad con las reglas ya sembradas).
const M = (o) => Object.assign({
  type: 'M', correlationParent: null, cooldownSec: 300, escalateAfterMinutes: null,
  fallbackToD: false, crossExpr: null, resolveGraceSec: 0, mWindow: null, mParams: {},
  inputs: null, setpointSource: { scale: 1 }, window: { matchCondition: null },
  source_filter: null, on_missing_ref: 'ignore', reset_behavior: 'auto',
}, o);

// ── baseline (preset auto-calibrante, z>3σ) ────────────────────────────────
const baseline = (deviceType, variable, variableLabel) => M({
  ruleId: `${deviceType.toLowerCase()}-baseline-${variable.replace(/_/g, '-')}`,
  label: `${variableLabel} fuera de lo normal`,
  inferenceId: `BASE_${variable.toUpperCase().slice(0, 12)}`,
  severity: 'info', deviceType, variable, unit: '', metric: 'baseline',
  condition: { op: 'gt', value: 3 },
  mWindow: { durationSec: 3600, minSamples: 10 }, mParams: { baselineWindowSec: 3600 },
  variableLabel,
  recommendation: `El valor de ${variableLabel} se salió de lo habitual para este equipo (comparado con su propio comportamiento reciente). Señal temprana: conviene revisarlo antes de que llegue a un valor crítico.`,
});

// ── acceleration (preset, umbral conservador editable) ─────────────────────
const acceleration = (deviceType, variable, variableLabel, unit, op, value, reco) => M({
  ruleId: `${deviceType.toLowerCase()}-accel-${variable.replace(/_/g, '-')}`,
  label: `${variableLabel} empeora cada vez más rápido`,
  inferenceId: `ACCEL_${variable.toUpperCase().slice(0, 11)}`,
  severity: 'warning', deviceType, variable, unit: `${unit}/min`, metric: 'acceleration',
  condition: { op, value },
  mWindow: { durationSec: 600, minSamples: 6 },
  variableLabel, recommendation: reco,
});

// ── accumulator (vida de aceite ponderada por temp) ────────────────────────
const oilLife = (deviceType, tempVar) => M({
  ruleId: `${deviceType.toLowerCase()}-oil-life`,
  label: 'Cambio de aceite pendiente',
  inferenceId: 'OIL_LIFE',
  severity: 'warning', deviceType, variable: tempVar, unit: '', metric: 'accumulator',
  condition: { op: 'gte', value: 250 },
  mParams: { weightVariable: tempVar, weightFn: 'arrhenius', weightRef: 90, weightStep: 10 },
  variableLabel: 'Desgaste del aceite',
  recommendation: 'El aceite ya acumuló las horas de uso de su intervalo de cambio (las horas cuentan más cuando el motor trabaja caliente). Programar el cambio de aceite.',
});

// packId (por deviceType) → reglas preset a agregar.
const SEED = {
  'eltek-smartpack-v1': [
    baseline('ELTEK', 'temperature', 'temperatura del sistema'),
    acceleration('ELTEK', 'dc_bus_voltage', 'tensión DC', 'V', 'gt', 0.5,
      'La tensión del bus DC cae cada vez más rápido: la batería se está descargando de forma acelerada. Revisar carga y rectificador antes de que corte.'),
  ],
  'cummins-pcc-v1': [
    baseline('cummins-pcc', 'coolant_temp', 'temperatura de refrigerante'),
    acceleration('cummins-pcc', 'coolant_temp', 'temperatura de refrigerante', '°C', 'gt', 0.5,
      'El refrigerante se está calentando cada vez más rápido: posible falla de refrigeración en curso. Intervenir antes de que llegue a temperatura crítica.'),
    oilLife('cummins-pcc', 'coolant_temp'),
  ],
  'gen-grupo-v1': [
    baseline('GEN', 'exhaust_temp', 'temperatura de escape'),
  ],
};

(async () => {
  // Gate de validación (validador real) ANTES de tocar la base.
  let bad = 0;
  for (const [pack, rules] of Object.entries(SEED)) {
    for (const r of rules) {
      const v = validateM(r);
      if (!v.ok) { console.error(`  ✗ ${pack} · ${r.ruleId}: ${v.reason}`); bad++; }
      else console.log(`  ✓ validada ${r.ruleId} (${r.metric})`);
    }
  }
  if (bad) { console.error(`ABORT: ${bad} regla(s) inválida(s).`); process.exit(1); }
  if (DRY) { console.log('\n--dry-run: no se escribió nada.'); process.exit(0); }

  const client = new MongoClient(URI, { useUnifiedTopology: true });
  await client.connect();
  const db = client.db();
  let added = 0, skipped = 0;
  for (const [packId, rules] of Object.entries(SEED)) {
    const pack = await db.collection('rulepacks').findOne({ packId });
    if (!pack) { console.warn(`  · pack ${packId} no existe — omitido`); continue; }
    const have = new Set((pack.rules || []).map((x) => x.ruleId));
    const toAdd = rules.filter((r) => !have.has(r.ruleId));
    skipped += rules.length - toAdd.length;
    if (!toAdd.length) { console.log(`  · ${packId}: nada nuevo`); continue; }
    await db.collection('rulepacks').updateOne({ packId }, { $push: { rules: { $each: toAdd } }, $inc: { version: 1 } });
    added += toAdd.length;
    console.log(`  + ${packId}: ${toAdd.map((r) => r.ruleId).join(', ')}`);
  }
  console.log(`\nseed preset: +${added} agregadas · ${skipped} ya existían.`);
  await client.close();
  process.exit(0);
})().catch((e) => { console.error('seed error:', e.message); process.exit(1); });
