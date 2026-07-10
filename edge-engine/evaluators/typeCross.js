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

// SF-6 · DEC-REF-65.b — ventana de frescura para sumandos.
// Hardcoded a 3× cadencia default del sim (30s → 90000ms). Coherente con el
// criterio "≥2-3× cadencia" del prompt R15 y lección BUG-SIM-6. El motor
// verifica que `eventTs - deviceState._lastUpdate[variable] ≤ ventana` por
// cada sumando; si algún sumando es más viejo, la hoja de suma retorna
// staleness (evaluateNode propaga null) → evaluateCross no dispara ni
// resuelve. Cambiar acá si en producción la cadencia sube o si distintos
// deviceTypes requieren ventanas distintas.
const SUM_STALENESS_MS = 90 * 1000;

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

// SF-6 · DEC-REF-65.a — expansión por deviceType. Retorna array de tuplas
// { dId, devState } para TODOS los devices que matchean deviceType+siteCode
// (no solo el primero como findDeviceByType).
function findAllDevicesByType(siteState, deviceType, siteCode) {
  const out = [];
  for (const [dId, devState] of siteState) {
    if (!devState) continue;
    if (devState._deviceType === deviceType && devState._siteCode === siteCode) {
      out.push({ dId, devState });
    }
  }
  return out;
}

// SF-6 · DEC-REF-65 (a)+(b) — evaluador de hoja suma con frescura obligatoria.
// Semántica por deviceType: cada renglón {deviceType, variable} se expande a
// TODOS los devices de ese deviceType en el site; total = Σ de todas las
// expansiones; frescura verificada por cada sumando individual. Si ANY
// sumando falta o está viejo → retorna null (staleness sentinel), que
// evaluateNode propaga upward y evaluateCross convierte en "no evaluar
// este ciclo" (ni fire ni resolve — DEC-REF-65.b "retorno neutro").
function evaluateSum(node, siteState, siteCode, eventTs, ruleId) {
  let total = 0;
  let expandidos = 0;
  for (const term of node.sum) {
    const devices = findAllDevicesByType(siteState, term.deviceType, siteCode);
    if (devices.length === 0) {
      // No hay ningún device del deviceType requerido en este site — sumando
      // ausente. NO evaluar (nunca ausente-como-cero, DEC-REF-65.b).
      console.warn(
        `[typeCross] Suma ${ruleId}: sin devices de deviceType=${term.deviceType} en site=${siteCode} — hoja no evaluada`
      );
      return null;
    }
    for (const { dId, devState } of devices) {
      const value = devState[term.variable];
      if (value === null || value === undefined || typeof value !== 'number') {
        console.warn(
          `[typeCross] Suma ${ruleId}: ${dId}.${term.variable} sin valor numérico — hoja no evaluada`
        );
        return null;
      }
      const lastUpdate = devState._lastUpdate && devState._lastUpdate[term.variable];
      if (!lastUpdate) {
        console.warn(
          `[typeCross] Suma ${ruleId}: ${dId}.${term.variable} sin timestamp — hoja no evaluada`
        );
        return null;
      }
      const ageMs = eventTs - lastUpdate;
      if (ageMs > SUM_STALENESS_MS) {
        console.warn(
          `[typeCross] Suma ${ruleId}: sumando viejo — deviceId=${dId} variable=${term.variable} antigüedad=${ageMs}ms > ventana=${SUM_STALENESS_MS}ms — hoja no evaluada`
        );
        return null;
      }
      total += value;
      expandidos++;
    }
  }
  // Total agregado, todos frescos → aplicar condition sobre el total.
  return evaluateD(
    { ruleId: `${ruleId}:sum`, condition: node.condition },
    total
  );
}

// ── Evaluación recursiva — TRI-STATE (SF-6 · DEC-REF-65.b) ─────────────────
// Retornos:
//   true   → condición cumplida.
//   false  → condición no cumplida.
//   null   → NO EVALUABLE este ciclo (staleness/ausencia en hoja sum).
// La hoja equipo mantiene comportamiento boolean puro (staleness no aplica —
// SF-6 introduce el concepto solo para la hoja de suma; scope creep evitado).
// AND/OR propagan null: en AND, un false gana (short-circuit); si no hay false
// y hay algún null, el AND es null; todos true → true. Simétrico para OR.
function evaluateNode(node, siteState, siteCode, eventTs, ruleId) {
  if (node.op === 'AND') {
    let sawNull = false;
    for (const child of node.children) {
      const v = evaluateNode(child, siteState, siteCode, eventTs, ruleId);
      if (v === false) return false;
      if (v === null) sawNull = true;
    }
    return sawNull ? null : true;
  }
  if (node.op === 'OR') {
    let sawNull = false;
    for (const child of node.children) {
      const v = evaluateNode(child, siteState, siteCode, eventTs, ruleId);
      if (v === true) return true;
      if (v === null) sawNull = true;
    }
    return sawNull ? null : false;
  }
  if (Array.isArray(node.sum)) {
    return evaluateSum(node, siteState, siteCode, eventTs, ruleId);
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
  const treeVal = evaluateNode(rule.crossExpr, siteState, siteCode, eventTs, rule.ruleId);

  const startKey = `${siteCode}:${rule.ruleId}:start`;
  const firedKey = `${siteCode}:${rule.ruleId}:fired`;

  // SF-6 · DEC-REF-65.b — staleness: no evaluar este ciclo. No tocar
  // crossState (preservar startKey y firedKey del ciclo anterior); no fire,
  // no resolve. La próxima evaluación con valores frescos decide.
  if (treeVal === null) {
    return { fired: false, resolved: false };
  }

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
