import mongoose from 'mongoose';
const { OPERATORS } = require('./rule_definition');   // D-3: fuente única (hermano, no '../models/...')
const Schema = mongoose.Schema;

// spec_textos_alarma_ficha (Qt1, firmado 2026-10-27) — textos de la alarma POR LÍMITE
// (atención ≠ parada). Las reglas cuya condición principal usa este límite (limitRef) los
// LEEN cuando su campo está vacío (Qt3: herencia en la lectura, sin copia). Fuente: la
// biblioteca de fallas (docsRefactor/_biblioteca_campo/fallas/).
const LimitTextsSchema = new Schema({
  meaning:        { type: String },             // «Qué significa esta alarma»
  operatorAction: { type: String },             // «Qué tiene que hacer el operador» (→ recommendation)
  steps:          { type: [String], default: undefined },  // «Pasos a seguir» (primero remoto, después en sitio)
  causes:         { type: [String], default: undefined },  // causas probables en el orden del fabricante
  source:         { type: String },             // documento, edición y página
}, { _id: false });

const LimitSchema = new Schema({
  kind:   { type: String, enum: ['warning', 'trip'], required: true },  // enum cerrado (DEC-REF-94)
  op:     { type: String, enum: OPERATORS },                            // atado al enum compartido (Franco)
  value:  { type: Schema.Types.Mixed },
  unit:   { type: String },
  source: { type: String },
  // spec_cascada_ficha (F-12) — precondición opcional del límite: solo aplica si
  // {variable op value} del MISMO equipo se cumple (ej. alternador solo en marcha).
  // El widget no puede evaluarla (no colorea); la usan las reglas (cascada C2).
  when:   { type: Schema.Types.Mixed },
  // spec_cascada_ficha C3 — límite relativo a un parámetro de la INSTALACIÓN:
  // { param: 'battery_nominal_v', base: 12 } → para un equipo con refParams
  // battery_nominal_v = 24 el umbral efectivo es value × 24/12. Sin el parámetro
  // cargado en el equipo se usa `base` (decisión Franco 2026-10-14).
  relativeTo: { type: Schema.Types.Mixed },
  texts:      { type: LimitTextsSchema, default: undefined },
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
// spec_autonomy_extendido (2026-09-30) — jerarquía de 3 fuentes: metered
// (caudalímetro) > measured (pendiente del tanque) > estimated (nominal). Los
// 3 campos nuevos son OPCIONALES y ADITIVOS: sin ellos el cálculo es idéntico
// a DEC-REF-115. Son NOMBRES de variable (del modelo/template) → viven en la
// ficha, no en el override del device (que sigue siendo tanque+consumo).
const AutonomySchema = new Schema({
  fuelVariable:    { type: String },  // variable de nivel de combustible (0-100 %)
  tankCapacity:    { type: Number },  // capacidad del tanque (unidad coherente con consumptionLph)
  consumptionLph:  { type: Number },  // consumo nominal (unidades/hora) — evidencia citada en doc/limits.source
  flowVariable:    { type: String },  // NUEVO opcional — variable de caudal instantáneo del caudalímetro (fuente 'metered')
  flowScale:       { type: Number },  // NUEVO opcional (default 1) — multiplicador a unidad/hora (ej. L/min→60)
  runningVariable: { type: String },  // NUEVO opcional — variable de marcha; ausente → fallback a RUNNING_ALIASES del edge
  // Auditoría 2026-10-14 (M-01/M-02/F-13, decisión Franco) — estimador 'measured'
  // editable desde la ficha. Ausentes → defaults del edge (24 h / 45 min / 2 % / 0).
  runningThreshold: { type: Number },  // marcha si valor numérico > umbral (rpm → 300, DEC-REF-56)
  windowHours:      { type: Number },  // buffer: horas de MARCHA acumulada que se conservan
  minRunMinutes:    { type: Number },  // marcha mínima para confiar en el consumo medido
  minDropPct:       { type: Number },  // caída mínima de nivel (%) para confiar en el consumo medido
}, { _id: false });

const equipmentSheetSchema = new Schema({
  deviceType:   { type: String, required: true, unique: true },  // ES el identificador (DEC-REF-91); 409 por findOne (D-2)
  manufacturer: { type: String },
  model:        { type: String },
  origin:       { type: String, enum: ['own', 'third_party'] },  // enum cerrado (DEC-REF-94)
  // DEC-REF-108 F2 (#80): dominio funcional del equipo — arma los tabs de la
  // página de sitio (Energía / Grupo / Seguridad / Infraestructura).
  // Enum cerrado + '' = sin clasificar (cae en tab "General").
  domain:       { type: String, enum: ['', 'energia', 'grupo', 'seguridad', 'infraestructura'], default: '' },
  version:      { type: Number, default: 1 },                    // reservado sin fijación (Fork III de -92)
  manual:       { type: Schema.Types.ObjectId, default: null },  // ref nullable; modelo Manual no existe aún (fuera de -91)
  variables:    { type: [VariableSchema], default: [] },
  // spec_detalle_alarma_v2 (Qj4) — medición que resume el estado del equipo en el detalle de alarma.
  primaryVariable: { type: String, default: '' },
  // DEC-REF-115 (#85): parámetros del cálculo de autonomía de la plataforma.
  autonomy:     { type: AutonomySchema, default: undefined },
  createdTime:  { type: Number },                                // convención de la casa (operator.js:12, zone.js:14) — declarado
});

const EquipmentSheet = mongoose.model('EquipmentSheet', equipmentSheetSchema);  // -> coleccion 'equipmentsheets'
export default EquipmentSheet;
