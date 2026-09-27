// DEC-REF-114 (#83) — NÚCLEO del editor-frase de Reglas de Monitoreo.
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
    return `${varName} · soft sensor (${r.metric})`;
  }
  return varName;
}

// ── Descripción en LENGUAJE NATURAL de un cross (DEC-REF-114 · Franco #83) ──
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

function leafPhrase(node, sheets) {
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
  const eq = node.deviceType ? ` del ${node.deviceType}` : '';
  const c = node.condition || {};
  return `la ${vlabel}${eq} sea ${OPERATOR_LABELS[c.op] || c.op} ${c.value}${unit}`;
}

function phraseOf(node, sheets, isRoot) {
  if (!isGroup(node)) return leafPhrase(node, sheets);
  const parts = node.children.map(ch => phraseOf(ch, sheets, false));
  if (node.op === 'OR') {
    const joined = parts.join(', o ');
    return isRoot ? `se cumpla alguna de estas condiciones: ${joined}` : `alguna de estas (${joined})`;
  }
  const joined = parts.join('; y ');
  return isRoot ? `se cumpla todo esto: ${joined}` : `todas estas (${joined})`;
}

function outlineOf(node, sheets, depth, acc) {
  if (isGroup(node)) {
    acc.push({ depth, group: true, text: node.op === 'OR' ? 'ALGUNA de estas se cumple:' : 'TODO esto se cumple:' });
    for (const ch of node.children) outlineOf(ch, sheets, depth + 1, acc);
  } else {
    acc.push({ depth, group: false, text: leafPhrase(node, sheets) });
  }
  return acc;
}

// Devuelve { mode: 'sentence'|'outline', sentence, lines }.
export function describeCross(crossExpr, sheets, sevLabel) {
  const sev = sevLabel || 'alarma';
  if (!isGroup(crossExpr) || !crossExpr.children.length) {
    return { mode: 'sentence', sentence: 'Todavía no hay condiciones cargadas.', lines: [] };
  }
  if (crossDepth(crossExpr) <= 2) {
    return {
      mode: 'sentence',
      sentence: `Se disparará una alarma de ${sev} cuando ${phraseOf(crossExpr, sheets, true)}.`,
      lines: [],
    };
  }
  return {
    mode: 'outline',
    sentence: `Se dispara una alarma de ${sev} cuando:`,
    lines: outlineOf(crossExpr, sheets, 0, []),
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
  return `${resolveVarLabel(node.deviceType, node.variable, sheets)} ${OPERATOR_LABELS[c.op] || c.op} ${c.value}`;
}
function isFlatCross(crossExpr) {
  return crossExpr && Array.isArray(crossExpr.children) && crossExpr.children.length > 0 && crossExpr.children.every(isLeaf);
}

// El editor-frase representa D, S, C y cross PLANO. El cross anidado va a avanzado.
export function isSentenceEditable(rule) {
  if (!rule) return true;
  if (rule.type === 'D' || rule.type === 'S' || rule.type === 'C') return true;
  if (rule.type === 'cross') return isFlatCross(rule.crossExpr);
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
  return { deviceType: deviceType || '', variable: '', op: 'lt', value: '', variableLabel: '', unit: '', variableType: 'float' };
}
export function emptySentence(deviceType) {
  return {
    conditions: [emptyCondition(deviceType)],
    join: 'AND', temporal: null, setpoint: null,
    // M (soft sensors, Ola M1): trend=slope · projection=projection.
    trend: null, projection: null, mPreset: false,
    severity: 'warning', recommendation: '', label: '', nested: false,
  };
}

// Tipo inferido de la frase (nunca lo elige el usuario).
export function inferType(s) {
  if ((s.conditions || []).length >= 2) return 'cross';
  if (s.trend || s.projection) return 'M';
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
    cooldownSec: existing && existing.cooldownSec ? existing.cooldownSec : 300,
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
        condition: { op: c.op, value: coerceValue(c.value, c.variableType) },
      })),
    };
  } else if (type === 'C') {
    rule.condition = { op: c0.op, value: coerceValue(c0.value, c0.variableType) };
    rule.setpointSource = { variable: s.setpoint.variable, scale: 1 };
    rule.fallbackToD = true;
  } else if (type === 'S') {
    rule.window = {
      durationSec: Math.round((Number(s.temporal.durationMin) || 0) * 60),
      countThreshold: Number(s.temporal.count) || 1,
      matchCondition: { op: c0.op, value: coerceValue(c0.value, c0.variableType) },
    };
  } else if (type === 'M') {
    // Ola M1 — tendencia (slope) / proyección (projection).
    if (s.trend) {
      const rate = Math.abs(Number(s.trend.rate) || 0);
      rule.metric = 'slope';
      rule.condition = { op: s.trend.direction === 'up' ? 'gt' : 'lt', value: s.trend.direction === 'up' ? rate : -rate };
      rule.mWindow = { durationSec: Math.round((Number(s.trend.windowMin) || 0) * 60), minSamples: 3 };
      rule.unit = `${c0.unit || ''}/min`.replace(/^\//, '');
    } else {
      rule.metric = 'projection';
      rule.mParams = { target: Number(s.projection.target) };
      rule.condition = { op: 'lt', value: Number(s.projection.hoursThreshold) || 0 };
      rule.mWindow = { durationSec: Math.round((Number(s.projection.windowMin) || 0) * 60), minSamples: 3 };
      rule.unit = 'h';
    }
  } else { // D
    rule.condition = { op: c0.op, value: coerceValue(c0.value, c0.variableType) };
  }
  if (existing) {
    if (existing.graceSec != null) rule.graceSec = existing.graceSec;
    if (existing.resolveGraceSec != null) rule.resolveGraceSec = existing.resolveGraceSec;
  }
  return rule;
}

// ── RuleDefinition → frase (para editar) ─────────────────────────────────
export function ruleToSentence(rule) {
  const base = {
    conditions: [], join: 'AND', temporal: null, setpoint: null,
    trend: null, projection: null, mPreset: false,
    severity: rule.severity || 'warning', recommendation: rule.recommendation || '',
    label: rule.label || '', nested: false,
  };
  const leaf = (variable, op, value) => ({
    deviceType: rule.deviceType || '', variable: variable || '', op: op || 'lt',
    value: (value !== undefined ? value : ''), variableLabel: rule.variableLabel || '', unit: rule.unit || '', variableType: 'float',
  });
  if (rule.type === 'cross' && isFlatCross(rule.crossExpr)) {
    base.join = rule.crossExpr.op === 'OR' ? 'OR' : 'AND';
    base.conditions = rule.crossExpr.children.map(ch => ({
      deviceType: ch.deviceType || rule.deviceType || '', variable: ch.variable,
      op: (ch.condition || {}).op || 'lt', value: (ch.condition || {}).value, variableLabel: '', unit: '', variableType: 'float',
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
    } else {
      base.mPreset = true;   // acceleration/otras técnicas → preset (umbral editable)
    }
  } else { // D
    base.conditions = [leaf(rule.variable, (rule.condition || {}).op, (rule.condition || {}).value)];
  }
  if (!base.conditions.length) base.conditions = [leaf('', 'lt', '')];
  return base;
}
