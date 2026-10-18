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

const { isCombined, validateCombined } = require('./combinedRule');

const ALL_OPS        = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const ARITHMETIC_OPS = ['lt', 'lte', 'gt', 'gte'];

// Nombre de una medición en palabras (la API no tiene las etiquetas de la ficha).
const human = (v) => String(v || 'la medición').replace(/_/g, ' ');

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ─── typeCross · DEC-REF-57 + DEC-REF-65.d ────────────────────────────
function validateCrossTree(node, depth = 0) {
  if (depth > 8) return { ok: false, reason: 'Hay demasiados grupos de condiciones uno dentro de otro.' };
  if (node == null || typeof node !== 'object') {
    return { ok: false, reason: 'Hay una condición vacía: quitala o completala.' };
  }
  if (node.op === 'AND' || node.op === 'OR') {
    if (!Array.isArray(node.children) || node.children.length === 0) {
      return { ok: false, reason: 'Hay un grupo de condiciones vacío: agregale al menos una condición o quitalo.' };
    }
    for (const child of node.children) {
      const r = validateCrossTree(child, depth + 1);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (Array.isArray(node.sum)) {
    if (node.sum.length === 0) return { ok: false, reason: 'La suma entre equipos no tiene equipos: agregá al menos uno.' };
    for (const term of node.sum) {
      if (!term || !term.deviceType || !term.variable) {
        return { ok: false, reason: 'En la suma entre equipos falta elegir el equipo o la medición.' };
      }
    }
    if (!node.condition || !node.condition.op) {
      return { ok: false, reason: 'A la suma entre equipos le falta con qué compararla.' };
    }
    // SF-6 · DEC-REF-65.d — condition debe tener value numérico (evaluateD
    // aplica ops aritméticos: lt/lte/gt/gte/eq/neq contra el total sumado).
    if (typeof node.condition.value !== 'number') {
      return { ok: false, reason: 'El valor de comparación de la suma entre equipos tiene que ser un número.' };
    }
    return { ok: true };
  }
  if (node.deviceType && node.variable) {
    // DEC-REF-127 (B8) — hoja-equipo tan estricta como la hoja-suma: op ∈ enum y
    // value numérico para ops aritméticos (eq/neq admiten string, ej. gen_status).
    const c = node.condition;
    if (!c || !c.op) {
      return { ok: false, reason: `A la condición sobre ${human(node.variable)} le falta con qué compararla.` };
    }
    if (!ALL_OPS.includes(c.op)) {
      return { ok: false, reason: `La condición sobre ${human(node.variable)} tiene una comparación desconocida: elegí "mayor que", "menor que", etc.` };
    }
    if (c.ref) {
      // spec_umbral_por_referencia — umbral desde una variable/parámetro de un equipo del sitio.
      const r = c.ref;
      if (!r.deviceType || !r.variable) return { ok: false, reason: `La condición sobre ${human(node.variable)} se compara con otra medición: elegí el equipo y la medición de referencia.` };
      if (!ARITHMETIC_OPS.includes(c.op)) return { ok: false, reason: `La condición sobre ${human(node.variable)} se compara con otra medición: usá "mayor que" o "menor que".` };
      if ((c.value !== undefined && c.value !== null && c.value !== '') || c.limitRef) return { ok: false, reason: `La condición sobre ${human(node.variable)} tiene dos valores de comparación: dejá solo uno (valor fijo, umbral de la ficha u otra medición).` };
      if (r.scale != null && !(Number(r.scale) > 0)) return { ok: false, reason: `La condición sobre ${human(node.variable)}: el porcentaje de la medición de referencia tiene que ser mayor que cero.` };
      return { ok: true };
    }
    if (c.limitRef !== undefined && c.limitRef !== null) {
      // spec_cascada_ficha C2 — umbral por referencia a la ficha (se resuelve al cargar).
      if (!['warning', 'trip'].includes(c.limitRef)) return { ok: false, reason: `La condición sobre ${human(node.variable)} usa un umbral de la ficha que no existe: elegí el de atención o el crítico.` };
      if (c.value !== undefined && c.value !== null && c.value !== '') return { ok: false, reason: `La condición sobre ${human(node.variable)} tiene dos valores de comparación: dejá el valor fijo o el umbral de la ficha.` };
      return { ok: true };
    }
    if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
      return { ok: false, reason: `En la condición sobre ${human(node.variable)}, el valor de comparación tiene que ser un número.` };
    }
    return { ok: true };
  }
  return { ok: false, reason: 'Hay una condición que no se reconoce: quitala y volvé a crearla.' };
}

// ─── typeD · DEC-REF-66 (validación mínima, costo marginal) ───────────
function validateD(rule) {
  const c = rule.condition;
  if (!c || !c.op) return { ok: false, reason: 'Falta elegir la comparación (mayor que, menor que…) y el valor.' };
  if (!ALL_OPS.includes(c.op)) {
    return { ok: false, reason: 'La comparación elegida no existe: usá "mayor que", "menor que", "igual a"…' };
  }
  if (c.limitRef !== undefined && c.limitRef !== null) {
    // spec_cascada_ficha C2 — umbral por referencia a la ficha.
    if (!['warning', 'trip'].includes(c.limitRef)) return { ok: false, reason: 'El umbral de la ficha elegido no existe: elegí el de atención o el crítico.' };
    if (c.value !== undefined && c.value !== null && c.value !== '') return { ok: false, reason: 'Hay dos valores de comparación: dejá el valor fijo o el umbral de la ficha.' };
    return { ok: true };
  }
  if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
    return { ok: false, reason: 'El valor de comparación tiene que ser un número.' };
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

  // RECHAZO — condition.op SIEMPRE requerida (auditoría 2026-10-14, M-03): el
  // camino CALIBRADO también usa condition.op (compara contra setpoint × scale).
  // Antes se aceptaba sin condition cuando fallbackToD:false + on_missing_ref:'ignore'
  // y el edge moría con TypeError apenas llegaba el setpoint.
  if (!c || !c.op) {
    return { ok: false, reason: 'Falta elegir la comparación contra el límite del equipo (mayor que, menor que…).' };
  }
  if (needsCondition) {
    if (!ALL_OPS.includes(c.op)) {
      return { ok: false, reason: 'La comparación elegida no existe: usá "mayor que", "menor que", "igual a"…' };
    }
    if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
      return { ok: false, reason: 'El valor de respaldo (el que se usa si el equipo no informa su límite) tiene que ser un número.' };
    }
  } else if (c && c.op) {
    // Condition provista aunque no requerida: validarla igual (por si el usuario cambia flags después)
    if (!ALL_OPS.includes(c.op)) {
      return { ok: false, reason: 'La comparación elegida no existe: usá "mayor que", "menor que", "igual a"…' };
    }
    if (ARITHMETIC_OPS.includes(c.op) && c.value !== undefined && c.value !== null && !isNumber(c.value)) {
      return { ok: false, reason: 'El valor de respaldo (el que se usa si el equipo no informa su límite) tiene que ser un número.' };
    }
  }

  // ADVERTENCIA — setpointSource.variable vacío pero fallbackToD:false → jamás será calibrated
  const sp = rule.setpointSource || {};
  const spVar = sp.variable && String(sp.variable).trim();
  if (!spVar) {
    warnings.push('No se eligió qué medición informa el límite del equipo: la regla va a usar siempre el valor de respaldo.');
  }

  // ADVERTENCIA — config semánticamente muerta: sin fallback, sin alarma en no-ref → silencia siempre que no haya setpoint
  if (!fallback && onMissing !== 'alarm') {
    warnings.push('Si el equipo no informa su límite, esta regla no va a avisar nunca (no tiene valor de respaldo).');
  }

  // Nota EDGE-2 (informativa, no bloqueante): escalateAfterMinutes se consume
  // en ruleEngine.js:104 (DEC-REF-26). Rango razonable > 0; 0/negativos no
  // deshabilita explícitamente pero el timer nunca dispararía.
  if (rule.escalateAfterMinutes != null && (!isNumber(rule.escalateAfterMinutes) || rule.escalateAfterMinutes <= 0)) {
    warnings.push('Los minutos para subir la gravedad cuando falta el límite del equipo tienen que ser mayores que cero (o dejalo vacío).');
  }

  return warnings.length ? { ok: true, warnings } : { ok: true };
}

