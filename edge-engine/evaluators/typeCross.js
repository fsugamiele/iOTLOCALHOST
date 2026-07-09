// edge-engine/evaluators/typeCross.js
// Evaluador cross-equipo — DEC-REF-47 (árbol AND/OR + hoja de suma diferida)
// + DEC-REF-48 (temporizador reactivo `graceSec`, tiempo-de-eventos)
// + DEC-REF-51 (despacho por bypass, scoping por site).
//
// Hoja de suma es SHAPE VÁLIDO en el árbol pero se descarta al CARGAR el pack
// (siteState.js) con log claro "pendiente de implementación (DEC-REF-47)".
// Nunca llega al evaluator en runtime → evaluateNode es boolean puro.
//
// `validateCrossTree` vive en app/api/services/ruleValidation.js (SF-1,
// DEC-REF-57). Se re-exporta desde este módulo para preservar el consumo
// existente (`siteState.js:4`).

const { evaluateD } = require('./typeD');
const { validateCrossTree } = require('../../app/api/services/ruleValidation');

// ── Búsqueda por _deviceType + _siteCode (scoping por site, DEC-REF-51 C2) ─
function findDeviceByType(siteState, deviceType, siteCode) {
  for (const [, devState] of siteState) {
    if (!devState) continue;
    if (devState._deviceType === deviceType && devState._siteCode === siteCode) {
      return devState;
    }
  }
  return null;
}

// ── Evaluación recursiva — BOOLEAN PURO ────────────────────────────────────
function evaluateNode(node, siteState, siteCode) {
  if (node.op === 'AND') {
    for (const child of node.children) {
      if (!evaluateNode(child, siteState, siteCode)) return false;
    }
    return true;
  }
  if (node.op === 'OR') {
    for (const child of node.children) {
      if (evaluateNode(child, siteState, siteCode)) return true;
    }
    return false;
  }
  const devState = findDeviceByType(siteState, node.deviceType, siteCode);
  if (!devState) return false;
  const value = devState[node.variable];
  return evaluateD(
    { ruleId: `${node.deviceType}/${node.variable}`, condition: node.condition },
    value
  );
}

// ── Wrapper: evaluación + temporizador graceSec, scopeado por siteCode ────
function evaluateCross(rule, siteState, crossState, eventTs, siteCode) {
  const treeVal = evaluateNode(rule.crossExpr, siteState, siteCode);

  const startKey = `${siteCode}:${rule.ruleId}:start`;
  const firedKey = `${siteCode}:${rule.ruleId}:fired`;

  if (!treeVal) {
    crossState.delete(startKey);
    // SF-4 · DEC-REF-64 — `resolved:true` señaliza al caller (ruleEngine)
    // que la regla ACTIVA dejó de cumplirse en esta transición. Delete
    // retorna true si la clave estaba presente. El caller decide si emite
    // fireResolve consultando activeState.has(ruleId).
    const resolved = crossState.delete(firedKey);
    return { fired: false, resolved };
  }

  const graceMs = (rule.graceSec || 0) * 1000;

  if (graceMs === 0) {
    if (crossState.has(firedKey)) return { fired: false };
    crossState.set(firedKey, eventTs);
    return { fired: true };
  }

  if (!crossState.has(startKey)) {
    crossState.set(startKey, eventTs);
    return { fired: false };
  }
  if (crossState.has(firedKey)) return { fired: false };

  const started = crossState.get(startKey);
  if (eventTs - started >= graceMs) {
    crossState.set(firedKey, eventTs);
    return { fired: true };
  }
  return { fired: false };
}

module.exports = { evaluateCross, validateCrossTree };
