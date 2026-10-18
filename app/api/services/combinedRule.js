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

// Nombre en palabras de cada métrica (los mensajes de la API los lee el operador en el editor).
const METRIC_WORDS = {
  slope: 'tendencia', projection: 'proyección', acceleration: 'cambio de la tendencia', ratio: 'relación con otra medición',
  divergence: 'diferencia con otra medición', dutyCycle: '% del tiempo en uso', cumulativeSince: 'caída acumulada',
  flatline: 'sensor clavado', staleness: 'deja de reportar', variance: 'lecturas inestables', accumulator: 'vida útil',
  stepJump: 'salto abrupto', baseline: 'fuera de lo normal', spread: 'desbalance entre equipos',
};
const NO_WINDOW = ['ratio', 'divergence', 'cumulativeSince', 'staleness', 'accumulator'];
const human = (v) => String(v || 'la medición').replace(/_/g, ' ');

// Validación de la forma combinada (además de validateCrossTree). validateM se inyecta
// para no crear un require circular con ruleValidation.js. Mensajes en palabras del operador:
// el editor los muestra tal cual (spec_reglas_compuestas · UX).
function validateCombined(rule, validateM) {
  const leaves = leavesOf(rule.crossExpr);
  if (rule.scope != null && (typeof rule.scope !== 'object' || !rule.scope.deviceType || typeof rule.scope.deviceType !== 'string')) {
    return { ok: false, reason: 'Elegí si la regla se evalúa en cada equipo o en el sitio entero.' };
  }
  if (leaves.length > LIMITS.leaves) return { ok: false, reason: `Una regla combinada admite hasta ${LIMITS.leaves} condiciones (tiene ${leaves.length}).` };
  if (groupDepth(rule.crossExpr) > LIMITS.groupDepth) return { ok: false, reason: 'Se puede agrupar condiciones un solo nivel (un grupo dentro de la regla).' };
  const ids = new Set();
  let metrics = 0;
  for (const l of leaves) {
    if (isSum(l)) continue;
    const m = measureOf(l);
    const quien = m === 'metric' ? `La condición «${METRIC_WORDS[l.metric] || 'cómo evoluciona'}» sobre ${human(l.variable)}` : `La condición sobre ${human(l.variable)}`;
    if (l.leafId != null) {
      if (typeof l.leafId !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(l.leafId) || ids.has(l.leafId)) {
        return { ok: false, reason: 'Hay condiciones repetidas: volvé a abrir la regla y guardala de nuevo.' };
      }
      ids.add(l.leafId);
    }
    if (!MEASURES.includes(m)) return { ok: false, reason: `${quien} tiene una forma de medir desconocida.` };
    const pickOk = l.pick == null || l.pick === 'any' || l.pick === 'all' || (typeof l.pick === 'string' && l.pick.length > 0)
      || (typeof l.pick === 'object' && Array.isArray(l.pick.dIds) && l.pick.dIds.length > 0 && l.pick.dIds.every((x) => typeof x === 'string' && x) && (l.pick.mode == null || ['any', 'all'].includes(l.pick.mode)));
    if (!pickOk) {
      return { ok: false, reason: `${quien}: elegí si alcanza con un equipo o tienen que ser todos.` };
    }
    if (l.freshnessSec != null && !(Number(l.freshnessSec) > 0)) return { ok: false, reason: `${quien}: el tiempo sin datos tiene que ser mayor que cero.` };
    if (m === 'setpoint' && !(l.setpointSource && l.setpointSource.variable)) return { ok: false, reason: `${quien}: elegí qué medición del equipo informa el límite.` };
    if (m !== 'metric') continue;
    metrics++;
    if (l.metric === 'spread') return { ok: false, reason: 'El desbalance entre equipos no se puede combinar con otras condiciones: creálo como regla aparte.' };
    if (!LEAF_METRICS.includes(l.metric)) return { ok: false, reason: `${quien}: esa forma de medir no está disponible.` };
    const c = l.condition || {};
    if (c.value === undefined || c.value === null || c.value === '') return { ok: false, reason: `${quien}: cargá el valor de comparación.` };
    if (!NO_WINDOW.includes(l.metric)) {
      const w = l.mWindow || {};
      if (!(Number(w.durationSec) > 0)) return { ok: false, reason: `${quien}: indicá cuántos minutos mirar.` };
      if (l.metric === 'flatline' && Number(w.durationSec) < 900) {
        return { ok: false, reason: `${quien}: hay que mirar al menos 15 minutos (un sensor clavado solo manda su lectura cada 5 minutos).` };
      }
    }
    if (l.metric === 'projection' && !(l.mParams && typeof l.mParams.target === 'number')) return { ok: false, reason: `${quien}: indicá a qué valor tiene que llegar.` };
    if ((l.metric === 'ratio' || l.metric === 'divergence') && !(Array.isArray(l.inputs) && l.inputs[1] && l.inputs[1].variable)) {
      return { ok: false, reason: `${quien}: elegí la otra medición.` };
    }
    if (EVENT_LEAF_METRICS.includes(l.metric) && l.mParams && l.mParams.holdSec != null && !(Number(l.mParams.holdSec) > 0)) {
      return { ok: false, reason: `${quien}: los segundos que cuenta como cumplida tienen que ser más que cero.` };
    }
    // Red de seguridad: las mismas reglas que una regla simple de ese tipo, con mensaje en palabras.
    const v = validateM({ ...l, type: 'M' });
    if (!v.ok) return { ok: false, reason: `${quien} está incompleta. Revisá sus datos.` };
  }
  if (metrics > LIMITS.metrics) return { ok: false, reason: `Una regla combinada admite hasta ${LIMITS.metrics} condiciones que miran cómo evoluciona la medición (tiene ${metrics}).` };
  return { ok: true };
}

// Identidad de la instancia (rulefsm.key): cross clásica y combinada SIN ancla = por sitio;
// combinada CON ancla y el resto de los tipos = por equipo.
function instanceKey(rule, ruleId, dId, siteCode) {
  const perSite = !!rule && rule.type === 'cross' && !(rule.scope && rule.scope.deviceType);
  return perSite ? `${ruleId}:${siteCode}` : `${ruleId}:${dId}`;
}

module.exports = {
  instanceKey,
  LIMITS, LEAF_METRICS, EVENT_LEAF_METRICS, MEASURES,
  isGroup, isSum, leavesOf, measureOf, isCombined, leafIds, hasAccumulatorLeaf, groupDepth, validateCombined,
};
