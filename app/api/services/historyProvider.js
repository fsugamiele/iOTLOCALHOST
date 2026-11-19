// La costura del histórico — toma de pared definitiva (30.2).
// NO recibe userId, NO sabe quién pregunta, NO tiene gate de autorización.
// La autorización vive ARRIBA (DEC-REF-33) — el caller decide si llamar.
//
// Mañana la fuente puede cambiar (Hub remoto, pre-agregados, hybrid) sin
// tocar los callers — preserva la firma {dId, variable, sinceMs} → samples[].

import Data from '../models/data.js';

// query({ dId, variable, sinceMs }) — muestras ordenadas asc por time.
// Forma del array idéntica a la que Data.find().sort() devuelve hoy.
export async function query({ dId, variable, sinceMs }) {
  return Data.find(
    { dId, variable, time: { $gt: sinceMs } }
  ).sort({ time: 1 });
}

// Franco 2026-11-18 — Historial se tildaba con 7 y 30 días: se mandaban TODAS
// las lecturas crudas (cientos de miles por variable, con todos los campos) y
// el navegador no daba abasto. queryBucketed agrupa en ~maxPoints tramos
// iguales (promedio, mínimo y máximo de cada tramo) en la propia base. Si el
// tramo queda en 5 s o menos no agrupa: devuelve las lecturas tal cual
// (solo time y value). Mongo 4.4: sin $dateTrunc, el tramo se calcula con $mod.
export async function queryBucketed({ dId, variable, sinceMs, maxPoints = 1500 }) {
  const span = Math.max(1, Date.now() - sinceMs);
  const bucketMs = Math.ceil(span / Math.max(50, maxPoints) / 1000) * 1000;   // segundos enteros
  if (bucketMs <= 5000) {   // tramos de 5 s o menos: no vale la pena agrupar
    return Data.find({ dId, variable, time: { $gt: sinceMs } }, { time: 1, value: 1, _id: 0 }).sort({ time: 1 }).lean();
  }
  const rows = await Data.aggregate([
    { $match: { dId, variable, time: { $gt: sinceMs } } },
    // sí/no guardado como true/false → 1/0 (si no, $avg lo descarta y la variable desaparece)
    { $addFields: { value: { $cond: [{ $eq: [{ $type: '$value' }, 'bool'] }, { $cond: ['$value', 1, 0] }, '$value'] } } },
    { $group: {
      _id: { $subtract: ['$time', { $mod: ['$time', bucketMs] }] },
      value: { $avg: '$value' }, min: { $min: '$value' }, max: { $max: '$value' }, n: { $sum: 1 },
    } },
    { $sort: { _id: 1 } },
  ]).allowDiskUse(true);
  return rows.filter(r => typeof r.value === 'number').map(r => ({ time: r._id, value: Math.round(r.value * 1000) / 1000, min: r.min, max: r.max, n: r.n }));
}