// ─── typeS · DEC-REF-66.b (rechazos duros) ────────────────────────────
// Consume: window.durationSec, window.countThreshold, window.matchCondition {op, value}.
function validateS(rule) {
  const w = rule.window;
  if (!w) return { ok: false, reason: 'Falta indicar cuántas veces y en cuántos minutos.' };
  if (!isNumber(w.durationSec) || w.durationSec <= 0) {
    return { ok: false, reason: 'Los minutos tienen que ser un número mayor que cero.' };
  }
  if (!isNumber(w.countThreshold) || w.countThreshold < 1 || !Number.isInteger(w.countThreshold)) {
    return { ok: false, reason: 'La cantidad de veces tiene que ser un número entero, 1 o más.' };
  }
  const mc = w.matchCondition;
  if (!mc || !mc.op) {
    return { ok: false, reason: 'Falta elegir la comparación (mayor que, menor que…) y el valor.' };
  }
  if (!ALL_OPS.includes(mc.op)) {
    return { ok: false, reason: 'La comparación elegida no existe: usá "mayor que", "menor que", "igual a"…' };
  }
  if (ARITHMETIC_OPS.includes(mc.op) && !isNumber(mc.value)) {
    return { ok: false, reason: 'El valor de comparación tiene que ser un número.' };
  }
  return { ok: true };
}

