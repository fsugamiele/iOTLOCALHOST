// DEC-REF-116 (#83) — NÚCLEO del editor-frase de Reglas de Monitoreo.
//
// Módulo PURO (sin Vue): traduce entre la "frase" que arma el usuario y el
// payload `RuleDefinition` que consume el motor. El usuario nunca ve "D/C/S/cross":
// el TIPO se INFIERE de la frase.
//   B1: 1 condición → D.
//   B2: 1 condición + duración/repetición → S · 1 condición + "vs valor del
//       equipo" → C · 2+ condiciones (Y/O) → cross (plano).
// El cross ANIDADO (grupos dentro de grupos) no se representa en la frase plana:
// se marca `nested` y se edita en la sección avanzada (CrossExprNode) del editor.
//
// La identidad interna de comparadores (lt/gt/...) NO se toca — grabada en
// db.rulepacks; la legibilidad va por OPERATOR_LABELS (capa de presentación).

export const OPERATOR_LABELS = {
  gt: 'mayor que', gte: 'mayor o igual que',
  lt: 'menor que', lte: 'menor o igual que',
  eq: 'igual a',   neq: 'distinto de',
};
export const OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];

// spec_cascada_ficha C2 — umbral por referencia a la ficha.
export const LIMIT_REF_LABELS = { warning: 'umbral de atención de la ficha', trip: 'umbral crítico de la ficha' };
// Valor efectivo de una condición: el literal, o el límite de la ficha (resuelto con `sheets`).
export function resolveCondValue(c, deviceType, variable, sheets) {
  if (!c) return '';
  if (!c.limitRef) return c.value;
  const sh = (sheets || []).find(s => s.deviceType === deviceType);
  const v = sh && (sh.variables || []).find(x => x.name === variable);
  const dir = ['lt', 'lte'].includes(c.op) ? ['lt', 'lte'] : ['gt', 'gte'].includes(c.op) ? ['gt', 'gte'] : [c.op];
  const lim = v && (v.limits || []).find(l => l.kind === c.limitRef && dir.includes(l.op));
  return lim ? lim.value : undefined;
}
function condValueText(c, deviceType, variable, sheets, unit) {
  if (!c || !c.limitRef) return c ? c.value : '';
  const val = resolveCondValue(c, deviceType, variable, sheets);
  const u = unit ? ` ${unit}` : '';
  return `${LIMIT_REF_LABELS[c.limitRef]}${val !== undefined ? ` (${val}${u})` : ' (no definido)'}`;
}
// Texto con `{umbral}` (label / recomendación) → con el valor vigente de la regla
// (literal, o el límite de la ficha). Espejo del fillThreshold del motor.
export function fillThresholdText(text, rule, sheets) {
  if (typeof text !== 'string' || !text.includes('{umbral}') || !rule) return text;
  let v;
  if (rule.condition) v = resolveCondValue(rule.condition, rule.deviceType, rule.variable, sheets);
  if (typeof v !== 'number' && rule.crossExpr) {
    const leaves = [];
    const walk = (n) => { if (!n) return; if (Array.isArray(n.children)) n.children.forEach(walk); else if (n.condition) leaves.push(n); };
    walk(rule.crossExpr);
    const own = leaves.find(l => l.variable === rule.variable && (l.condition.limitRef || typeof l.condition.value === 'number')) || leaves.find(l => l.condition.limitRef);
    if (own) v = resolveCondValue(own.condition, own.deviceType, own.variable, sheets);
  }
  if (typeof v !== 'number') return text.replace(/\{umbral\}/g, 'el umbral configurado');
  const u = rule.unit ? (rule.unit === '%' ? ' %' : ` ${rule.unit}`) : '';
  return text.replace(/\{umbral\}/g, `${String(Math.round(v * 100) / 100).replace('.', ',')}${u}`);
}

// Condición del payload desde una condición de la frase.
function condFromSentence(c) {
  let out;
  if (c.limitRef) out = { op: c.op, limitRef: c.limitRef };
  // E1 · U-05 — umbral relativo a otra variable (condition.ref): se conserva mientras no se escriba un número.
  else if (c.ref && (c.value === '' || c.value === null || c.value === undefined)) out = { op: c.op, ref: c.ref };
  else out = { op: c.op, value: coerceValue(c.value, c.variableType) };
  if (c.deadband != null && c.deadband !== '') out.deadband = c.deadband;   // E1 · U-05 histéresis de la hoja
  return out;
}

