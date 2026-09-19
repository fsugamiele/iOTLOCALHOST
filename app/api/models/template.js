import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const enumValueSchema = new Schema({
    value:    { type: String },
    label:    { type: String },
    severity: { type: String },
}, { _id: false });

const bitmapEntrySchema = new Schema({
    bit:      { type: Number },
    label:    { type: String },
    severity: { type: String },
}, { _id: false });

// DEC-REF-107 (Paso 3) — fuente de un widget MULTI-FUENTE (cascada, planta DC).
// Cada source ata UNA variable del mismo dId; el widget compone N. `key` es el
// identificador estable dentro del widget; `role` es opcional (semántica de
// etapa para la cascada: mains|ats|genset|rectifier).
const sourceSchema = new Schema({
    key:              { type: String },
    variable:         { type: String },
    variableFullName: { type: String },
    unit:             { type: String },
    variableType:     { type: String },
    role:             { type: String },
}, { _id: false });

const widgetSchema = new Schema({
    variable:         { type: String },
    variableFullName: { type: String },
    variableType:     { type: String },
    variableSendFreq: { type: Number },
    // P2 (#79) — report-by-exception: umbral de cambio. El device solo publica
    // cuando |valor - últimoPublicado| >= deadband (numéricas). 0/ausente =
    // publica ante cualquier cambio. Nace en la ficha (precisión del
    // fabricante), se edita acá por template. Bool/string: cualquier cambio.
    deadband:         { type: Number },

    unit:   { type: String, default: '' },
    widget: {
        type: String,
        enum: [
            'numberchart', 'switch', 'button', 'indicator',
            'valueStatus', 'tankLevel', 'counter', 'multiState',
            'equipmentAlarms', 'miniTrend', 'projectedAutonomy', 'dataFreshness',
            'activeRecommendation', 'dcPlant', 'powerCascade', 'booleanDwell',
            // DEC-REF-107 (Paso 2): tipo por FORMA DE DATO; la visual la elige
            // el usuario en `render` (desacople representación↔tipo).
            'numeric',
        ],
    },

    // DEC-REF-107 (Paso 2): representación gráfica elegida por el usuario para
    // el tipo `numeric` (valueStatus | gauge | tank | counter | icon | ...).
    // Ausente = compat: los tipos legacy dibujan por su `widget`.
    render:        { type: String },
    // DEC-REF-107 (Paso 3): fuentes de un widget multi-fuente (cascada, planta DC).
    sources:       { type: [sourceSchema], default: undefined },
    // Rango del gauge (opcional; vacío = automático).
    gaugeMin:      { type: Number },
    gaugeMax:      { type: Number },

    icon:          { type: String },
    class:         { type: String },
    column:        { type: String },
    decimalPlaces: { type: Number },
    tasmotaPath:   { type: String },
    message:       { type: String },
    text:          { type: String },
    chartTimeAgo:  { type: Number },

    thresholds: {
        criticalLow:  { type: Number },
        warningLow:   { type: Number },
        warningHigh:  { type: Number },
        criticalHigh: { type: Number },
    },
    tankCapacity:     { type: Number },
    tankUnit:         { type: String },
    enumValues:       [enumValueSchema],
    bitmapDictionary: [bitmapEntrySchema],
    cadenceExpected:  { type: Number },
    // DEC-REF-98 D-3 (#73): ventana de historial (horas) del widget
    // booleanDwell para ubicar el último cambio de estado.
    dwellWindowHours: { type: Number },
}, { _id: false, strict: true });

const templateSchema = new Schema({
    userId:      { type: String, required: [true] },
    name:        { type: String, required: [true] },
    description: { type: String },
    deviceType:  { type: String, default: '' },  // S3 (DEC-REF-91/-92): referencia a la ficha (equipmentsheets.deviceType); '' = sin ficha, compat con plantillas pre-ficha. NO copia: la ficha es madre
    // P2 (#79) — latido del device: si nada cambió, publica igual cada
    // heartbeatSec para probar que está vivo. El estado online del sitio y
    // el KPI uptime se calculan contra ESTE valor, no contra la cadencia de
    // cada variable (esa queda como cadencia de evaluación/evolución).
    heartbeatSec: { type: Number, default: 300 },
    createdTime: { type: Number, required: [true] },
    widgets:     { type: [widgetSchema], default: [] },
});


// Schema to model.
const Template = mongoose.model('Template', templateSchema);

export default Template;
