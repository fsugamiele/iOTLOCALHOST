// Validación de forma de reglas de un RulePack — SF-1 (DEC-REF-57) +
// SF-6 (DEC-REF-65.d) + SF-7 (DEC-REF-66).
//
// Motivación: siteState.js:29-43 descarta silenciosamente reglas cross
// con forma inválida o `sum-pending`, y typeS.js:12-15 descarta reglas S
// con `window` malformado con `console.warn` MUDO (regla-fantasma clase
// "el motor sabe menos de lo que el editor guardó"). Con validación
// app-side el 400 llega al frontend con razón explícita antes del write.
//
// SF-7 · DEC-REF-66 — se agregan validateC (typeC), validateS (typeS) y
// validateD (typeD) espejo del patrón sum, con dos niveles:
//   - RECHAZO 400: forma incorrecta que rompe el evaluador (fantasma).
//   - ADVERTENCIA (warnings[]): forma legal pero semánticamente muerta
//     (setpointSource.variable vacío queriendo calibrated, fallbackToD:
//     false + on_missing_ref:'ignore' que silencia siempre). La ruta
//     responde 200 con el pack guardado + warnings[]; el frontend las
//     muestra en amarillo sin bloquear el save.

const ALL_OPS        = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const ARITHMETIC_OPS = ['lt', 'lte', 'gt', 'gte'];

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ─── typeCross · DEC-REF-57 + DEC-REF-65.d ────────────────────────────
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
    // SF-6 · DEC-REF-65.d — condition debe tener value numérico (evaluateD
    // aplica ops aritméticos: lt/lte/gt/gte/eq/neq contra el total sumado).
    if (typeof node.condition.value !== 'number') {
      return { ok: false, reason: 'hoja sum: condition.value debe ser numérico' };
    }
    return { ok: true };
  }
  if (node.deviceType && node.variable) {
    if (!node.condition || !node.condition.op) {
      return { ok: false, reason: `hoja equipo ${node.deviceType}/${node.variable} sin condition` };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'nodo desconocido (ni AND/OR ni hoja equipo/sum)' };
}

// ─── typeD · DEC-REF-66 (validación mínima, costo marginal) ───────────
function validateD(rule) {
  const c = rule.condition;
  if (!c || !c.op) return { ok: false, reason: 'typeD: condition ausente o sin op' };
  if (!ALL_OPS.includes(c.op)) {
    return { ok: false, reason: `typeD: condition.op inválido '${c.op}' (esperado uno de ${ALL_OPS.join('/')})` };
  }
  if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
    return { ok: false, reason: `typeD: condition.value debe ser numérico para op '${c.op}'` };
  }
  return { ok: true };
}

// ─── typeC · DEC-REF-66.a (rechazos + advertencias) ───────────────────
// Consume: setpointSource.variable, fallbackToD, on_missing_ref,
//          condition {op, value}, escalateAfterMinutes (EDGE-2, DEC-REF-26).
function validateC(rule) {
  const warnings = [];
  const fallback = rule.fallbackToD === true;                       // default schema: true
  const onMissing = rule.on_missing_ref || 'ignore';                // default schema: 'ignore'
  const needsCondition = fallback || onMissing === 'alarm';
  const c = rule.condition;

  // RECHAZO — condition requerida si se activaría fallback o alarma en no-ref
  if (needsCondition) {
    if (!c || !c.op) {
      return { ok: false, reason: `typeC: condition requerida (fallbackToD:${fallback}, on_missing_ref:'${onMissing}') pero ausente o sin op` };
    }
    if (!ALL_OPS.includes(c.op)) {
      return { ok: false, reason: `typeC: condition.op inválido '${c.op}' (esperado uno de ${ALL_OPS.join('/')})` };
    }
    if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
      return { ok: false, reason: `typeC: condition.value debe ser numérico para op '${c.op}'` };
    }
  } else if (c && c.op) {
    // Condition provista aunque no requerida: validarla igual (por si el usuario cambia flags después)
    if (!ALL_OPS.includes(c.op)) {
      return { ok: false, reason: `typeC: condition.op inválido '${c.op}' (esperado uno de ${ALL_OPS.join('/')})` };
    }
    if (ARITHMETIC_OPS.includes(c.op) && c.value !== undefined && c.value !== null && !isNumber(c.value)) {
      return { ok: false, reason: `typeC: condition.value debe ser numérico para op '${c.op}'` };
    }
  }

  // ADVERTENCIA — setpointSource.variable vacío pero fallbackToD:false → jamás será calibrated
  const sp = rule.setpointSource || {};
  const spVar = sp.variable && String(sp.variable).trim();
  if (!spVar) {
    warnings.push(`typeC: setpointSource.variable vacío — la regla nunca correrá en modo 'calibrated' (siempre fallback/no-ref)`);
  }

  // ADVERTENCIA — config semánticamente muerta: sin fallback, sin alarma en no-ref → silencia siempre que no haya setpoint
  if (!fallback && onMissing !== 'alarm') {
    warnings.push(`typeC: fallbackToD:false + on_missing_ref:'${onMissing}' → cuando falta setpoint la regla silencia (jamás emite fire por el camino no-ref)`);
  }

  // Nota EDGE-2 (informativa, no bloqueante): escalateAfterMinutes se consume
  // en ruleEngine.js:104 (DEC-REF-26). Rango razonable > 0; 0/negativos no
  // deshabilita explícitamente pero el timer nunca dispararía.
  if (rule.escalateAfterMinutes != null && (!isNumber(rule.escalateAfterMinutes) || rule.escalateAfterMinutes <= 0)) {
    warnings.push(`typeC: escalateAfterMinutes debe ser un número > 0 (o null para desactivar EDGE-2)`);
  }

  return warnings.length ? { ok: true, warnings } : { ok: true };
}