export const SEVERITIES = [
  { value: 'critical', label: 'Urgencia',     help: 'Requiere acción inmediata',       badge: 'badge-danger'  },
  { value: 'warning',  label: 'Atención',      help: 'Hay que revisarlo pronto',        badge: 'badge-warning' },
  { value: 'info',     label: 'Informativo',   help: 'Queda registrado, sin urgencia',  badge: 'badge-info'    },
];
export function severityLabel(sev) { const s = SEVERITIES.find(x => x.value === sev); return s ? s.label : (sev || ''); }
export function severityBadge(sev) { const s = SEVERITIES.find(x => x.value === sev); return s ? s.badge : 'badge-secondary'; }

// ── Resumen legible de CUALQUIER regla (para las cards) ──────────────────
// Resumen legible (Franco #83): SIEMPRE el nombre legible de la variable
// (label), no el técnico. Las hojas cross no guardan el label, así que se
// resuelve desde las fichas (opts.sheets) por deviceType+variable.
export function summarize(r, opts = {}) {
  if (!r) return '';
  const sheets = opts.sheets || [];
  const varName = r.variableLabel || r.variable || '';
  const unit = r.unit ? ` ${r.unit}` : '';
  if (r.type === 'D' && r.condition) {
    if (r.condition.limitRef) return `${varName} ${OPERATOR_LABELS[r.condition.op] || r.condition.op} ${condValueText(r.condition, r.deviceType, r.variable, sheets, r.unit)}`;
    return `${varName} ${OPERATOR_LABELS[r.condition.op] || r.condition.op} ${r.condition.value}${unit}`;
  }
  if (r.type === 'C' && r.setpointSource) {
    return `${varName} ${OPERATOR_LABELS[(r.condition || {}).op] || ''} el valor que reporta el equipo`.trim();
  }
  if (r.type === 'S' && r.window) {
    const mc = r.window.matchCondition;
    const cond = mc ? `${varName} ${OPERATOR_LABELS[mc.op] || mc.op} ${mc.value}${unit}` : varName;
    return `${cond}, ${r.window.countThreshold} vez/veces en ${Math.round((r.window.durationSec || 0) / 60)} min`;
  }
  if (r.type === 'cross' && r.crossExpr) {
    const ce = r.crossExpr;
    if (Array.isArray(ce.children) && ce.children.every(isLeaf)) {
      const join = ce.op === 'OR' ? ' O ' : ' Y ';
      return ce.children.map(n => leafText(n, sheets)).join(join);
    }
    return 'condición combinada entre equipos';
  }
  if (r.type === 'M') {
    const u = r.unit ? ` ${r.unit}` : '';
    if (r.metric === 'slope') {
      const c = r.condition || {};
      const dir = c.op === 'gt' ? 'sube' : 'baja';
      return `${varName} ${dir} más de ${Math.abs(c.value)}${u}`;
    }
    if (r.metric === 'projection') {
      const tgt = r.mParams && r.mParams.target;
      return `${varName} va a llegar a ${tgt} en menos de ${(r.condition || {}).value} h`;
    }
    if (r.metric === 'spread') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `desbalance de ${vlabel} entre equipos ${OPERATOR_LABELS[c.op] || c.op} ${c.value}${u}`;
    }
    if (r.metric === 'ratio' || r.metric === 'divergence') {
      const i0 = (r.inputs && r.inputs[0]) || {};
      const i1 = (r.inputs && r.inputs[1]) || {};
      const l0 = r.variableLabel || resolveVarLabel(i0.deviceType || r.deviceType, i0.variable || r.variable, sheets);
      const l1 = resolveVarLabel(i1.deviceType || r.deviceType, i1.variable, sheets);
      const c = r.condition || {};
      const join = r.metric === 'ratio' ? '÷' : '− (diferencia)';
      return `${l0} ${join} ${l1} ${OPERATOR_LABELS[c.op] || c.op} ${c.value}`;
    }
    if (r.metric === 'dutyCycle') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `${vlabel} en uso ${OPERATOR_LABELS[c.op] || c.op} ${c.value}% del tiempo`;
    }
    if (r.metric === 'cumulativeSince') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `caída acumulada de ${vlabel} desde la última recarga ${OPERATOR_LABELS[c.op] || c.op} ${c.value}${u}`;
    }
    if (r.metric === 'stepJump') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `salto abrupto de ${vlabel} ${OPERATOR_LABELS[c.op] || c.op} ${c.value}${u} en un solo paso`;
    }
    if (r.metric === 'flatline') {
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      const w = r.mWindow ? Math.round((r.mWindow.durationSec || 0) / 60) : 0;
      return `${vlabel} sin cambios (sensor clavado) durante ${w} min`;
    }
    if (r.metric === 'staleness') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `el equipo deja de reportar ${vlabel} por más de ${c.value} min`;
    }
    if (r.metric === 'variance') {
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `${vlabel} con lecturas inestables (salta más de lo habitual)`;
    }
    if (r.metric === 'baseline') {
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `${vlabel} fuera de lo normal para este equipo`;
    }
    if (r.metric === 'acceleration') {
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `${vlabel} empeora cada vez más rápido`;
    }
    if (r.metric === 'accumulator') {
      const c = r.condition || {};
      const vlabel = r.variableLabel || resolveVarLabel(r.deviceType, r.variable, sheets);
      return `${vlabel} llegó a su límite de uso (${c.value}${u})`;
    }
    return `${varName} — vigilancia avanzada`;
  }
  return varName;
}

