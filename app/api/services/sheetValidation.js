// Auditoría 2026-10-14 (F-05) — validación de contenido de la ficha de equipo.
// La ficha es la fuente de verdad de unidades, tipos y umbrales (cascada
// Ficha → Template → Device → Regla, decisión Franco): un dato mal formado acá
// se propaga como regla muda. Puro (sin DB): lo usan POST y PUT de
// routes/equipmentsheets.js sobre el documento YA MERGEADO.
//
// validateSheetContent(sheet) → null | 'mensaje de error'

// float/int/bool/categorical + los históricos que fichas.vue sigue ofreciendo
// (number/string/boolean = alias de float/categorical/bool).
const VAR_TYPES = ['float', 'int', 'bool', 'categorical', 'number', 'string', 'boolean'];
const NAME_RE = /^[a-z][a-z0-9_]*$/;             // viaja en el topic MQTT
const NUMERIC = new Set(['float', 'int', 'number']);
const ARITH_OPS = new Set(['lt', 'lte', 'gt', 'gte']);

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

// "min-max" con negativos ("-58--42") — mismo criterio que ValueStatus.vue.
function parseRange(r) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(r));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a < b ? { min: a, max: b } : null;
}

function validateVariable(v, i) {
  const where = `variables[${i}]${v && v.name ? ` (${v.name})` : ''}`;
  if (!v || typeof v !== 'object') return `${where}: no es un objeto`;
  if (!v.name || !NAME_RE.test(v.name)) return `${where}: name técnico inválido (snake_case: minúsculas, dígitos y _)`;
  if (v.type != null && v.type !== '' && !VAR_TYPES.includes(v.type)) return `${where}: type '${v.type}' inválido (${VAR_TYPES.join('/')})`;
  if (v.deadband != null && !(isNum(Number(v.deadband)) && Number(v.deadband) >= 0)) return `${where}: deadband debe ser ≥ 0`;

  let range = null;
  if (v.factoryRange) {
    range = parseRange(v.factoryRange);
    if (!range) return `${where}: factoryRange '${v.factoryRange}' no parsea (formato "min-max", min < max, punto decimal)`;
  }

  const limits = Array.isArray(v.limits) ? v.limits : [];
  if (limits.length && v.type && !NUMERIC.has(v.type)) {
    // bool/categorical: solo eq/neq tienen sentido
    const bad = limits.find(l => ARITH_OPS.has(l.op));
    if (bad) return `${where}: límite '${bad.op}' sobre variable ${v.type} (usar eq/neq)`;
  }
  for (const [j, l] of limits.entries()) {
    const lw = `${where}.limits[${j}]`;
    if (!l || !l.kind || !l.op) return `${lw}: kind y op son requeridos`;
    if (ARITH_OPS.has(l.op) && !isNum(l.value)) return `${lw}: value debe ser numérico (punto decimal) para op '${l.op}'`;
    if (l.value === undefined || l.value === null || l.value === '') return `${lw}: value requerido`;
    if (l.unit && v.unit && l.unit !== v.unit) return `${lw}: unidad '${l.unit}' distinta de la variable '${v.unit}'`;
  }
  // Orden warning/trip por sentido: gt → warning < trip ; lt → warning > trip.
  for (const dir of ['gt', 'lt']) {
    const ops = dir === 'gt' ? ['gt', 'gte'] : ['lt', 'lte'];
    const w = limits.filter(l => l.kind === 'warning' && ops.includes(l.op)).map(l => l.value);
    const t = limits.filter(l => l.kind === 'trip' && ops.includes(l.op)).map(l => l.value);
    if (w.length > 1 || t.length > 1) return `${where}: más de un límite ${dir} del mismo kind`;
    if (w.length && t.length) {
      if (dir === 'gt' && !(w[0] < t[0])) return `${where}: para 'gt' el warning (${w[0]}) debe ser menor que el trip (${t[0]})`;
      if (dir === 'lt' && !(w[0] > t[0])) return `${where}: para 'lt' el warning (${w[0]}) debe ser mayor que el trip (${t[0]})`;
    }
  }
  return null;
}

function validateSheetContent(sheet) {
  if (!sheet || typeof sheet !== 'object') return 'ficha vacía';
  if (!sheet.deviceType || !String(sheet.deviceType).trim()) return 'deviceType requerido';
  const vars = Array.isArray(sheet.variables) ? sheet.variables : [];
  const seen = new Set();
  for (const [i, v] of vars.entries()) {
    const err = validateVariable(v, i);
    if (err) return err;
    if (seen.has(v.name)) return `variable duplicada: ${v.name}`;
    seen.add(v.name);
  }
  const a = sheet.autonomy;
  if (a && a.fuelVariable) {
    for (const k of ['fuelVariable', 'flowVariable', 'runningVariable']) {
      if (a[k] && !seen.has(a[k])) return `autonomy.${k} '${a[k]}' no existe en variables[] de la ficha`;
    }
    const fuel = vars.find(v => v.name === a.fuelVariable);
    if (fuel && fuel.unit && fuel.unit !== '%') return `autonomy.fuelVariable '${a.fuelVariable}' debe estar en % (está en '${fuel.unit}')`;
  }
  return null;
}

module.exports = { validateSheetContent, parseRange };
