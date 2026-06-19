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
