// spec_perfiles_controladora (firmada por Franco 2026-10-20, Qp1) — perfil de un MODELO de
// controladora (ej. Cummins PCC 1302 / HMI211). La regla no cambia por controladora: cambian
// los números (límites del fabricante), las mediciones que el modelo NO tiene y el significado
// de los códigos de falla. Colección propia: un deviceType (ficha) puede tener varios modelos.
//
// module.exports (patrón rule_pack.js): lo requieren la app node y el worker qa sin babel.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const ProfileLimitSchema = new Schema({
  variable: { type: String, required: true },
  kind:     { type: String, enum: ['warning', 'trip'], required: true },
  op:       { type: String, enum: ['lt', 'lte', 'gt', 'gte'], required: true },
  value:    { type: Number, required: true },
  unit:     { type: String },
  source:   { type: String, required: true },   // cita obligatoria (manual, código, decisión)
}, { _id: false });

const FaultCodeSchema = new Schema({
  code:   { type: Number, required: true },
  name:   { type: String, required: true },
  type:   { type: String, enum: ['warning', 'shutdown', 'event', 'configurable'], default: 'warning' },
  logic:  { type: String },          // condición del fabricante (ej. "> 85 °C durante 90 s")
  causes: { type: [String], default: [] },
}, { _id: false });

const ControllerProfileSchema = new Schema({
  profileId:    { type: String, required: true, unique: true },
  deviceType:   { type: String, required: true },     // ficha a la que pertenece (ej. 'cummins-pcc')
  manufacturer: { type: String, default: '' },
  model:        { type: String, required: true },
  variants:     { type: [String], default: [] },       // ej. ['HMI211', 'PowerCommand 1.1']
  source:       { type: String, default: '' },         // documento del fabricante
  // Mediciones de la ficha que este modelo NO tiene → las reglas que las usan quedan
  // "no aplicables" en ese equipo (spec §2.3, Qp4). Lista explícita: lo no listado se evalúa.
  unavailable:  { type: [String], default: [] },
  limits:       { type: [ProfileLimitSchema], default: [] },
  faultCodes:   { type: [FaultCodeSchema], default: [] },
  install:      { type: [String], default: [] },       // requisitos de comisionado
  notes:        { type: String, default: '' },
}, { timestamps: true, collection: 'controllerprofiles' });

module.exports = mongoose.models.ControllerProfile || mongoose.model('ControllerProfile', ControllerProfileSchema);
