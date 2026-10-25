const mongoose = require('mongoose');
const { Schema } = mongoose;

// DEC-REF-137 — Snapshot canónico ("de fábrica") de la definición de cada regla.
// Guarda la PRIMERA versión vista de una regla (siembra o primer PUT) para
// habilitar I13 (drift de forma, bloque 138) y el "revertir a la definición
// original" (antídoto a la corrupción del editor).
//
// module.exports = mongoose.model(...) (patrón rule_pack.js): así lo requieren
// SIN babel tanto la app node como el worker qa (bloque 138, I13).
//
// Una sola foto canónica por ruleId → índice {ruleId:1} unique. Si en el futuro
// se versiona el historial, se relaja el unique.
const RuleSnapshotSchema = new Schema({
  ruleId:       { type: String, required: true, unique: true },
  packId:       { type: String, required: true },
  definition:   { type: Schema.Types.Mixed },   // la regla COMPLETA tal como se vio por primera vez (clon del subdoc)
  capturedFrom: { type: String, enum: ['seed', 'put', 'accepted'] },   // R3: 'accepted' = deriva aceptada como referencia
  acceptedBy:   { type: String, default: null },
  acceptedAt:   { type: Date, default: null },
  capturedAt:   { type: Date, default: Date.now },
}, {
  collection: 'rule_snapshots',
});

module.exports = mongoose.model('RuleSnapshot', RuleSnapshotSchema);
