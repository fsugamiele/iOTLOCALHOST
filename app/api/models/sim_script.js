const mongoose = require('mongoose');
const { Schema } = mongoose;

// DEC-REF-100 D-8 (#75, F8) — Guiones de escenario del simulador.
// Un guion es una secuencia de pasos (segundo + equipo + variable + valor)
// sobre los devices simulados de UN sitio. El reloj corre EN EL SERVIDOR
// (simScriptRunner.js) publicando set_sensor por el mismo camino que el
// botón Aplicar; el proceso del simulador no se toca.
//
// Límites firmados: 50 pasos / 30 minutos (1800 s) por guion.
// cleanup: 'reset' = al terminar, reset de cada equipo tocado (volver a la
// normalidad); 'hold' = dejar los valores donde el último paso los dejó.

const SimScriptStepSchema = new Schema({
  atSec:    { type: Number, required: true, min: 0, max: 1800 },
  dId:      { type: String, required: true },
  variable: { type: String, required: true },
  value:    { type: Schema.Types.Mixed, required: true },
}, { _id: false });

const SimScriptSchema = new Schema({
  userId:      { type: String, required: true },
  siteId:      { type: String, required: true },   // siteCode
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  cleanup:     { type: String, enum: ['reset', 'hold'], default: 'reset' },
  steps:       { type: [SimScriptStepSchema], default: [] },
}, {
  timestamps: true,
  collection: 'simscripts',
});

SimScriptSchema.index({ userId: 1, siteId: 1 });

module.exports = mongoose.model('SimScript', SimScriptSchema);