// ── Descripción en LENGUAJE NATURAL de un cross (DEC-REF-116 · Franco #83) ──
// Respaldo en vivo para el usuario: lee el árbol entero (incl. anidado y suma),
// resolviendo los LABELS de la ficha (no los nombres técnicos). Híbrido:
//   profundidad ≤ 2 → frase corrida redactada.
//   profundidad ≥ 3 → esquema indentado (una frase corrida se vuelve ilegible).
function isGroup(node) { return node && Array.isArray(node.children); }
function isSum(node) { return node && Array.isArray(node.sum); }

// Profundidad de GRUPOS anidados (hojas no cuentan). Cross plano = 1.
export function crossDepth(node) {
  if (!isGroup(node)) return 0;
  let max = 0;
  for (const ch of node.children) if (isGroup(ch)) max = Math.max(max, crossDepth(ch));
  return 1 + max;
}

// spec_reglas_compuestas (K3) — cómo se mide cada condición de una regla combinada.
export const METRIC_LABELS = {
  slope: 'tendencia', projection: 'proyección', acceleration: 'aceleración', ratio: 'relación',
  divergence: 'diferencia', dutyCycle: 'uso %', cumulativeSince: 'caída acumulada', flatline: 'sensor clavado',
  staleness: 'deja de reportar', variance: 'lecturas inestables', accumulator: 'vida útil',
  stepJump: 'salto abrupto', baseline: 'fuera de lo normal',
};
export const LEAF_METRIC_ORDER = ['slope', 'projection', 'acceleration', 'ratio', 'divergence', 'dutyCycle',
  'cumulativeSince', 'flatline', 'staleness', 'variance', 'accumulator', 'stepJump', 'baseline'];
// Regla simple (D/C/M) → condición de una combinada (para "agregar condición" sin perder la métrica).
export function ruleToLeaf(rule) {
  const leaf = {
    deviceType: rule.deviceType || '',
    variable: rule.type === 'M' && Array.isArray(rule.inputs) && rule.inputs[0] && rule.inputs[0].variable ? rule.inputs[0].variable : (rule.variable || ''),
    condition: rule.condition ? { ...rule.condition } : { op: 'gt', value: 0 },
  };
  if (rule.type === 'M') Object.assign(leaf, { measure: 'metric', metric: rule.metric, mWindow: rule.mWindow, mParams: rule.mParams || undefined, inputs: rule.inputs });
  if (rule.type === 'C') Object.assign(leaf, { measure: 'setpoint', setpointSource: rule.setpointSource, fallbackToD: rule.fallbackToD });
  return JSON.parse(JSON.stringify(leaf));
}
const isNewLeaf = (n) => !!n && !isSum(n) && !!(n.measure || n.pick || n.leafId);

function leafPhrase(node, sheets, anchorType) {
  const s = (sheets || []);
  if (isSum(node)) {
    const first = node.sum[0] || {};
    const sh = s.find(x => x.deviceType === first.deviceType);
    const v = sh && (sh.variables || []).find(x => x.name === first.variable);
    const vlabel = (v && v.label) || first.variable || 'medición';
    const eqs = node.sum.map(t => t.deviceType).filter(Boolean).join(' + ') || 'varios equipos';
    const c = node.condition || {};
    return `la suma de ${vlabel} entre ${eqs} sea ${OPERATOR_LABELS[c.op] || c.op} ${c.value}`;
  }
  const sh = s.find(x => x.deviceType === node.deviceType);
  const v = sh && (sh.variables || []).find(x => x.name === node.variable);
  const vlabel = (v && v.label) || node.variable || 'la variable';
  const unit = (v && v.unit) ? ` ${v.unit}` : '';
  let eq = node.deviceType ? ` del ${node.deviceType}` : '';
  if (anchorType && node.deviceType === anchorType) eq = ' de este equipo';
  else if (node.pick === 'all') eq = ` de todos los ${node.deviceType}`;
  else if (anchorType || node.pick === 'any') eq = ` de algún ${node.deviceType}`;
  const c = node.condition || {};
  const cmp = OPERATOR_LABELS[c.op] || c.op;
  if (node.measure === 'metric') return `la ${METRIC_LABELS[node.metric] || node.metric} de ${vlabel}${eq} sea ${cmp} ${c.value}`;
  if (node.measure === 'setpoint') return `la ${vlabel}${eq} sea ${cmp} su setpoint (${(node.setpointSource && node.setpointSource.variable) || '?'})`;
  if (c.limitRef) return `la ${vlabel}${eq} sea ${cmp} ${condValueText(c, node.deviceType, node.variable, s, v && v.unit)}`;
  return `la ${vlabel}${eq} sea ${cmp} ${c.value}${unit}`;
}