// ─── typeM · spec_motor_m.md (Ola M1: slope/acceleration/projection) ──
const M_METRICS = [
  'slope', 'acceleration', 'projection', 'baseline', 'variance',
  'ratio', 'divergence', 'spread',
  'accumulator', 'dutyCycle', 'cumulativeSince',
  'flatline', 'staleness', 'stepJump',
];
// Sub-familias que consumen una ventana temporal (buffer/serie).
const M_TEMPORAL = [
  'slope', 'acceleration', 'projection', 'baseline', 'variance',
  'flatline', 'stepJump', 'dutyCycle',
  // 'cumulativeSince'/'accumulator' NO llevan mWindow — son acumuladores persistentes (M3).
  // 'staleness' NO lleva mWindow — se mide por TICK (§8-D3): umbral = minutos de silencio en condition.value (M4).
];
function validateM(rule) {
  if (!rule.metric || !M_METRICS.includes(rule.metric)) {
    return { ok: false, reason: 'La forma de vigilar elegida no está disponible.' };
  }
  const c = rule.condition;
  if (!c || !c.op) return { ok: false, reason: 'Falta elegir la comparación (mayor que, menor que…) y el valor.' };
  if (!ALL_OPS.includes(c.op)) {
    return { ok: false, reason: 'La comparación elegida no existe: usá "mayor que", "menor que", "igual a"…' };
  }
  if (ARITHMETIC_OPS.includes(c.op) && !isNumber(c.value)) {
    return { ok: false, reason: 'El valor de comparación tiene que ser un número.' };
  }
  if (M_TEMPORAL.includes(rule.metric)) {
    const w = rule.mWindow;
    if (!w || !isNumber(w.durationSec) || w.durationSec <= 0) {
      return { ok: false, reason: 'Indicá cuántos minutos mirar (un número mayor que cero).' };
    }
    if (!isNumber(w.minSamples) || w.minSamples < 2 || !Number.isInteger(w.minSamples)) {
      return { ok: false, reason: 'Hacen falta al menos 2 lecturas para calcularlo.' };
    }
  }
  if (rule.metric === 'projection' && !isNumber(rule.mParams && rule.mParams.target)) {
    return { ok: false, reason: 'Indicá a qué valor tiene que llegar.' };
  }
  // Ola M2 — multivariante instantáneo (lee siteState).
  if (rule.metric === 'ratio' || rule.metric === 'divergence') {
    const inp = rule.inputs;
    if (!Array.isArray(inp) || inp.length !== 2 || inp.some(i => !i || !i.variable)) {
      return { ok: false, reason: 'Elegí las dos mediciones a comparar.' };
    }
  }
  if (rule.metric === 'spread') {
    const inp = (rule.inputs && rule.inputs[0]) || {};
    const variable = inp.variable || rule.variable;
    if (!variable) {
      return { ok: false, reason: 'Elegí qué medición comparar entre los equipos del sitio.' };
    }
  }
  return { ok: true };
}

