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
    mode:          { type: String, enum: ['direct', 'calibrated', 'fallback', 'no-ref', 'window', 'cross', 'resolve-by-edit', 'resolve-by-condition'] },
    thresholdUsed: { type: Number },
    unit:          { type: String },
    correlationParent: { type: String, default: null },  // DEC-REF-50
    // DEC-REF-59 + DEC-REF-64 — kind del evento: 'fire' (raise) o 'resolve' (clear).
    // default 'fire' → las 1.100+ notifs preexistentes leen como fire sin migración
    // (mongoose aplica default en lectura si el campo está ausente en el doc).
    // El motor edge y notificationRouter.js debe llenar este campo en cada emisión.
    kind:          { type: String, enum: ['fire', 'resolve'], default: 'fire' },

    // DEC-REF-46 / DEC-REF-54 — ACK auditable, separado de `readed`.
    // `readed` es vista pasiva del listado; `acknowledgedBy` + `ackAt` registran
    // atención humana. Idempotente: primera ACK persiste, no se sobrescribe.
    // Notifs preexistentes quedan con ambos null (sin migración).
    acknowledgedBy: { type: String, default: null },
    ackAt:          { type: Number, default: null },

});

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;  