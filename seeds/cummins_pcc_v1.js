require('dotenv').config();
const mongoose = require('mongoose');
const RulePack = require('../app/api/models/rule_pack');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wanomi';

const pack = {
  packId:      'cummins-pcc-v1',
  deviceType:  'cummins-pcc',
  version:     1,
  description: 'Inferencias de salud Cummins PowerCommand — CR00061 seed (A1, D1, D2, G2)',
  canary:      false,
  rules: [
    {
      ruleId:      'cummins-A1-oil-pressure',
      label:       'Presión de aceite baja',
      inferenceId: 'A1',
      type:        'D',
      severity:    'critical',
      recommendation: 'Detener el grupo urgente. Verificar nivel de aceite y sensor de presión. No operar hasta diagnóstico.',
      correlationParent: null,
      cooldownSec: 60,
      deviceType:  'cummins-pcc',
      variable:    'oil_pressure_psi',
      condition:   { op: 'lt', value: 15 },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
    {
      ruleId:      'cummins-D1-service-due-soon',
      label:       'Service 250h próximo (≤20h restantes)',
      inferenceId: 'D1',
      type:        'D',
      severity:    'warning',
      recommendation: 'Programar service preventivo. Verificar disponibilidad de técnico y repuestos (filtros, aceite).',
      correlationParent: null,
      cooldownSec: 3600,
      deviceType:  'cummins-pcc',
      variable:    'hours_to_next_service_250',
      condition:   { op: 'lte', value: 20 },
      source_filter:  'inferred',
      on_missing_ref: 'ignore',
      reset_behavior: 'manual',
    },
    {
      ruleId:      'cummins-D2-service-overdue',
      label:       'Service 250h vencido',
      inferenceId: 'D2',
      type:        'D',
      severity:    'critical',
      recommendation: 'Service vencido. Coordinar intervención inmediata. Riesgo de falla mecánica en operación.',
      correlationParent: null,
      cooldownSec: 3600,
      deviceType:  'cummins-pcc',
      variable:    'hours_to_next_service_250',
      condition:   { op: 'lt', value: 0 },
      source_filter:  'inferred',
      on_missing_ref: 'ignore',
      reset_behavior: 'manual',
    },
    {
      ruleId:      'cummins-G2-fuel-critical',
      label:       'Nivel de combustible crítico (<15%)',
      inferenceId: 'G2',
      type:        'D',
      severity:    'critical',
      recommendation: 'Nivel crítico de combustible. VERIFICAR FÍSICAMENTE — el sensor de fábrica puede no ser confiable (CR00058). Coordinar reabastecimiento urgente.',
      correlationParent: null,
      cooldownSec: 900,
      deviceType:  'cummins-pcc',
      variable:    'fuel_level_pct',
      condition:   { op: 'lt', value: 15 },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
  ],
};

async function seed() {
  await mongoose.connect(MONGO_URI);
  const result = await RulePack.findOneAndUpdate(
    { packId: pack.packId },
    pack,
    { upsert: true, new: true, runValidators: true }
  );
  console.log(`✅ Seed OK — packId: ${result.packId} · version: ${result.version} · reglas: ${result.rules.length}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('❌ Seed error:', err.message);
  process.exit(1);
});
