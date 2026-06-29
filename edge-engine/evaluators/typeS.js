const { evaluateD } = require('./typeD');

// Tipo S — conteo de eventos que matchean una condición dentro de una ventana
// deslizante (DEC-REF-25, reusa primitiva de comparación de typeD).
// Devuelve { fired, count, windowActual } — análogo al objeto rico de typeC.
//   count:        eventos vivos en la ventana tras purga
//   windowActual: antigüedad (seg) del evento más viejo aún vivo en la ventana
// TODO: reset_behavior:'manual' queda fuera de A2 (no hay ACK de regla aún).
//       'auto' (default) ya se cumple naturalmente con la purga deslizante.
function evaluateS(rule, value, windowState) {
  const w = rule.window;
  if (!w || !w.durationSec || !w.countThreshold || !w.matchCondition) {
    console.warn(`[typeS] Regla ${rule.ruleId} sin window válida — omitida`);
    return { fired: false, count: 0, windowActual: 0 };
  }

  const now      = Date.now();
  const cutoff   = now - w.durationSec * 1000;
  const existing = windowState.get(rule.ruleId) || [];

  // Purga deslizante: descartar timestamps fuera de la ventana
  const purged = existing.filter(ts => ts >= cutoff);

  // ¿El valor entrante matchea matchCondition? Reusa evaluateD (DEC-REF-25)
  const synthetic = { ruleId: rule.ruleId, condition: w.matchCondition };
  const matches   = evaluateD(synthetic, value);

  if (!matches) {
    // No matchea → no agrega timestamp, no dispara (el disparo lo decide el mensaje que matchea)
    windowState.set(rule.ruleId, purged);
    const windowActual = purged.length ? (now - purged[0]) / 1000 : 0;
    return { fired: false, count: purged.length, windowActual };
  }

  // Matchea → registrar timestamp y reevaluar
  purged.push(now);
  windowState.set(rule.ruleId, purged);

  const count        = purged.length;
  const windowActual = (now - purged[0]) / 1000;
  const fired        = count >= w.countThreshold;

  return { fired, count, windowActual };
}

module.exports = { evaluateS };
