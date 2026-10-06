const OPS = {
  lt:  (a, b) => a <  b,
  lte: (a, b) => a <= b,
  gt:  (a, b) => a >  b,
  gte: (a, b) => a >= b,
  eq:  (a, b) => a === b,
  neq: (a, b) => a !== b,
};

function evaluateD(rule, value) {
  if (value === null || value === undefined) return false;

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