function phraseOf(node, sheets, isRoot, anchorType) {
  if (!isGroup(node)) return leafPhrase(node, sheets, anchorType);
  const parts = node.children.map(ch => phraseOf(ch, sheets, false, anchorType));
  if (node.op === 'OR') {
    const joined = parts.join(', o ');
    return isRoot ? `se cumpla alguna de estas condiciones: ${joined}` : `alguna de estas (${joined})`;
  }
  const joined = parts.join('; y ');
  return isRoot ? `se cumpla todo esto: ${joined}` : `todas estas (${joined})`;
}

function outlineOf(node, sheets, depth, acc, anchorType) {
  if (isGroup(node)) {
    acc.push({ depth, group: true, text: node.op === 'OR' ? 'ALGUNA de estas se cumple:' : 'TODO esto se cumple:' });
    for (const ch of node.children) outlineOf(ch, sheets, depth + 1, acc, anchorType);
  } else {
    acc.push({ depth, group: false, text: leafPhrase(node, sheets, anchorType) });
  }
  return acc;
}

// Devuelve { mode: 'sentence'|'outline', sentence, lines }.
export function describeCross(crossExpr, sheets, sevLabel, anchorType) {
  const sev = sevLabel || 'alarma';
  const where = anchorType ? ` en cada ${anchorType}` : '';
  if (!isGroup(crossExpr) || !crossExpr.children.length) {
    return { mode: 'sentence', sentence: 'Todavía no hay condiciones cargadas.', lines: [] };
  }
  if (crossDepth(crossExpr) <= 2) {
    return {
      mode: 'sentence',
      sentence: `Se disparará una alarma de ${sev}${where} cuando ${phraseOf(crossExpr, sheets, true, anchorType)}.`,
      lines: [],
    };
  }
  return {
    mode: 'outline',
    sentence: `Se dispara una alarma de ${sev}${where} cuando:`,
    lines: outlineOf(crossExpr, sheets, 0, [], anchorType),
  };
}

function isLeaf(node) { return node && node.variable && node.condition && !node.children; }
function resolveVarLabel(deviceType, variable, sheets) {
  const sh = (sheets || []).find(s => s.deviceType === deviceType);
  const v = sh && (sh.variables || []).find(x => x.name === variable);
  return (v && v.label) || variable;
}
function leafText(node, sheets) {
  const c = node.condition || {};
  const sh = (sheets || []).find(x => x.deviceType === node.deviceType);
  const v = sh && (sh.variables || []).find(x => x.name === node.variable);
  return `${resolveVarLabel(node.deviceType, node.variable, sheets)} ${OPERATOR_LABELS[c.op] || c.op} ${condValueText(c, node.deviceType, node.variable, sheets, v && v.unit)}`;
}
function isFlatCross(crossExpr) {
  return crossExpr && Array.isArray(crossExpr.children) && crossExpr.children.length > 0 && crossExpr.children.every(isLeaf)
    && !crossExpr.children.some(isNewLeaf);   // una combinada (métrica/setpoint/alguno-todos) va al editor de grupos
}

// El editor-frase representa D, S, C y cross PLANO. El cross anidado va a avanzado.
export function isSentenceEditable(rule) {
  if (!rule) return true;
  if (rule.type === 'D' || rule.type === 'S' || rule.type === 'C') return true;
  if (rule.type === 'cross') return isFlatCross(rule.crossExpr) && !(rule.scope && rule.scope.deviceType);
  return false;
}

// ── slug + IDs ocultos ───────────────────────────────────────────────────
export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'regla';
}
export function genRuleId(pack, deviceType, label, editingIndex) {
  const base = `${deviceType}-${slugify(label)}`;
  const taken = new Set((pack.rules || []).filter((_, i) => i !== editingIndex).map(r => r.ruleId));
  let id = base, n = 2; while (taken.has(id)) { id = `${base}-${n}`; n++; } return id;
}
export function genInferenceId(pack, label, editingIndex) {
  const base = slugify(label).replace(/-/g, '_').toUpperCase().slice(0, 20) || 'REGLA';
  const taken = new Set((pack.rules || []).filter((_, i) => i !== editingIndex).map(r => r.inferenceId));
  let id = base, n = 2; while (taken.has(id)) { id = `${base}_${n}`; n++; } return id;
}

export function coerceValue(value, variableType) {
  if (variableType === 'bool') return value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0;
  if (variableType === 'categorical' || variableType === 'string') return value;
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value); return Number.isFinite(n) ? n : value;
}

