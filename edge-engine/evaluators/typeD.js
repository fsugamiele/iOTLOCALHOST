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

module.exports = { evaluateD };
