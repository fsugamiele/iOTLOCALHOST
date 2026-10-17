// spec_reglas_compuestas (DEC-REF-151) — reglas COMBINADAS: árbol Y/O de hojas que miden
// su variable por valor, respecto del setpoint o con una métrica M. Fuente única de la
// forma (la usan la API, el edge y QA). CommonJS: lo requieren el edge y el seed.

const LIMITS = { leaves: 8, metrics: 3, groupDepth: 2 };
const LEAF_METRICS = [
  'slope', 'projection', 'acceleration', 'ratio', 'divergence', 'dutyCycle',
  'cumulativeSince', 'flatline', 'staleness', 'variance', 'accumulator',
  'stepJump', 'baseline',
];
const EVENT_LEAF_METRICS = ['stepJump', 'baseline'];
const MEASURES = ['value', 'setpoint', 'metric'];

const isGroup = (n) => !!n && (n.op === 'AND' || n.op === 'OR');
const isSum = (n) => !!n && Array.isArray(n.sum);

function leavesOf(node, out = []) {
  if (isGroup(node)) { for (const c of node.children || []) leavesOf(c, out); }
  else if (node) out.push(node);
  return out;
}
const measureOf = (leaf) => (leaf && leaf.measure) || 'value';

// Una regla cross es "combinada" si declara alcance o alguna hoja usa la forma nueva.
// Las cross de antes (sin scope, sin measure/pick/leafId) siguen por el camino de siempre.
function isCombined(rule) {
  if (!rule || rule.type !== 'cross' || !rule.crossExpr) return false;
  if (rule.scope && rule.scope.deviceType) return true;
  return leavesOf(rule.crossExpr).some((l) => !isSum(l) && (l.measure || l.pick || l.leafId));
}

// Id estable de cada hoja: su leafId, o uno por orden (L1, L2…) si no tiene. Sin mutar la
// regla (el diff del reload compara las reglas: tocarlas daría ediciones fantasma).
const _ids = new WeakMap();
function leafIds(rule) {
  let m = _ids.get(rule);
  if (!m) {
    m = new Map();
    leavesOf(rule.crossExpr).forEach((l, i) => m.set(l, l.leafId || `L${i + 1}`));
    _ids.set(rule, m);
  }
  return m;
}

const hasAccumulatorLeaf = (rule) => isCombined(rule)
  && leavesOf(rule.crossExpr).some((l) => measureOf(l) === 'metric' && l.metric === 'accumulator');

function groupDepth(node) {
  if (!isGroup(node)) return 0;
  let m = 0;
  for (const c of node.children || []) m = Math.max(m, groupDepth(c));
  return 1 + m;
}

// Validación de la forma combinada (además de validateCrossTree). validateM se inyecta
// para no crear un require circular con ruleValidation.js.
function validateCombined(rule, validateM) {
  const leaves = leavesOf(rule.crossExpr);
  if (rule.scope != null) {
    if (typeof rule.scope !== 'object' || !rule.scope.deviceType || typeof rule.scope.deviceType !== 'string') {
      return { ok: false, reason: 'regla combinada: scope.deviceType debe ser un tipo de equipo' };
    }
  }
  if (leaves.length > LIMITS.leaves) return { ok: false, reason: `regla combinada: hasta ${LIMITS.leaves} condiciones (tiene ${leaves.length})` };
  if (groupDepth(rule.crossExpr) > LIMITS.groupDepth) return { ok: false, reason: `regla combinada: hasta ${LIMITS.groupDepth} niveles de grupo` };
  const ids = new Set();
  let metrics = 0;
  for (const l of leaves) {
    if (isSum(l)) continue;
    const name = `condición ${l.leafId || `${l.deviceType}/${l.variable}`}`;
    if (l.leafId != null) {
      if (typeof l.leafId !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(l.leafId)) return { ok: false, reason: `${name}: leafId inválido` };
      if (ids.has(l.leafId)) return { ok: false, reason: `regla combinada: leafId repetido '${l.leafId}'` };
      ids.add(l.leafId);
    }
    const m = measureOf(l);
    if (!MEASURES.includes(m)) return { ok: false, reason: `${name}: forma de medir inválida '${m}' (value/setpoint/metric)` };
    if (l.pick != null && !(l.pick === 'any' || l.pick === 'all' || (typeof l.pick === 'string' && l.pick.length > 0))) {
      return { ok: false, reason: `${name}: pick debe ser 'any', 'all' o un equipo` };
    }
    if (l.freshnessSec != null && !(Number(l.freshnessSec) > 0)) return { ok: false, reason: `${name}: freshnessSec debe ser > 0` };
    if (m === 'setpoint') {
      if (!l.setpointSource || !l.setpointSource.variable) return { ok: false, reason: `${name}: "respecto del setpoint" necesita setpointSource.variable` };
    }
    if (m === 'metric') {
      metrics++;
      if (l.metric === 'spread') return { ok: false, reason: `${name}: el desbalance entre equipos no se combina (queda como regla simple)` };
      if (!LEAF_METRICS.includes(l.metric)) return { ok: false, reason: `${name}: métrica inválida '${l.metric}'` };
      const v = validateM({ ...l, type: 'M' });
      if (!v.ok) return { ok: false, reason: `${name}: ${v.reason.replace(/^typeM: /, '')}` };
      if (l.metric === 'flatline' && !(l.mWindow && Number(l.mWindow.durationSec) >= 900)) {
        return { ok: false, reason: `${name}: "sensor clavado" necesita una ventana de al menos 15 min (un sensor clavado no publica cambios: solo llega el latido cada 5 min)` };
      }
      if (EVENT_LEAF_METRICS.includes(l.metric) && l.mParams && l.mParams.holdSec != null && !(Number(l.mParams.holdSec) > 0)) {
        return { ok: false, reason: `${name}: mParams.holdSec debe ser > 0` };
      }
    }
  }
  if (metrics > LIMITS.metrics) return { ok: false, reason: `regla combinada: hasta ${LIMITS.metrics} condiciones con métrica (tiene ${metrics})` };
  return { ok: true };
}

module.exports = {
  LIMITS, LEAF_METRICS, EVENT_LEAF_METRICS, MEASURES,
  isGroup, isSum, leavesOf, measureOf, isCombined, leafIds, hasAccumulatorLeaf, groupDepth, validateCombined,
};
