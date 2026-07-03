// edge-engine/evaluators/typeCross.js
// Evaluador cross-equipo — DEC-REF-47 (árbol AND/OR + hoja de suma diferida)
// + DEC-REF-48 (temporizador reactivo `graceSec`, tiempo-de-eventos)
// + DEC-REF-51 (despacho por bypass, scoping por site).
//
// Hoja de suma es SHAPE VÁLIDO en el árbol pero se descarta al CARGAR el pack
// (siteState.js) con log claro "pendiente de implementación (DEC-REF-47)".
// Nunca llega al evaluator en runtime → evaluateNode es boolean puro.

const { evaluateD } = require('./typeD');

// ── Validación de forma del árbol (usada al cargar el pack) ─────────────────
// Retorna { ok, reason }. Categorías de `reason`:
//   'sum-pending'   → hoja de suma detectada, shape válido, pendiente (DEC-REF-47).
//   <cualquier otro> → forma inválida (patrón DEC-REF-20).
function validateCrossTree(node, depth = 0) {
  if (depth > 8) return { ok: false, reason: `profundidad > 8` };
  if (node == null || typeof node !== 'object') {
    return { ok: false, reason: 'nodo no-objeto o null' };
  }
  if (node.op === 'AND' || node.op === 'OR') {
    if (!Array.isArray(node.children) || node.children.length === 0) {
      return { ok: false, reason: `${node.op} sin children` };
    }
    for (const child of node.children) {
      const r = validateCrossTree(child, depth + 1);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (Array.isArray(node.sum)) {
    if (node.sum.length === 0) return { ok: false, reason: 'sum vacío' };
    for (const term of node.sum) {
      if (!term || !term.deviceType || !term.variable) {
        return { ok: false, reason: 'hoja sum: término sin deviceType/variable' };
      }
    }
    if (!node.condition || !node.condition.op) {
      return { ok: false, reason: 'hoja sum sin condition' };
    }
    return { ok: false, reason: 'sum-pending' };
  }
  if (node.deviceType && node.variable) {
    if (!node.condition || !node.condition.op) {
      return { ok: false, reason: `hoja equipo ${node.deviceType}/${node.variable} sin condition` };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'nodo desconocido (ni AND/OR ni hoja equipo/sum)' };
}

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
    crossState.delete(firedKey);
    return { fired: false };
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
