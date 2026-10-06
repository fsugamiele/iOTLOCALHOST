const mongoose = require('mongoose');
const { Schema } = mongoose;

// DEC-REF-134 — bitácora de AUTO-AUDITORÍA del supervisor (§4 del diseño): cada corrida
// de una capa deja constancia de QUÉ chequeó y si terminó bien. Regla cardinal: un check
// que NO corrió NO pasa como verde — la UI distingue "sano" de "nunca se evaluó" leyendo
// esta colección (la lección del subagente caído: cobertura explícita, no implícita).
// Schema COMPARTIDO (lo escribe qa, lo lee node). `module.exports = model(...)` sin babel.
const QaRunSchema = new Schema({
  layer:  { type: String, enum: ['A', 'B', 'C'], required: true },
  checks: { type: [String], default: [] },          // qué invariantes corrieron (ej. ['I1','I6'])

  rulesCovered:   { type: [String], default: [] },
  devicesCovered: { type: [String], default: [] },
  findingsWritten: { type: Number, default: 0 },

  startedAt:  { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  ok:         { type: Boolean, default: false },     // terminó sin excepción
  error:      { type: String, default: null },       // stack/mensaje si ok=false
}, {
  timestamps: true,
  collection: 'qa_runs',
});

QaRunSchema.index({ layer: 1, startedAt: -1 });

module.exports = mongoose.model('QaRun', QaRunSchema);
