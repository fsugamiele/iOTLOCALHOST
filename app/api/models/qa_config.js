const mongoose = require('mongoose');
const { Schema } = mongoose;

// spec_supervisor_confiabilidad_v2 (Qs5) — parámetros del supervisor de confiabilidad, editables
// por superadmin. UN documento (_id 'default'). Lo lee el worker qa y lo escribe node (/api/qa/config).
// D3: SLA y meta Ao son PROVISORIOS hasta que Claro confirme sus SLA. `module.exports` (worker sin babel).
const QaConfigSchema = new Schema({
  _id:            { type: String, default: 'default' },
  windowDays:     { type: Number, default: 30, min: 1, max: 365 },
  confidence:     { type: Number, default: 0.90, min: 0.5, max: 0.999 },
  slaRepairH:     { type: Number, default: 4, min: 0.1 },        // D3 PROVISORIO
  aoTarget:       { type: Number, default: 99.5, min: 0, max: 100 },  // D3 PROVISORIO
  provisorio:     { type: Boolean, default: true },             // true mientras Claro no confirme
  confAltaN:      { type: Number, default: 5, min: 1 },          // D4
  confMediaN:     { type: Number, default: 2, min: 1 },
  completitudMin: { type: Number, default: 95, min: 0, max: 100 },
  isaDays:        { type: Number, default: 7, min: 1, max: 30 },
  isaRateTarget:  { type: Number, default: 6, min: 0 },          // avisos/h por operador
  floodPerTen:    { type: Number, default: 10, min: 1 },         // > N avisos en 10 min
  floodPctTarget: { type: Number, default: 1, min: 0 },
  chatterN:       { type: Number, default: 3, min: 2 },
  chatterSec:     { type: Number, default: 60, min: 1 },
  staleH:         { type: Number, default: 24, min: 1 },
  everyMin:       { type: Number, default: 60, min: 5 },         // Qs4: cada cuánto recalcula el worker
  rectifierTypes: { type: [String], default: ['ELTEK'] },        // fuentes para la caída del sitio
  updatedBy:      { type: String, default: null },
}, { timestamps: true, collection: 'qa_config' });

module.exports = mongoose.models.QaConfig || mongoose.model('QaConfig', QaConfigSchema);
