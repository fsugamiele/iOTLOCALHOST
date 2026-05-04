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
    cellOwner:   { type: String, required: [true] },
    devices:     { type: [String], default: [] },
    notes:       { type: String },
    createdTime: { type: Number }
});

siteSchema.plugin(uniqueValidator, { message: 'Error, site already exists.' });

const Site = mongoose.model('Site', siteSchema);

export default Site;
