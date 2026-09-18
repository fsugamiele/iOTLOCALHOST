import mongoose from "mongoose";

const Schema = mongoose.Schema;

const dataSchema = new Schema({
  userId: { type: String, required: [true] },
  dId: { type: String, required: [true] },
  variable: { type: String, required: [true] },
  value: { type: mongoose.Schema.Types.Mixed, required: [true] },
  time: { type: Number, required: [true] }
});

// (DEC-REF-101 D-2) — el índice de lectura de telemetría se declara desde la
// propia API. Antes lo creaba solo el edge-engine (siteState.js) al boot: si
// el edge no arrancaba contra esta DB, todas las consultas del Panel caían a
// COLLSCAN sobre millones de docs. Mismo nombre y spec que el del edge ⇒
// createIndex es idempotente entre ambos creadores.
dataSchema.index({ dId: 1, variable: 1, time: -1 }, { name: "idx_data_reconstruct" });

// (DEC-REF-101 D-1, medido en #76) — el índice anterior NO sirve el sort
// {time:-1} sin variable: con {dId,variable,time} Mongo escanea TODAS las
// entradas del dId y ordena en memoria (6220 ms medidos por device en dev).
// Este índice hace el "último dato del device" O(log n) — es la query del
// estado online, que desde D-1 se ejecuta fresca en CADA request del Panel.
dataSchema.index({ dId: 1, time: -1 }, { name: "idx_data_did_time" });

// Convertir a modelo con nombre de colección específico
const Data = mongoose.model("Data", dataSchema, "data");

export default Data;
