// Auditoría 2026-10-14 (M-07/M-21) — igualdad tolerante a la representación:
// bool ↔ 0/1 (la ficha normaliza bool a 0/1, pero hay reglas viejas con `true`),
// número ↔ string numérico, y floats con épsilon relativo (0.1+0.2 === 0.3).
function sameValue(a, b) {
  const na = typeof a === 'boolean' ? (a ? 1 : 0) : a;
  const nb = typeof b === 'boolean' ? (b ? 1 : 0) : b;
  if (typeof na === 'number' && typeof nb === 'number') {
    return Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb));
  }
  if (typeof na === 'number' && typeof nb === 'string' && nb.trim() !== '' && Number.isFinite(Number(nb))) return sameValue(na, Number(nb));
  if (typeof nb === 'number' && typeof na === 'string' && na.trim() !== '' && Number.isFinite(Number(na))) return sameValue(Number(na), nb);
  return na === nb;
}

const OPS = {
  lt:  (a, b) => a <  b,
  lte: (a, b) => a <= b,
  gt:  (a, b) => a >  b,
  gte: (a, b) => a >= b,
  eq:  (a, b) => sameValue(a, b),
  neq: (a, b) => !sameValue(a, b),
};
const ARITH = new Set(['lt', 'lte', 'gt', 'gte']);

function evaluateD(rule, value) {
  if (value === null || value === undefined) return null;   // sin dato = no evaluable

  const { condition } = rule;
  if (!condition || !condition.op) {
    console.warn(`[typeD] Regla ${rule.ruleId} sin condition válida — omitida`);
    return false;
  }

  const fn = OPS[condition.op];
  if (!fn) {
    console.warn(`[typeD] Operador desconocido '${condition.op}' en ${rule.ruleId}`);
    return false;
  }

  // Auditoría 2026-10-14 (M-07) — comparación aritmética sobre un valor no numérico
  // ("" → 0, false → 0, "ERR" → NaN) = NO EVALUABLE (null), no `false`. `false`
  // llevaba a la rama de RESOLVE: un dato basura cerraba una alarma crítica activa.
  // Los llamadores tratan null como "sin señal" (tri-state, igual que cross).
  if (ARITH.has(condition.op)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  }
  return fn(value, condition.value);
}

// DEC-REF-132 — histéresis/deadband (type D). Se llama en la rama de RESOLVE (cuando
// evaluateD ya dio false): decide si el valor cruzó el umbral de RESOLUCIÓN (más
// holgado que el de disparo) o sigue en la zona pegajosa. Sin deadband → resuelve
// como hoy. gt/gte: dispara en >V, resuelve bajo V−d. lt/lte: dispara en <V, resuelve
// sobre V+d. eq/neq: sin banda.
function resolveClears(rule, value) {
  const c = rule.condition;
  const d = c && Number(c.deadband);
  if (!(d > 0)) return true;                       // sin banda → comportamiento actual
  if (value === null || value === undefined) return true;  // sin dato → no quedar pegada
  switch (c.op) {
    case 'gt':
    case 'gte': return value <= c.value - d;
    case 'lt':
    case 'lte': return value >= c.value + d;
    default:    return true;                        // eq/neq: sin histéresis
  }
}

module.exports = { evaluateD, resolveClears };
