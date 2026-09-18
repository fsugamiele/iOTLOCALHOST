const mongoose = require('mongoose');
const { Schema } = mongoose;

// DEC-REF-101 D-8 (#76) — Layout del Panel diseñable por el usuario.
// Un documento por (userId, dashboard): posición/tamaño de cada tarjeta
// (formato vue-grid-layout: i/x/y/w/h) más settings por widget (D-9:
// título visible, intervalo de refresco, ventana temporal del gráfico).
// Persistir en Mongo (no localStorage): el panel se ve igual desde
// cualquier dispositivo del usuario.

const PanelLayoutItemSchema = new Schema({
  i: { type: String, required: true },
  x: { type: Number, required: true, min: 0, max: 11 },
  y: { type: Number, required: true, min: 0 },
  w: { type: Number, required: true, min: 1, max: 12 },
  h: { type: Number, required: true, min: 1, max: 60 },
}, { _id: false });

const PanelLayoutSchema = new Schema({
  userId:    { type: String, required: true },
  dashboard: { type: String, required: true, default: 'noc' },
  layout:    { type: [PanelLayoutItemSchema], default: [] },
  settings:  { type: Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  collection: 'panellayouts',
});

PanelLayoutSchema.index({ userId: 1, dashboard: 1 }, { unique: true });

module.exports = mongoose.model('PanelLayout', PanelLayoutSchema);
