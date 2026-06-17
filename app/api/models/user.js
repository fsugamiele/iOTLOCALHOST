import mongoose from "mongoose";
const uniqueValidator = require("mongoose-unique-validator");

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: [true] },
  email: { type: String, required: [true], unique: true},
  password: {  type: String, required: [true]},
  // Tenancy authorization (DEC-REF-29): un User tiene 0..N grants {rol, alcance}.
  // El alcance ubica el grant en el árbol (DEC-REF-28). Default [] → usuarios
  // existentes y registros nuevos quedan sin permisos hasta asignación explícita.
  // NOTA DE INTENCIÓN: los grants se leerán frescos de DB en autorización (NO se
  // firman en el JWT) — sub-paso 28.x. El schema solo MODELA grants; la lectura
  // por DB y la autorización aún NO están implementadas.
  grants: {
    type: [{
      role: {
        type: String,
        enum: ['superadmin', 'noc', 'manager', 'cellowner'],
        required: true,
      },
      scope: {
        operatorCode: { type: String },  // ausente en superadmin = comodín (todo)
        zoneCode:     { type: String },  // presente en cellowner/manager
        siteCode:     { type: String },  // reservado: grants a nivel site (futuro)
      },
    }],
    default: [],
  },
});


//Validator
userSchema.plugin(uniqueValidator, { message: 'Error, email already exists.'});


// convert to model
const User = mongoose.model('User', userSchema);

export default User;

