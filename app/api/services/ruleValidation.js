// Validación de forma del árbol `crossExpr` de una RulePack.
// Extraída de edge-engine/evaluators/typeCross.js (DEC-REF-47 + DEC-REF-51 C2)
// como parte de SF-1 (DEC-REF-57) para que la ruta HTTP CRUD la ejerza
// ANTES del write y cierre el riesgo de regla-fantasma:
// siteState.js:29-43 descarta silenciosamente reglas cross con forma
// inválida o `sum-pending`; si el editor guarda un pack roto, la regla
// desaparece sin log visible en la UI. Con validación app-side el 400
// llega al frontend con razón explícita.
//
// Semántica de `reason`:
//   'sum-pending'    → hoja de suma detectada, shape VÁLIDO en el árbol,
//                      pendiente de implementación (DEC-REF-47). El edge la
//                      descarta en loadPacks; la app la trata como forma
//                      todavía-no-soportada (misma decisión: 400 con razón).
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

module.exports = { validateCrossTree };
