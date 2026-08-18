import mongoose from 'mongoose';
const { OPERATORS } = require('./rule_definition');   // D-3: fuente única (hermano, no '../models/...')
const Schema = mongoose.Schema;

const LimitSchema = new Schema({
  kind:   { type: String, enum: ['warning', 'trip'], required: true },  // enum cerrado (DEC-REF-94)
  op:     { type: String, enum: OPERATORS },                            // atado al enum compartido (Franco)
  value:  { type: Schema.Types.Mixed },
  unit:   { type: String },
  source: { type: String },
}, { _id: false });

const VariableSchema = new Schema({
  name:         { type: String, required: true },  // técnico: viaja en topic MQTT, comparado por ruleEngine.js:47
  label:        { type: String },
  type:         { type: String },
  unit:         { type: String },
  factoryRange: { type: String },
  cadence:      { type: String },
  limits:       { type: [LimitSchema], default: [] },  // PUEDE estar vacía (DEC-REF-94, condición Backend #60)
}, { _id: false });

const equipmentSheetSchema = new Schema({
  deviceType:   { type: String, required: true, unique: true },  // ES el identificador (DEC-REF-91); 409 por findOne (D-2)
  manufacturer: { type: String },
  model:        { type: String },
  origin:       { type: String, enum: ['own', 'third_party'] },  // enum cerrado (DEC-REF-94)
  version:      { type: Number, default: 1 },                    // reservado sin fijación (Fork III de -92)
  manual:       { type: Schema.Types.ObjectId, default: null },  // ref nullable; modelo Manual no existe aún (fuera de -91)
  variables:    { type: [VariableSchema], default: [] },
  createdTime:  { type: Number },                                // convención de la casa (operator.js:12, zone.js:14) — declarado
});

const EquipmentSheet = mongoose.model('EquipmentSheet', equipmentSheetSchema);  // -> coleccion 'equipmentsheets'
export default EquipmentSheet;
