const mongoose = require('mongoose');
const { Schema } = mongoose;

// spec_supervisor_confiabilidad_v2 (Qs4) — foto de confiabilidad que el worker qa calcula cada
// `qa_config.everyMin` y la UI solo lee. Cada número trae n, IC y confianza (§0); lo que no se puede
// calcular va null (nunca Infinity/NaN). Se guardan las últimas; la API devuelve la más nueva.
const ReliabilitySnapshotSchema = new Schema({
  siteCode:   { type: String, required: true },
  computedAt: { type: Date, required: true },
  window:     { type: Schema.Types.Mixed, required: true },   // { t0, t1, T, isaDays }
  config:     { type: Schema.Types.Mixed, default: null },    // copia de qa_config usada
  sitio:      { type: Schema.Types.Mixed, default: null },    // Ao del sitio (caídas de energía)
  agg:        { type: Schema.Types.Mixed, default: null },    // parque
  equipos:    { type: [Schema.Types.Mixed], default: [] },
  isa:        { type: Schema.Types.Mixed, default: null },
  datos:      { type: [Schema.Types.Mixed], default: [] },    // completitud por medición
  notas:      { type: [String], default: [] },
  durationMs: { type: Number, default: null },
}, { collection: 'reliability_snapshots' });

ReliabilitySnapshotSchema.index({ siteCode: 1, computedAt: -1 });
ReliabilitySnapshotSchema.index({ computedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.models.ReliabilitySnapshot || mongoose.model('ReliabilitySnapshot', ReliabilitySnapshotSchema);
