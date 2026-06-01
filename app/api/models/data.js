import mongoose from "mongoose";

const Schema = mongoose.Schema;

const dataSchema = new Schema({
  userId: { type: String, required: [true] },
  dId: { type: String, required: [true] },
  variable: { type: String, required: [true] },
  value: { type: mongoose.Schema.Types.Mixed, required: [true] },
  time: { type: Number, required: [true] }
});

// Convertir a modelo con nombre de colección específico
const Data = mongoose.model("Data", dataSchema, "data");

export default Data;
