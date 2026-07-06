const mongoose = require('mongoose');
const { Schema } = mongoose;

const ConditionSchema = new Schema({
  op:    { type: String, enum: ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'], required: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const RuleDefinitionSchema = new Schema({
  ruleId:      { type: String, required: true },
  label:       { type: String, required: true },
  variableLabel: { type: String, default: '' },  // nombre legible de la variable (DEC-47, UI español)
  unit:          { type: String },               // unidad de medida (ej. 'kPa', 'h', '%', 'rpm')
  inferenceId: { type: String, required: true },

  type: { type: String, enum: ['D', 'C', 'S', 'cross'], required: true },

  severity:          { type: String, enum: ['info', 'warning', 'critical'], required: true },
  recommendation:    { type: String, default: '' },
  correlationParent: { type: String, default: null },
  cooldownSec:       { type: Number, default: 300 },
  escalateAfterMinutes: { type: Number, default: null }, // EDGE-2: minutos sin setpoint antes de escalar INFO→warning. null = sin escalada (opt-in). Calibrable en producción.

  deviceType: { type: String, required: true },
  variable:   { type: String, required: true },

  condition: { type: ConditionSchema, default: null },

  setpointSource: {
    register: { type: Number },
    scale:    { type: Number, default: 1 },
    variable: { type: String },   // NOMBRE de la key en siteState donde el driver publica el setpoint real (ej. 'coolant_temp_warning_setpoint'). NO confundir con `variable` raíz (la variable observada). DEC-REF-18, #22
  },
  fallbackToD: { type: Boolean, default: true },

  window: {
    durationSec:    { type: Number },
    countThreshold: { type: Number },
    matchCondition: { type: ConditionSchema, default: null },
  },

  crossExpr: { type: Schema.Types.Mixed, default: null },
  graceSec:  { type: Number },  // DEC-REF-53 D3 — grace del temporizador reactivo (cross), consumido por typeCross.js:96

  source_filter:  { type: String, enum: ['physical', 'inferred', 'connect', null], default: null },
  on_missing_ref: { type: String, enum: ['ignore', 'alarm'], default: 'ignore' },
  reset_behavior: { type: String, enum: ['auto', 'manual'], default: 'auto' },

}, { _id: false });

module.exports = RuleDefinitionSchema;
