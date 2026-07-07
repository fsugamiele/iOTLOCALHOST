require('dotenv').config();
const mongoose = require('mongoose');
const RulePack = require('../app/api/models/rule_pack');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wanomi';

const pack = {
  packId:      'cummins-pcc-v1',
  deviceType:  'cummins-pcc',
  version:     3,
  description: 'Salud Cummins PowerCommand + cascada mains-loss → gen-no-start (A0, A1, G2, M1→C1) — CR00061 seed · v3: A0/A1 inhibidas con motor parado (DEC-REF-56)',
  canary:      false,
  rules: [
    {
      // DEC-REF-56 — A0 pasa a condición compuesta `rpm > 300 AND oil_pressure
      // < 2.0`. Fundamento: genset detenido reporta oil_pressure=0 por
      // física (la bomba de aceite depende del cigüeñal); la alarma real
      // solo arma con motor en marcha. Umbral rpm=300: el sim publica 0
      // en reposo y target 1500 con gen_running=true (rango real Cummins
      // ~1500 nominal); 300 separa "coasting/off" de "arrancado" sin
      // ambigüedad. Motor cross-expr reusado tal cual (DEC-REF-47/-53):
      // ambas hojas sobre el mismo device (`cummins-pcc`) — la búsqueda
      // por deviceType+siteCode (typeCross.js:53) resuelve al único
      // CUMMINS del sitio. graceSec:0 (compound activa dispara inmediato,
      // el cooldown gestiona los transitorios). Mantiene severity warning,
      // cooldownSec 300 y correlationParent:null.
      ruleId:      'cummins-A0-oil-pressure-low',
      label:       'Presión de aceite baja (advertencia)',
      variableLabel: 'Presión de aceite',
      unit:          'Bar',
      inferenceId: 'A0',
      type:        'cross',
      severity:    'warning',
      recommendation: 'Presión de aceite en descenso. Programar verificación de nivel y estado del sensor.',
      correlationParent: null,
      cooldownSec: 300,
      graceSec:    0,
      deviceType:  'cummins-pcc',
      variable:    'oil_pressure',
      condition:   null,
      crossExpr: {
        op: 'AND',
        children: [
          { deviceType: 'cummins-pcc', variable: 'rpm',          condition: { op: 'gt', value: 300 } },
          { deviceType: 'cummins-pcc', variable: 'oil_pressure', condition: { op: 'lt', value: 2.0 } },
        ],
      },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
    {
      // DEC-REF-56 — A1 espeja A0 con umbral crítico 1.0 Bar y cooldown 60s.
      // Misma inhibición de motor parado (rpm > 300). Mantiene severity
      // critical y correlationParent:null. Ver A0 arriba para el detalle
      // del fundamento y de la geometría cross-single-device.
      ruleId:      'cummins-A1-oil-pressure',
      label:       'Presión de aceite baja',
      variableLabel: 'Presión de aceite',
      unit:          'Bar',
      inferenceId: 'A1',
      type:        'cross',
      severity:    'critical',
      recommendation: 'Detener el grupo urgente. Verificar nivel de aceite y sensor de presión. No operar hasta diagnóstico.',
      correlationParent: null,
      cooldownSec: 60,
      graceSec:    0,
      deviceType:  'cummins-pcc',
      variable:    'oil_pressure',
      condition:   null,
      crossExpr: {
        op: 'AND',
        children: [
          { deviceType: 'cummins-pcc', variable: 'rpm',          condition: { op: 'gt', value: 300 } },
          { deviceType: 'cummins-pcc', variable: 'oil_pressure', condition: { op: 'lt', value: 1.0 } },
        ],
      },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
    {
      ruleId:      'cummins-G2-fuel-critical',
      label:       'Nivel de combustible crítico (<15%)',
      variableLabel: 'Nivel de combustible',
      unit:          '%',
      inferenceId: 'G2',
      type:        'D',
      severity:    'critical',
      recommendation: 'Nivel crítico de combustible. VERIFICAR FÍSICAMENTE — el sensor de fábrica puede no ser confiable (CR00058). Coordinar reabastecimiento urgente.',
      correlationParent: null,
      cooldownSec: 900,
      deviceType:  'cummins-pcc',
      variable:    'fuel_level',
      condition:   { op: 'lt', value: 15 },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
    {
      // DEC-REF-53 D4 opción (b) — madre de la cascada.
      // Alarma de dominio ATS viviendo transitoriamente en pack cummins-pcc;
      // migrar a pack ATS futuro con DEC propio.
      // Base: fixture `e2e-mains-loss-root` validado E2E en A3.3 (bitácora #40-R7).
      ruleId:      'cummins-M1-mains-loss',
      label:       'Pérdida de AC en sitio',
      variableLabel: 'Tensión red (V)',
      unit:          'V',
      inferenceId: 'M1',
      type:        'D',
      severity:    'critical',
      recommendation: 'Verificar red pública y estado del ATS. Confirmar transferencia a generador.',
      correlationParent: null,
      cooldownSec: 300,
      deviceType:  'ATS',
      variable:    'mains_voltage',
      condition:   { op: 'lt', value: 100 },
      source_filter:  'connect',
      on_missing_ref: 'alarm',
      reset_behavior: 'auto',
    },
    {
      // DEC-REF-53 D4 — regla cross del pack productivo: cascada mains-loss → gen-no-start.
      // graceSec, cooldownSec, severity y crossExpr heredados del fixture A3.3 validado E2E
      // (bitácora #40-R7 pack e2e-cascade-test-v1). Bypass del gate deviceType+variable (DEC-REF-51).
      // correlationParent apunta a M1 (opción (b) R4): la vista de cascada agrupa madre→hija.
      ruleId:      'cummins-C1-mains-loss-gen-no-start',
      label:       'Corte de AC sostenido sin arranque del grupo',
      variableLabel: 'cascada AC→gen',
      unit:          '',
      inferenceId: 'C1',
      type:        'cross',
      severity:    'critical',
      recommendation: 'Verificar controlador de arranque del grupo. Grupo no respondió al corte de AC en el plazo esperado.',
      correlationParent: 'cummins-M1-mains-loss',
      cooldownSec: 300,
      graceSec:    90,
      deviceType:  'ATS',
      variable:    'n/a',
      condition:   null,
      crossExpr: {
        op: 'AND',
        children: [
          { deviceType: 'ATS', variable: 'mains_voltage', condition: { op: 'lt',  value: 100 } },
          { deviceType: 'ATS', variable: 'gen_status',    condition: { op: 'neq', value: 'RUNNING' } },
        ],
      },
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