// ─── typeS · DEC-REF-66.b (rechazos duros) ────────────────────────────
// Consume: window.durationSec, window.countThreshold, window.matchCondition {op, value}.
function validateS(rule) {
  const w = rule.window;
  if (!w) return { ok: false, reason: 'typeS: window ausente' };
  if (!isNumber(w.durationSec) || w.durationSec <= 0) {
    return { ok: false, reason: `typeS: window.durationSec debe ser número > 0 (recibido: ${JSON.stringify(w.durationSec)})` };
  }
  if (!isNumber(w.countThreshold) || w.countThreshold < 1 || !Number.isInteger(w.countThreshold)) {
    return { ok: false, reason: `typeS: window.countThreshold debe ser entero ≥ 1 (recibido: ${JSON.stringify(w.countThreshold)})` };
  }
  const mc = w.matchCondition;
  if (!mc || !mc.op) {
    return { ok: false, reason: 'typeS: window.matchCondition ausente o sin op' };
  }
  if (!ALL_OPS.includes(mc.op)) {
    return { ok: false, reason: `typeS: window.matchCondition.op inválido '${mc.op}' (esperado uno de ${ALL_OPS.join('/')})` };
  }
  if (ARITHMETIC_OPS.includes(mc.op) && !isNumber(mc.value)) {
    return { ok: false, reason: `typeS: window.matchCondition.value debe ser numérico para op '${mc.op}'` };
  }
  return { ok: true };
}

// ─── Despacho por tipo · DEC-REF-66 ───────────────────────────────────
// Retorna { ok:true, warnings:[] } (agregado de warnings de todas las reglas
// que pasaron) o { ok:false, ruleId, reason } con el primer error.
function validateRule(rule) {
  switch (rule.type) {
    case 'cross': return validateCrossTree(rule.crossExpr);
    case 'D':     return validateD(rule);
    case 'C':     return validateC(rule);
    case 'S':     return validateS(rule);
    default:      return { ok: false, reason: `type desconocido: '${rule.type}'` };
  }
}

// ─── Referencias de hojas cross · S5 ──────────────────────────────────
// Recorre los crossExpr de las reglas type:'cross' y devuelve las refs
// { ruleId, deviceType, variable } de cada hoja (equipo o término sum).
// Puro: la comparación contra equipmentsheets (async, DB) vive en la
// ruta — shape y referencia son dos validaciones de naturaleza distinta.
function collectCrossLeafRefs(pack) {
  const refs = [];
  const rules = Array.isArray(pack?.rules) ? pack.rules : [];
  const walk = (node, ruleId) => {
    if (node == null || typeof node !== 'object') return;
    if (node.op === 'AND' || node.op === 'OR') {
      for (const child of node.children || []) walk(child, ruleId);
      return;
    }
    if (Array.isArray(node.sum)) {
      for (const term of node.sum) {
        if (term && term.deviceType && term.variable) {
          refs.push({ ruleId, deviceType: term.deviceType, variable: term.variable });
        }
      }
      return;
    }
    if (node.deviceType && node.variable) {
      refs.push({ ruleId, deviceType: node.deviceType, variable: node.variable });
    }
  };
  for (const r of rules) {
    if (r && r.type === 'cross') walk(r.crossExpr, r.ruleId);
  }
  return refs;
}

module.exports = {
  validateCrossTree,
  validateD,
  validateC,
  validateS,
  validateRule,
  collectCrossLeafRefs,
  ALL_OPS,
  ARITHMETIC_OPS,
};
