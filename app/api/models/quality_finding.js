const mongoose = require('mongoose');
const { Schema } = mongoose;

// DEC-REF-134 — Supervisor de Calidad (5ta pata, `wanomi-qa`). Contrato de datos
// COMPARTIDO: lo ESCRIBE el worker qa (Capas A/B/C) y lo LEE node (/api/qa/*, bloque
// 140). Vive en app/api/models para ser FUENTE ÚNICA de schema (el qa lo importa por
// el mount ./app, igual que el edge importa rule_pack). `module.exports = model(...)`
// (no `export default`) para que el worker qa lo require sin babel, patrón rule_pack.js.
//
// Idempotente por (type, ruleId, dId): el writer hace upsert y agrega count/lastSeen
// en vez de duplicar un hallazgo recurrente (§4 del diseño). dId puede faltar en
// hallazgos de nivel pack/regla (sin instancia) → índice NO único; la idempotencia la
// garantiza el upsert del writer (bloque 135), no una restricción de Mongo.
const QualityFindingSchema = new Schema({
  type:     { type: String, required: true },   // 'I1'..'I13' — invariante/anomalía violada
  severity: { type: String, enum: ['hard', 'soft'], required: true },
  layer:    { type: String, enum: ['A', 'B', 'C'], required: true },  // quién lo encontró

  ruleId:   { type: String, default: null },
  packId:   { type: String, default: null },
  dId:      { type: String, default: null },
  // DEC-REF-139 — `variable` entra a la CLAVE de idempotencia: un finding por fuente
  // (dId, variable) no colapsa con otro del mismo device (data-health). Para findings
  // por-regla `ruleId` ya desambigua (una regla = una variable) → variable=null ahí.
  variable: { type: String, default: null },
  siteCode: { type: String, default: null },

  // Números/serie inspeccionables que alimentan la ficha de hallazgo (histograma,
  // línea de tiempo, %). Mixed: cada tipo de check define su forma (lo documenta 135/138).
  evidence:        { type: Schema.Types.Mixed, default: null },
  suggestedAction: { type: String, default: '' },

  firstSeen: { type: Date, required: true },
  lastSeen:  { type: Date, required: true },
  count:     { type: Number, default: 1 },

  // open = vigente · ack = visto por admin · resolved = ya no se observa ·
  // muted = silenciado a propósito (no vuelve a notificar). Lo togglea /api/qa (bloque 140).
  status: { type: String, enum: ['open', 'ack', 'resolved', 'muted'], default: 'open' },
  // spec_supervisor_confiabilidad_v2 (R3) — cierre automático: corridas seguidas sin verlo; quién y
  // cuándo lo cerró ('auto' = dejó de aparecer 2 corridas · 'aceptado' = deriva aceptada · usuario).
  missedRuns: { type: Number, default: 0 },
  resolvedBy: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
}, {
  timestamps: true,
  collection: 'quality_findings',
});

// Clave de idempotencia + camino de lectura del inventario/ficha.
QualityFindingSchema.index({ type: 1, ruleId: 1, dId: 1, variable: 1 });
QualityFindingSchema.index({ status: 1, lastSeen: -1 });

module.exports = mongoose.model('QualityFinding', QualityFindingSchema);
