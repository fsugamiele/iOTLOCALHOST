import mongoose from 'mongoose';
const uniqueValidator = require('mongoose-unique-validator');

const Schema = mongoose.Schema;

const siteSchema = new Schema({
    userId:      { type: String, required: [true] },
    siteCode:    { type: String, required: [true], unique: true },
    nombre:      { type: String, required: [true] },
    lat:         { type: Number },
    lng:         { type: Number },
    direccion:   { type: String },
    provincia:   { type: String },
    localidad:   { type: String },
    tipo:        { type: String, required: [true], enum: ['BTS', 'shelter', 'repeater'] },
    // cellOwner: LEGACY/DEPRECATED (28.4c). Ya no es required ni editable; se
    // conserva como dato fuente auditable de la migración (DEC-REF-28) y como
    // fallback del PDF forense. Borrado definitivo: cuando la integridad
    // referencial garantice que el lookup del Operator siempre resuelve y el
    // fallback sea código muerto (BACKLOG-TENANT-2).
    cellOwner:   { type: String },
    // Tenancy (DEC-REF-28): relación al árbol Operator→Zone. REQUIRED desde 28.4c
    // (todos los sites backfilleados, 4/4 verificado).
    operatorCode: { type: String, required: [true] },
    zoneCode:     { type: String, required: [true] },
    devices:     { type: [String], default: [] },
    notes:       { type: String },
    createdTime: { type: Number }
});

siteSchema.plugin(uniqueValidator, { message: 'Error, site already exists.' });

const Site = mongoose.model('Site', siteSchema);

export default Site;
