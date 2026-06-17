import mongoose from 'mongoose';
const uniqueValidator = require('mongoose-unique-validator');

const Schema = mongoose.Schema;

const operatorSchema = new Schema({
  // Identidad técnica estable — NO se edita una vez creado (como siteCode).
  // Usado como segmento de topic MQTT (DEC-REF-30) y en ACLs: debe ser legible.
  operatorCode: { type: String, required: [true], unique: true },
  // Nombre comercial mutable — si el cliente se renombra, cambia esto, no el code.
  displayName:  { type: String, required: [true] },
  createdTime:  { type: Number },
});

operatorSchema.plugin(uniqueValidator, { message: 'Error, operator already exists.' });

const Operator = mongoose.model('Operator', operatorSchema);

export default Operator;
