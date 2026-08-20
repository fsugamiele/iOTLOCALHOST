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

const widgetSchema = new Schema({
    variable:         { type: String },
    variableFullName: { type: String },
    variableType:     { type: String },
    variableSendFreq: { type: Number },

    unit:   { type: String, default: '' },
    widget: {
        type: String,
        enum: [
            'numberchart', 'switch', 'button', 'indicator',
            'valueStatus', 'tankLevel', 'counter', 'multiState',
            'equipmentAlarms', 'miniTrend', 'projectedAutonomy', 'dataFreshness',
            'activeRecommendation', 'dcPlant', 'powerCascade', 'booleanDwell',
        ],
    },

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
}, { _id: false, strict: true });

const templateSchema = new Schema({
    userId:      { type: String, required: [true] },
    name:        { type: String, required: [true] },
    description: { type: String },
    deviceType:  { type: String, default: '' },  // S3 (DEC-REF-91/-92): referencia a la ficha (equipmentsheets.deviceType); '' = sin ficha, compat con plantillas pre-ficha. NO copia: la ficha es madre
    createdTime: { type: Number, required: [true] },
    widgets:     { type: [widgetSchema], default: [] },
});


// Schema to model.
const Template = mongoose.model('Template', templateSchema);

export default Template;