// ─── Despacho por tipo · DEC-REF-66 ───────────────────────────────────
// Retorna { ok:true, warnings:[] } (agregado de warnings de todas las reglas
// que pasaron) o { ok:false, ruleId, reason } con el primer error.
function validateRule(rule) {
  // E1 · U-01 — el umbral de la ficha (limitRef) solo lo resuelven D y las hojas cross.
  // En C/S/M el editor lo guardaba como value:0 (regla muerta o disparando siempre).
  if (['C', 'S', 'M'].includes(rule.type)) {
    const conds = [rule.condition, rule.window && rule.window.matchCondition];
    if (conds.some(c => c && c.limitRef !== undefined && c.limitRef !== null && c.limitRef !== '')) {
      return { ok: false, reason: 'El umbral de la ficha solo se puede usar en reglas de umbral simple o combinadas: cargá un valor fijo.' };
    }
  }
  switch (rule.type) {
    case 'cross': {
      const v = validateCrossTree(rule.crossExpr);
      if (!v.ok || !isCombined(rule)) return v;
      return validateCombined(rule, validateM);   // spec_reglas_compuestas — hojas y límites
    }
    case 'D':     return validateD(rule);
    case 'C':     return validateC(rule);
    case 'S':     return validateS(rule);
    case 'M':     return validateM(rule);
    default:      return { ok: false, reason: 'El tipo de regla no se reconoce: volvé a crearla desde el editor.' };
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

// DEC-REF-127 (B8) — TODAS las refs {ruleId, deviceType, variable, kind} de una
// regla: hojas cross/sum + top-level de D/C/S/M + inputs de M2. La ruta las
// chequea contra las fichas (warning) para cazar typos (regla-fantasma que el
// motor silencia para siempre: ruleEngine.js gate rule.variable !== variable).
function collectRuleRefs(pack) {
  const refs = [];
  const rules = Array.isArray(pack?.rules) ? pack.rules : [];
  const walk = (node, ruleId) => {
    if (node == null || typeof node !== 'object') return;
    if (node.op === 'AND' || node.op === 'OR') { for (const ch of node.children || []) walk(ch, ruleId); return; }
    if (Array.isArray(node.sum)) {
      for (const t of node.sum) if (t && t.deviceType && t.variable) refs.push({ ruleId, deviceType: t.deviceType, variable: t.variable, kind: 'hoja' });
      return;
    }
    if (node.deviceType && node.variable) refs.push({ ruleId, deviceType: node.deviceType, variable: node.variable, kind: 'hoja' });
  };
  for (const r of rules) {
    if (!r) continue;
    if (r.type === 'cross') { walk(r.crossExpr, r.ruleId); continue; }
    if (r.deviceType && r.variable) refs.push({ ruleId: r.ruleId, deviceType: r.deviceType, variable: r.variable, kind: 'variable' });
    if (r.type === 'M' && Array.isArray(r.inputs)) {
      for (const inp of r.inputs) if (inp && inp.variable) refs.push({ ruleId: r.ruleId, deviceType: inp.deviceType || r.deviceType, variable: inp.variable, kind: 'input' });
    }
  }
  return refs;
}

module.exports = {
  validateCrossTree,
  validateD,
  validateC,
  validateS,
  validateM,
  validateRule,
  collectCrossLeafRefs,
  collectRuleRefs,
  ALL_OPS,
  ARITHMETIC_OPS,
};
