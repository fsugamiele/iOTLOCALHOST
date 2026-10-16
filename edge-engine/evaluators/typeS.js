const { evaluateD } = require('./typeD');

// Tipo S — conteo de eventos que matchean una condición dentro de una ventana
// deslizante (DEC-REF-25, reusa primitiva de comparación de typeD).
// Devuelve { fired, count, windowActual } — análogo al objeto rico de typeC.
//   count:        eventos vivos en la ventana tras purga
//   windowActual: antigüedad (seg) del evento más viejo aún vivo en la ventana
// TODO: reset_behavior:'manual' queda fuera de A2 (no hay ACK de regla aún).
//       'auto' (default) ya se cumple naturalmente con la purga deslizante.
function evaluateS(rule, value, windowState, dId) {
  const w = rule.window;
  if (!w || !w.durationSec || !w.countThreshold || !w.matchCondition) {
    console.warn(`[typeS] Regla ${rule.ruleId} sin window válida — omitida`);
    return { fired: false, count: 0, windowActual: 0 };
  }

  // DEC-REF-122 — ventana por INSTANCIA (ruleId:dId): con 2 equipos del mismo
  // deviceType sus eventos NO se mezclan. Fallback a ruleId si no viene dId.
  const key      = dId != null ? `${rule.ruleId}:${dId}` : rule.ruleId;
  const now      = Date.now();
  const cutoff   = now - w.durationSec * 1000;
  const existing = windowState.get(key) || [];

  // Purga deslizante: descartar timestamps fuera de la ventana
  const purged = existing.filter(ts => ts >= cutoff);

  // ¿El valor entrante matchea matchCondition? Reusa evaluateD (DEC-REF-25)
  const synthetic = { ruleId: rule.ruleId, condition: w.matchCondition };
  const matches   = evaluateD(synthetic, value);

  if (!matches) {
    // spec_grafcet_g1d (S3 = A, Franco 2026-10-16) — un valor que no coincide NO suma, pero la
    // condición de la regla es "N veces en T": sigue cumplida mientras queden N en la ventana.
    // (Antes: fired:false → el primer valor normal cerraba la alarma con N todavía en la ventana.)
    windowState.set(key, purged);
    const windowActual = purged.length ? (now - purged[0]) / 1000 : 0;
    return { fired: purged.length >= w.countThreshold, count: purged.length, windowActual };
  }

  // Matchea → registrar timestamp y reevaluar
  purged.push(now);
  windowState.set(key, purged);

  const count        = purged.length;
  const windowActual = (now - purged[0]) / 1000;
  const fired        = count >= w.countThreshold;

  return { fired, count, windowActual };
}

// spec_grafcet_g1d — evaluación SIN muestra nueva (tick): solo purga la ventana. La usa el
// tick del motor para que una alarma S se cierre sola cuando la ventana baja de N aunque el
// equipo no publique nada (antes quedaba abierta hasta el próximo mensaje).
function evaluateSWindow(rule, windowState, dId, nowIn) {
  const w = rule.window;
  if (!w || !w.durationSec || !w.countThreshold) return null;
  const key = dId != null ? `${rule.ruleId}:${dId}` : rule.ruleId;
  // La ventana vive en memoria: tras un reinicio no hay historia → no se decide nada hasta el
  // próximo mensaje (evita un cierre falso de una alarma S hidratada abierta).
  if (!windowState.has(key)) return null;
  const now = nowIn || Date.now();
  const purged = (windowState.get(key) || []).filter(ts => ts >= now - w.durationSec * 1000);
  windowState.set(key, purged);
  return { fired: purged.length >= w.countThreshold, count: purged.length };
}

module.exports = { evaluateS, evaluateSWindow };