// ── modelo de frase ──────────────────────────────────────────────────────
// s = {
//   conditions: [{ deviceType, variable, op, value, variableLabel, unit, variableType }],
//   join: 'AND'|'OR',                 // solo con 2+ condiciones (cross)
//   temporal: null | { durationMin, count },   // solo con 1 condición (S)
//   setpoint: null | { variable },             // solo con 1 condición (C)
//   severity, recommendation, label,
//   nested: false,                    // true = cross anidado (va a avanzado)
// }
export function emptyCondition(deviceType) {
  return { deviceType: deviceType || '', variable: '', op: 'lt', value: '', limitRef: '', variableLabel: '', unit: '', variableType: 'float' };
}
export function emptySentence(deviceType) {
  return {
    conditions: [emptyCondition(deviceType)],
    join: 'AND', temporal: null, setpoint: null,
    // M (soft sensors): M1 trend=slope · projection=projection · M2 spread · compare=ratio/divergence
    // · M3 dutyCycle/cumulative · M4 stepJump/flatline/staleness · M5 variance (baseline=preset).
    trend: null, projection: null, spread: null, compare: null,
    dutyCycle: null, cumulative: null, stepJump: null, flatline: null, staleness: null, variance: null, mPreset: false,
    severity: 'warning', recommendation: '', label: '', nested: false,
  };
}

// Tipo inferido de la frase (nunca lo elige el usuario).
export function inferType(s) {
  if ((s.conditions || []).length >= 2) return 'cross';
  if (s.trend || s.projection || s.spread || s.compare || s.dutyCycle || s.cumulative
      || s.stepJump || s.flatline || s.staleness || s.variance || s.mPreset) return 'M';
  if (s.setpoint) return 'C';
  if (s.temporal) return 'S';
  return 'D';
}

