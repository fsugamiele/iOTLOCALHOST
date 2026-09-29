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
  // P2 (#79) — umbral de cambio (report-by-exception): precisión/ruido del
  // sensor según fabricante. Los templates nacidos de esta ficha lo heredan
  // como widget.deadband. 0/ausente = publicar ante cualquier cambio.
  deadband:     { type: Number },
  limits:       { type: [LimitSchema], default: [] },  // PUEDE estar vacía (DEC-REF-94, condición Backend #60)
}, { _id: false });

// DEC-REF-115 (#85) — autonomía CALCULADA POR LA PLATAFORMA (reversa de
// DEC-REF-108 F4: las controladoras reales no garantizan esa variable y el
// dato es crítico para la confiabilidad del sistema — Franco). Parámetros
// físicos del cálculo que corre el edge-engine:
//   autonomy_hours = fuelLevel[%] × tankCapacity / 100 / consumptionLph
// Opcional: sin este bloque NO hay cálculo para el equipo (la plataforma no
// inventa autonomía sin parámetros — el widget muestra "sin dato", honesto).
const AutonomySchema = new Schema({
  fuelVariable:   { type: String },  // variable de nivel de combustible (0-100 %)
  tankCapacity:   { type: Number },  // capacidad del tanque (unidad coherente con consumptionLph)
  consumptionLph: { type: Number },  // consumo nominal (unidades/hora) — evidencia citada en doc/limits.source
}, { _id: false });

const equipmentSheetSchema = new Schema({
  deviceType:   { type: String, required: true, unique: true },  // ES el identificador (DEC-REF-91); 409 por findOne (D-2)
  manufacturer: { type: String },
  model:        { type: String },
  origin:       { type: String, enum: ['own', 'third_party'] },  // enum cerrado (DEC-REF-94)
  // DEC-REF-108 F2 (#80): dominio funcional del equipo — arma los tabs de la
  // página de sitio (Energía / Grupo / Seguridad / Infraestructura).
  // Enum cerrado + '' = sin clasificar (cae en tab "General").
  domain:       { type: String, enum: ['', 'energia', 'grupo', 'clima', 'seguridad', 'infraestructura'], default: '' },
  version:      { type: Number, default: 1 },                    // reservado sin fijación (Fork III de -92)
  manual:       { type: Schema.Types.ObjectId, default: null },  // ref nullable; modelo Manual no existe aún (fuera de -91)
  variables:    { type: [VariableSchema], default: [] },
  // DEC-REF-115 (#85): parámetros del cálculo de autonomía de la plataforma.
  autonomy:     { type: AutonomySchema, default: undefined },
  createdTime:  { type: Number },                                // convención de la casa (operator.js:12, zone.js:14) — declarado
});

const EquipmentSheet = mongoose.model('EquipmentSheet', equipmentSheetSchema);  // -> coleccion 'equipmentsheets'
export default EquipmentSheet;
