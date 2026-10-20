import mongoose from 'mongoose';

const uniqueValidator = require('mongoose-unique-validator');

const Schema = mongoose.Schema;

const deviceSchema = new Schema({
    userId: { type: String, required: [true] },
    dId: { type: String, unique: true, required: [true] },
    name: { type: String, required: [true] },
    password: { type: String, required: [true] },
    selected: { type: Boolean, required: [true], default: false },
    templateId: {type: String, required: [true]},
    templateName: {type: String, required: [true]},
    createdTime: { type: Number },
    firmwareType: { type: String, default: "wanomi" },
    tasmotaName:  { type: String, default: "" },
    siteId:       { type: String },
    iccid:        { type: String },
    imei:         { type: String },
    apn:          { type: String },
    deviceType:   { type: String, default: '' },
    driverConfig: { type: Object, default: {} },
    // DEC-REF-115 (#85) — override de autonomía por EQUIPO INSTALADO: el
    // tanque es de la instalación, no del modelo. Override PARCIAL sobre
    // ficha.autonomy (cada campo pisa al de la ficha si > 0). Ausente =
    // heredar todo de la ficha.
    autonomy: {
      tankCapacity:   { type: Number },
      consumptionLph: { type: Number },
    },
    // spec_umbral_por_referencia + spec_cascada_ficha C3 — parámetros de la
    // INSTALACIÓN (no del modelo): battery_nominal_v, rated_kw, … El edge los
    // hidrata como pseudo-variables del device (deviceState[param]). Los límites
    // de la ficha con relativeTo y las reglas con condition.ref / setpointSource
    // los usan. Ausente = defaults de la ficha (ej. batería 12 V).
    refParams: { type: Object, default: undefined },
    // spec_perfiles_controladora — modelo de controladora (Qp6: asignación manual hasta que
    // el CORE la detecte) y umbrales PROPIOS del equipo (leídos de la controladora o
    // cargados por el instalador). Cascada: equipo > perfil > ficha.
    profileId: { type: String, default: undefined },
    limitOverrides: { type: [{ _id: false, variable: String, kind: String, op: String, value: Number, source: String }], default: undefined },
});

// Validator
deviceSchema.plugin(uniqueValidator, { message: 'Error, device already exists.' });

// Schema to model.
const Device = mongoose.model('Device', deviceSchema);

export default Device;