const { evaluateD } = require('./typeD');

// Tipo C — auto-calibrado vs setpoint del equipo, fallback a D (DEC-REF-18, #22)
// Devuelve { fired, mode, thresholdUsed } — no boolean (DEC-REF-24 necesita el modo)
//   mode: 'calibrated' | 'fallback' | 'no-ref'
function evaluateC(rule, value, deviceState) {
  if (value === null || value === undefined) {
    return { fired: false, mode: 'no-ref', thresholdUsed: null };
  }

  const sp = rule.setpointSource || {};
  const setpoint = sp.variable ? deviceState[sp.variable] : undefined;
  const hasSetpoint = setpoint !== null && setpoint !== undefined;

  // 1) Camino auto-calibrado: comparar contra el setpoint real del equipo
  if (hasSetpoint) {
    const synthetic = {
      ruleId:    rule.ruleId,
      condition: { op: rule.condition.op, value: setpoint },
    };
    return {
      fired:         evaluateD(synthetic, value),
      mode:          'calibrated',
      thresholdUsed: setpoint,
    };
  }

  // 2) Setpoint no disponible + fallbackToD: comparar contra condition.value (umbral de respaldo)
  if (rule.fallbackToD === true) {
    return {
      fired:         evaluateD(rule, value),
      mode:          'fallback',
      thresholdUsed: rule.condition ? rule.condition.value : null,
    };
  }

  // 3) Setpoint no disponible + sin fallback: on_missing_ref decide
  if (rule.on_missing_ref === 'alarm') {
    return { fired: true,  mode: 'no-ref', thresholdUsed: null };
  }
  return { fired: false, mode: 'no-ref', thresholdUsed: null };
}

module.exports = { evaluateC };
