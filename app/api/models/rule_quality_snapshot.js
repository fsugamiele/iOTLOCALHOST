const mongoose = require('mongoose');
const { Schema } = mongoose;

// spec_supervisor_confiabilidad_v2 (R2) — calidad de las reglas: 30 días reproducidos con el motor
// completo. La escribe el worker qa (Capa C nocturna o a pedido) y la UI solo la lee.
const RuleQualitySnapshotSchema = new Schema({
  siteCode:   { type: String, required: true },
  computedAt: { type: Date, required: true },
  days:       { type: Number, required: true },
  from:       { type: Number }, to: { type: Number }, rows: { type: Number },
  reglas:     { type: [Schema.Types.Mixed], default: [] },
  notas:      { type: [String], default: [] },
  durationMs: { type: Number, default: null },
}, { collection: 'rule_quality_snapshots' });

RuleQualitySnapshotSchema.index({ siteCode: 1, computedAt: -1 });
RuleQualitySnapshotSchema.index({ computedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.models.RuleQualitySnapshot || mongoose.model('RuleQualitySnapshot', RuleQualitySnapshotSchema);