// ── frase → RuleDefinition ───────────────────────────────────────────────
export function sentenceToRule(s, pack, existing, editingIndex) {
  const type = inferType(s);
  const c0 = s.conditions[0] || emptyCondition(pack && pack.deviceType);
  const deviceType = c0.deviceType || (pack && pack.deviceType) || '';
  const rule = {
    ruleId: existing ? existing.ruleId : genRuleId(pack, deviceType, s.label, editingIndex),
    label: s.label,
    variableLabel: c0.variableLabel || (existing && existing.variableLabel) || '',
    inferenceId: existing ? existing.inferenceId : genInferenceId(pack, s.label, editingIndex),
    type,
    severity: s.severity,
    recommendation: s.recommendation || '',
    deviceType,
    variable: c0.variable,
    cooldownSec: existing && existing.cooldownSec != null ? existing.cooldownSec : 300,
    condition: null, crossExpr: null,
  };
  const unit = c0.unit || (existing && existing.unit);
  if (unit) rule.unit = unit;

  if (type === 'cross') {
    rule.crossExpr = {
      op: s.join === 'OR' ? 'OR' : 'AND',
      children: s.conditions.map(c => ({
        deviceType: c.deviceType || deviceType,
        variable: c.variable,
        condition: condFromSentence(c),
      })),
    };
  } else if (type === 'C') {
    rule.condition = { op: c0.op, value: coerceValue(c0.value, c0.variableType) };
    // DEC-REF-126 — preservar scale/register del setpoint y fallbackToD de `existing`
    // (antes fallbackToD se forzaba a true → se perdía un false legítimo).
    rule.setpointSource = {
      variable: s.setpoint.variable,
      scale: (existing && existing.setpointSource && existing.setpointSource.scale != null) ? existing.setpointSource.scale : 1,
    };
    if (existing && existing.setpointSource && existing.setpointSource.register != null) rule.setpointSource.register = existing.setpointSource.register;
    rule.fallbackToD = (existing && existing.fallbackToD != null) ? existing.fallbackToD : true;
  } else if (type === 'S') {
    rule.window = {
      durationSec: Math.round((Number(s.temporal.durationMin) || 0) * 60),
      countThreshold: Number(s.temporal.count) || 1,
      matchCondition: { op: c0.op, value: coerceValue(c0.value, c0.variableType) },
    };
  } else if (type === 'M') {
    if (s.trend) {                                   // M1 · tendencia (slope)
      const rate = Math.abs(Number(s.trend.rate) || 0);
      rule.metric = 'slope';
      rule.condition = { op: s.trend.direction === 'up' ? 'gt' : 'lt', value: s.trend.direction === 'up' ? rate : -rate };
      rule.mWindow = { durationSec: Math.round((Number(s.trend.windowMin) || 0) * 60), minSamples: 3 };
      rule.unit = (existing && existing.unit) ? existing.unit : `${c0.unit || ''}/min`.replace(/^\//, '');
    } else if (s.projection) {                       // M1 · proyección
      rule.metric = 'projection';
      rule.mParams = { target: Number(s.projection.target) };
      rule.condition = { op: 'lt', value: Number(s.projection.hoursThreshold) || 0 };
      rule.mWindow = { durationSec: Math.round((Number(s.projection.windowMin) || 0) * 60), minSamples: 3 };
      rule.unit = 'h';
    } else if (s.spread) {                           // M2 · desbalance entre equipos
      rule.metric = 'spread';
      rule.condition = { op: c0.op, value: coerceValue(c0.value, c0.variableType) };
      // deviceType + variable (c0) ya están en rule; el motor compara entre los equipos del site.
    } else if (s.dutyCycle) {                         // M3 · % de uso en ventana
      rule.metric = 'dutyCycle';
      rule.condition = { op: c0.op, value: coerceValue(c0.value, 'float') };  // umbral %
      rule.mWindow = { durationSec: Math.round((Number(s.dutyCycle.windowMin) || 0) * 60), minSamples: 2 };
      rule.unit = '%';
    } else if (s.cumulative) {                        // M3 · acumulado desde reinicio (sifoneo)
      rule.metric = 'cumulativeSince';
      rule.condition = { op: c0.op, value: coerceValue(c0.value, 'float') };  // umbral acumulado
      // sin mWindow (acumulador persistente); deviceType+variable de c0.
    } else if (s.stepJump) {                          // M4 · salto abrupto en un paso
      rule.metric = 'stepJump';
      rule.condition = { op: c0.op || 'gte', value: coerceValue(c0.value, 'float') };  // umbral del salto
      rule.mWindow = { durationSec: Math.round((Number(s.stepJump.windowMin) || 0) * 60), minSamples: 2 };
      if (c0.unit) rule.unit = c0.unit;
    } else if (s.flatline) {                          // M4 · sensor clavado (rango≈0)
      rule.metric = 'flatline';
      rule.condition = { op: 'lte', value: coerceValue(c0.value, 'float') };  // tolerancia (rango máx del valor de arriba)
      rule.mWindow = { durationSec: Math.round((Number(s.flatline.windowMin) || 0) * 60), minSamples: 3 };
      if (c0.unit) rule.unit = c0.unit;
    } else if (s.staleness) {                         // M4 · pérdida de comunicación (por tick)
      rule.metric = 'staleness';
      rule.condition = { op: 'gte', value: coerceValue(c0.value, 'float') };  // minutos de silencio (valor de arriba)
      rule.unit = 'min';
      // sin mWindow — se mide por tick (ahora − último ts de mensaje).
    } else if (s.variance) {                          // M5 · variabilidad (σ del buffer)
      rule.metric = 'variance';
      rule.condition = { op: c0.op || 'gt', value: coerceValue(c0.value, 'float') };  // umbral de dispersión
      rule.mWindow = { durationSec: Math.round((Number(s.variance.windowMin) || 0) * 60), minSamples: 3 };
      if (c0.unit) rule.unit = c0.unit;
    } else if (s.mPreset) {                           // M5/técnica · preset (baseline/accumulator/acceleration): SOLO umbral editable
      rule.metric = (existing && existing.metric) || 'baseline';
      rule.condition = { op: c0.op, value: coerceValue(c0.value, 'float') };
      if (existing && existing.mWindow) rule.mWindow = existing.mWindow;   // params técnicos preservados
      if (existing && existing.mParams) rule.mParams = existing.mParams;
      if (existing && existing.unit)    rule.unit = existing.unit;
    } else {                                         // M2 · relación/diferencia entre dos datos
      rule.metric = s.compare.kind;                  // 'ratio' | 'divergence'
      // E1 · U-11 — cada entrada conserva su equipo y campos propios si la variable no cambió.
      const exIn = (existing && existing.metric === rule.metric && Array.isArray(existing.inputs)) ? existing.inputs : [];
      const inp = (i, variable) => (exIn[i] && exIn[i].variable === variable) ? { ...exIn[i] } : { deviceType, variable };
      rule.inputs = [inp(0, c0.variable), inp(1, s.compare.variable2)];
      rule.condition = { op: s.compare.op, value: coerceValue(s.compare.value, 'float') };
      // E1 · U-11 — la unidad de la relación (ej. L/kWh) se conserva.
      rule.unit = (existing && existing.metric === rule.metric && existing.unit !== undefined) ? existing.unit
        : (s.compare.kind === 'ratio' ? '' : (c0.unit || ''));
    }
  } else { // D
    rule.condition = condFromSentence(c0);
  }
  // DEC-REF-126 — OVERLAY DE PRESERVACIÓN: la frase no representa estos campos; se
  // copian de `existing` para que guardar sin tocarlos NO mute la regla (idempotencia).
  if (existing) {
    // E1 · U-02 — enabled/disabled* incluidos: editar una regla apagada NO la reactiva.
    for (const f of ['correlationParent', 'escalateAfterMinutes', 'on_missing_ref', 'source_filter', 'reset_behavior',
                     'enabled', 'disabledBy', 'disabledAt', 'disabledReason']) {
      if (existing[f] !== undefined) rule[f] = existing[f];
    }
    // E1 · U-11 — misma métrica M: mParams (watchVariable, freshnessSec, target…) se mezclan,
    // lo que la frase define pisa; spread conserva sus inputs.
    if (type === 'M' && existing.type === 'M' && existing.metric === rule.metric) {
      // E1 · U-12 (parcial) — tendencia/proyección/sensor clavado/deja de reportar fuerzan el
      // comparador; si el guardado va en el MISMO sentido (gt↔gte, lt↔lte) se conserva el guardado.
      const fam = (op) => (['gt', 'gte'].includes(op) ? 'gt' : ['lt', 'lte'].includes(op) ? 'lt' : op);
      if (rule.condition && existing.condition && existing.condition.op && rule.condition.op !== existing.condition.op &&
          fam(rule.condition.op) === fam(existing.condition.op)) {
        rule.condition.op = existing.condition.op;
        if (existing.condition.deadband != null) rule.condition.deadband = existing.condition.deadband;
      }
      if (existing.mParams) rule.mParams = { ...existing.mParams, ...(rule.mParams || {}) };
      if (rule.inputs === undefined && existing.inputs !== undefined) rule.inputs = existing.inputs;
      if (rule.mWindow === undefined && existing.mWindow !== undefined) rule.mWindow = existing.mWindow;
    }
    if (existing.graceSec != null) rule.graceSec = existing.graceSec;
    // DEC-REF-132 — la histéresis (condition.deadband) no se edita en la frase: se
    // preserva si el comparador no cambió (antes se perdía al guardar una regla D).
    if (rule.condition && existing.condition && existing.condition.deadband != null &&
        rule.condition.op === existing.condition.op) {
      rule.condition.deadband = existing.condition.deadband;
    }
    if (existing.resolveGraceSec != null) rule.resolveGraceSec = existing.resolveGraceSec;
    // E1 — histéresis de la condición de ventana (S), mismo criterio que D.
    const exMc = existing.window && existing.window.matchCondition;
    if (rule.window && rule.window.matchCondition && exMc && exMc.deadband != null && rule.window.matchCondition.op === exMc.op) {
      rule.window.matchCondition.deadband = exMc.deadband;
    }
    // E1 — fallbackToD guardado (C lo deriva arriba; en el resto se conserva tal cual).
    if (rule.fallbackToD === undefined && existing.fallbackToD !== undefined) rule.fallbackToD = existing.fallbackToD;
    // cross: `variable` es etiqueta del primario → preservar el guardado (no el 1er leaf).
    if (type === 'cross' && existing.variable != null) rule.variable = existing.variable;
    // unit: preservar el de existing (incluso '') si la frase no derivó uno.
    if (rule.unit === undefined && existing.unit !== undefined) rule.unit = existing.unit;
    // ventanas: minSamples de existing + durationSec EXACTO si redondea al mismo minuto
    // (sin esto, 50 s → 60 s y minSamples 10 → 3 al guardar sin cambio).
    if (rule.mWindow && existing.mWindow) {
      if (existing.mWindow.minSamples != null) rule.mWindow.minSamples = existing.mWindow.minSamples;
      if (existing.mWindow.durationSec != null &&
          Math.round(existing.mWindow.durationSec / 60) === Math.round((rule.mWindow.durationSec || 0) / 60)) {
        rule.mWindow.durationSec = existing.mWindow.durationSec;
      }
    }
    if (rule.window && existing.window && existing.window.durationSec != null &&
        Math.round(existing.window.durationSec / 60) === Math.round((rule.window.durationSec || 0) / 60)) {
      rule.window.durationSec = existing.window.durationSec;
    }
  }
  return rule;
}

// ── RuleDefinition → frase (para editar) ─────────────────────────────────
export function ruleToSentence(rule) {
  const base = {
    conditions: [], join: 'AND', temporal: null, setpoint: null,
    trend: null, projection: null, spread: null, compare: null,
    dutyCycle: null, cumulative: null, stepJump: null, flatline: null, staleness: null, variance: null, mPreset: false,
    severity: rule.severity || 'warning', recommendation: rule.recommendation || '',
    label: rule.label || '', nested: false,
  };
  const leaf = (variable, op, value) => ({
    deviceType: rule.deviceType || '', variable: variable || '', op: op || 'lt',
    value: (value !== undefined ? value : ''), limitRef: '', variableLabel: rule.variableLabel || '', unit: rule.unit || '', variableType: 'float',
  });
  if (rule.type === 'cross' && isFlatCross(rule.crossExpr) && !(rule.scope && rule.scope.deviceType)) {
    base.join = rule.crossExpr.op === 'OR' ? 'OR' : 'AND';
    base.conditions = rule.crossExpr.children.map(ch => ({
      deviceType: ch.deviceType || rule.deviceType || '', variable: ch.variable,
      op: (ch.condition || {}).op || 'lt', value: (ch.condition || {}).value, limitRef: (ch.condition || {}).limitRef || '',
      // E1 · U-05 — ref y deadband de la hoja viajan con la condición (antes se perdían).
      ref: (ch.condition || {}).ref, deadband: (ch.condition || {}).deadband,
      variableLabel: '', unit: '', variableType: 'float',
    }));
  } else if (rule.type === 'cross') {
    base.nested = true;                       // anidado: la frase plana no lo cubre
    base.conditions = [leaf(rule.variable, 'lt', '')];
  } else if (rule.type === 'C') {
    base.conditions = [leaf(rule.variable, (rule.condition || {}).op, (rule.condition || {}).value)];
    base.setpoint = { variable: (rule.setpointSource && rule.setpointSource.variable) || '' };
  } else if (rule.type === 'S' && rule.window) {
    const mc = rule.window.matchCondition || {};
    base.conditions = [leaf(rule.variable, mc.op, mc.value)];
    base.temporal = { durationMin: Math.round((rule.window.durationSec || 0) / 60), count: rule.window.countThreshold || 1 };
  } else if (rule.type === 'M') {
    base.conditions = [leaf(rule.variable, 'lt', '')];
    const wMin = Math.round(((rule.mWindow && rule.mWindow.durationSec) || 0) / 60);
    if (rule.metric === 'slope') {
      const c = rule.condition || {};
      base.trend = { direction: c.op === 'gt' ? 'up' : 'down', rate: Math.abs(c.value != null ? c.value : 0), windowMin: wMin || 10 };
    } else if (rule.metric === 'projection') {
      base.projection = { target: (rule.mParams && rule.mParams.target), hoursThreshold: (rule.condition || {}).value, windowMin: wMin || 30 };
    } else if (rule.metric === 'spread') {
      const c = rule.condition || {};
      base.spread = true;
      base.conditions = [leaf(rule.variable, c.op || 'gt', c.value)];
    } else if (rule.metric === 'ratio' || rule.metric === 'divergence') {
      const inp = rule.inputs || [];
      base.conditions = [leaf((inp[0] && inp[0].variable) || rule.variable, 'lt', '')];
      base.compare = { kind: rule.metric, variable2: (inp[1] && inp[1].variable) || '', op: (rule.condition || {}).op || 'lt', value: (rule.condition || {}).value };
    } else if (rule.metric === 'dutyCycle') {
      const c = rule.condition || {};
      base.dutyCycle = { windowMin: wMin || 60 };
      base.conditions = [leaf(rule.variable, c.op || 'gt', c.value)];
    } else if (rule.metric === 'cumulativeSince') {
      const c = rule.condition || {};
      base.cumulative = true;
      base.conditions = [leaf(rule.variable, c.op || 'gt', c.value)];
    } else if (rule.metric === 'stepJump') {
      const c = rule.condition || {};
      base.stepJump = { windowMin: wMin || 10 };
      base.conditions = [leaf(rule.variable, c.op || 'gte', c.value)];
    } else if (rule.metric === 'flatline') {
      const c = rule.condition || {};
      base.flatline = { windowMin: wMin || 5 };
      base.conditions = [leaf(rule.variable, 'lte', c.value)];
    } else if (rule.metric === 'staleness') {
      const c = rule.condition || {};
      base.staleness = true;
      base.conditions = [leaf(rule.variable, 'gte', c.value)];
    } else if (rule.metric === 'variance') {
      const c = rule.condition || {};
      base.variance = { windowMin: wMin || 10 };
      base.conditions = [leaf(rule.variable, c.op || 'gt', c.value)];
    } else {
      // baseline/accumulator/acceleration → preset (umbral editable): mostramos el
      // umbral actual (condition) para que el operador lo edite; los params técnicos
      // (mWindow/mParams) los preserva sentenceToRule desde `existing`.
      const c = rule.condition || {};
      base.mPreset = true;
      base.conditions = [leaf(rule.variable, c.op || 'gt', c.value)];
    }
  } else { // D
    base.conditions = [leaf(rule.variable, (rule.condition || {}).op, (rule.condition || {}).value)];
    if (rule.condition && rule.condition.limitRef) base.conditions[0].limitRef = rule.condition.limitRef;
  }
  if (!base.conditions.length) base.conditions = [leaf('', 'lt', '')];
  return base;
}
