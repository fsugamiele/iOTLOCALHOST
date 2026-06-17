import mongoose from 'mongoose';
const uniqueValidator = require('mongoose-unique-validator');

const Schema = mongoose.Schema;

const zoneSchema = new Schema({
  // Identidad técnica estable — NO se edita una vez creado.
  // Segmento de topic MQTT (DEC-REF-30) y ACLs: legible.
  zoneCode:     { type: String, required: [true] },
  displayName:  { type: String, required: [true] },
  // Relación hacia arriba por code string (no ObjectId/populate) — coherente
  // con el patrón Site↔Device por siteId (DEC-REF-28).
  operatorCode: { type: String, required: [true] },
  createdTime:  { type: Number },
});

// Unique compuesto: el zoneCode es único POR operador, no globalmente.
// Permite que dos operadores tengan zonas con el mismo code (claro/nea, movistar/nea).
zoneSchema.index({ operatorCode: 1, zoneCode: 1 }, { unique: true });

zoneSchema.plugin(uniqueValidator, { message: 'Error, zone already exists in this operator.' });

const Zone = mongoose.model('Zone', zoneSchema);

export default Zone;
