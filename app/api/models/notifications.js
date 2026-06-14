import mongoose from 'mongoose';

const Schema = mongoose.Schema; 

const notificationSchema = new Schema({

    userId: { type: String, required: [true] },
    dId: { type: String, required: [true] },
    deviceName: { type: String, required: [true] },
    payload: { type: Object },
    emqxRuleId: { type: String },
    topic: { type: String, required: [true] },
    value: { type: Number, required: [true] },
    condition: { type: String },
    variable: { type: String, required: [true] },
    variableFullName: { type: String },
    readed:          { type: Boolean, default: false },
    time:            { type: Number },
    // ── campos motor edge (DEC-REF-23, sesión #20) ──
    // Los campos EMQX arriba se mantienen opcionales para compatibilidad.
    // El motor edge llena estos; nunca usa emqxRuleId/condition/variableFullName.
    ruleId:          { type: String },
    inferenceId:     { type: String },
    label:           { type: String },
    severity:        { type: String, enum: ['info', 'warning', 'critical'] },
    recommendation:  { type: String },
    siteId:          { type: String },
    reason:          { type: String },
    source:          { type: String },   // 'emqx' | 'edge-engine'
    mode:          { type: String },   // 'direct'|'calibrated'|'fallback'|'no-ref'
    thresholdUsed: { type: Number },
    unit:          { type: String },

});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;  