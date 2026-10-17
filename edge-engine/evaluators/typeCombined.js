// edge-engine/evaluators/typeCombined.js
// spec_reglas_compuestas (DEC-REF-151) — evaluador de reglas COMBINADAS.
//
// Árbol Y/O de hojas. Cada hoja mide su variable por VALOR, RESPECTO DEL SETPOINT o con
// una MÉTRICA M (se reusa evaluateM con una regla sintética por hoja: `ruleId#leafId`).
// Resultado de hoja y de árbol en CUATRO estados (Qh3):
//   'si' · 'no' · 'jun' (juntando muestras: no decide) · 'sin' (falta el dato: E5).
//   Y : no > sin > jun > si      O : si > sin > jun > no
//
// Dos fases por mensaje (para no alimentar dos veces una hoja con varias instancias):
//   feed()     — alimenta las hojas MÉTRICA del equipo que publicó (o todas, en el tick
//                para "deja de reportar") y guarda su último resultado en mState.
//   evaluate() — arma el árbol para una instancia leyendo valores vivos y esos resultados.

const { evaluateD, resolveClears, effectiveCondition } = require('./typeD');
const { evaluateC } = require('./typeC');
const { evaluateM } = require('./typeM');
const { evaluateCrossTree } = require('./typeCross');
const { isGroup, isSum, leavesOf, measureOf, leafIds, EVENT_LEAF_METRICS } = require('../../app/api/services/combinedRule');

const DEFAULT_FRESH_SEC = 600;   // 2 latidos del equipo (300 s): un valor más viejo = falta el dato
const DEFAULT_HOLD_SEC = 120;    // Qh4 — un evento (salto, fuera de lo normal) vale 120 s en el árbol

const ORDER_AND = ['no', 'sin', 'jun', 'si'];
const ORDER_OR = ['si', 'sin', 'jun', 'no'];
function combine(op, states) {
  if (!states.length) return 'sin';
  const order = op === 'OR' ? ORDER_OR : ORDER_AND;
  for (const s of order) if (states.includes(s)) return s;
  return 'sin';
}

const anchorType = (rule) => (rule.scope && rule.scope.deviceType) || null;
const freshMs = (leaf) => (Number(leaf.freshnessSec) > 0 ? Number(leaf.freshnessSec) : DEFAULT_FRESH_SEC) * 1000;
const holdMs = (leaf) => (leaf.mParams && Number(leaf.mParams.holdSec) > 0 ? Number(leaf.mParams.holdSec) : DEFAULT_HOLD_SEC) * 1000;

function devicesOfType(siteState, deviceType, siteCode) {
  const out = [];
  for (const [id, st] of siteState) if (st && st._deviceType === deviceType && st._siteCode === siteCode) out.push(id);
  return out;
}

// Qh2 — a qué equipos mira la hoja: el ancla (si es de su tipo), un equipo puntual, o todos
// los de su tipo en el sitio (que luego se combinan con 'any'/'all').
function leafDevices(rule, leaf, siteState, siteCode, anchorDId) {
  if (anchorType(rule) && leaf.deviceType === anchorType(rule)) return anchorDId ? [anchorDId] : [];
  if (leaf.pick && leaf.pick !== 'any' && leaf.pick !== 'all') {
    const st = siteState.get(leaf.pick);
    return st && st._siteCode === siteCode && st._deviceType === leaf.deviceType ? [leaf.pick] : [];
  }
  return devicesOfType(siteState, leaf.deviceType, siteCode);
}

function leafKey(rule, leaf) { return `${rule.ruleId}#${leafIds(rule).get(leaf)}`; }

function syntheticM(rule, leaf) {
  return {
    ruleId: leafKey(rule, leaf), type: 'M', metric: leaf.metric, mWindow: leaf.mWindow, mParams: leaf.mParams,
    inputs: leaf.inputs, condition: leaf.condition, deviceType: leaf.deviceType, variable: leaf.variable,
  };
}

function isFresh(st, variable, eventTs, ms) {
  if (eventTs == null) return true;
  const lu = st && st._lastUpdate && st._lastUpdate[variable];
  return !!lu && eventTs - lu <= ms;
}

// ── hoja VALOR (D) ──────────────────────────────────────────────────────────
function valueLeaf(rule, leaf, dId, ctx) {
  const { siteState, siteCode, mState, eventTs } = ctx;
  const st = siteState.get(dId);
  const v = st ? st[leaf.variable] : undefined;
  if (v === undefined || v === null || !isFresh(st, leaf.variable, eventTs, freshMs(leaf))) return { state: 'sin', value: null, threshold: null };
  let cond = effectiveCondition(leaf.condition, st);
  if (cond && cond.ref) {
    const refId = cond.ref.deviceType === leaf.deviceType ? dId : devicesOfType(siteState, cond.ref.deviceType, siteCode)[0];
    const raw = refId ? Number((siteState.get(refId) || {})[cond.ref.variable]) : NaN;
    if (!(Number.isFinite(raw) && raw > 0)) return { state: 'sin', value: v, threshold: null };
    cond = { op: cond.op, value: raw * (cond.ref.scale != null ? Number(cond.ref.scale) : 1), deadband: cond.deadband };
  }
  const r = evaluateD({ ruleId: leafKey(rule, leaf), condition: cond }, v);
  if (r === null) return { state: 'sin', value: v, threshold: cond ? cond.value : null };
  // Histéresis de la hoja: dentro de la banda sigue "sí" si venía "sí" (DEC-REF-132).
  const bk = `${leafKey(rule, leaf)}:band:${dId}`;
  let state = r ? 'si' : 'no';
  if (!r && mState && mState.get(bk) === 'si' && !resolveClears({ condition: cond }, v)) state = 'si';
  if (mState) mState.set(bk, state);
  return { state, value: v, threshold: cond ? cond.value : null };
}

// ── hoja RESPECTO DEL SETPOINT (C) ──────────────────────────────────────────
function setpointLeaf(rule, leaf, dId, ctx) {
  const { siteState, eventTs } = ctx;
  const st = siteState.get(dId);
  const v = st ? st[leaf.variable] : undefined;
  if (v === undefined || v === null || !isFresh(st, leaf.variable, eventTs, freshMs(leaf))) return { state: 'sin', value: null, threshold: null };
  const res = evaluateC({
    ruleId: leafKey(rule, leaf), condition: leaf.condition, setpointSource: leaf.setpointSource,
    fallbackToD: leaf.fallbackToD !== false, on_missing_ref: leaf.on_missing_ref || 'ignore',
  }, v, st);
  if (res.mode === 'no-ref' && !res.fired) return { state: 'sin', value: v, threshold: null };
  return { state: res.fired ? 'si' : 'no', value: v, threshold: res.thresholdUsed, mode: res.mode };
}

// ── hoja MÉTRICA (M): alimentación y lectura ────────────────────────────────
const resKey = (rule, leaf, dId) => `${leafKey(rule, leaf)}:res:${dId}`;

function metricFeeds(leaf, msg) {
  if (leaf.metric === 'staleness') return true;                     // se mide por reloj
  if (!msg || !msg.variable) return false;
  if (msg.variable === leaf.variable) return true;
  return Array.isArray(leaf.inputs) && leaf.inputs.some((i) => i && i.variable === msg.variable);
}

function feedMetricLeaf(rule, leaf, dId, ctx) {
  const { siteState, siteCode, mState, eventTs, msg } = ctx;
  const st = siteState.get(dId) || {};
  const value = msg && msg.dId === dId && msg.variable === leaf.variable ? msg.value : st[leaf.variable];
  const res = evaluateM(syntheticM(rule, leaf), value, { mState, dId, eventTs, siteState, siteCode, tick: !msg });
  const prev = mState.get(resKey(rule, leaf, dId)) || {};
  const state = res.detail === 'stale' ? 'sin' : res.detail ? 'jun' : (res.fired ? 'si' : 'no');
  const c = { state, value: res.metricValue ?? null, ts: eventTs, latch: prev.latch || null };
  if (EVENT_LEAF_METRICS.includes(leaf.metric) && state === 'si') c.latch = eventTs + holdMs(leaf);
  mState.set(resKey(rule, leaf, dId), c);
}

function metricLeaf(rule, leaf, dId, ctx) {
  const c = ctx.mState.get(resKey(rule, leaf, dId));
  const threshold = leaf.condition ? leaf.condition.value : null;
  if (!c) return { state: 'jun', value: null, threshold };
  const now = ctx.eventTs;
  if (EVENT_LEAF_METRICS.includes(leaf.metric)) {
    if (c.latch && now < c.latch) return { state: 'si', value: c.value, threshold };
    if (c.state === 'si') return { state: 'no', value: c.value, threshold };   // el evento ya pasó
  }
  if (leaf.metric !== 'staleness' && now != null && c.ts != null && now - c.ts > freshMs(leaf)) return { state: 'sin', value: c.value, threshold };
  return { state: c.state, value: c.value, threshold };
}

// Fase 1 — alimenta las hojas métrica con el mensaje (o en el tick, msg = null).
function feed(rule, ctx) {
  const { siteState, siteCode, msg } = ctx;
  for (const leaf of leavesOf(rule.crossExpr)) {
    if (isSum(leaf) || measureOf(leaf) !== 'metric' || !metricFeeds(leaf, msg)) continue;
    let ids;
    if (leaf.metric === 'staleness' && !msg) ids = devicesOfType(siteState, leaf.deviceType, siteCode);
    else if (msg && msg.dId) {
      const st = siteState.get(msg.dId);
      ids = st && st._deviceType === leaf.deviceType && st._siteCode === siteCode
        && (!leaf.pick || leaf.pick === 'any' || leaf.pick === 'all' || leaf.pick === msg.dId) ? [msg.dId] : [];
    } else ids = [];
    for (const id of ids) feedMetricLeaf(rule, leaf, id, ctx);
  }
}

// Fase 2 — el árbol para una instancia (anchorDId = equipo ancla, o null = sitio).
function evaluate(rule, ctx, anchorDId) {
  const snap = [];
  const ids = leafIds(rule);
  const walk = (node) => {
    if (isGroup(node)) return combine(node.op, (node.children || []).map(walk));
    if (isSum(node)) {
      const r = evaluateCrossTree({ ruleId: rule.ruleId, crossExpr: node }, ctx.siteState, ctx.eventTs, ctx.siteCode);
      const state = r.val === null ? 'sin' : (r.val ? 'si' : 'no');
      snap.push({ leafId: ids.get(node) || 'sum', measure: 'sum', state, value: r.total ?? null, threshold: node.condition ? node.condition.value : null });
      return state;
    }
    const m = measureOf(node);
    const devs = leafDevices(rule, node, ctx.siteState, ctx.siteCode, anchorDId);
    const per = devs.map((d) => ({ dId: d, ...(m === 'metric' ? metricLeaf(rule, node, d, ctx) : m === 'setpoint' ? setpointLeaf(rule, node, d, ctx) : valueLeaf(rule, node, d, ctx)) }));
    const op = node.pick === 'all' ? 'AND' : 'OR';
    const state = combine(op, per.map((p) => p.state));
    // Representante para la foto: el equipo que decidió (el primero con ese estado).
    const rep = per.find((p) => p.state === state) || per[0] || { dId: null, value: null, threshold: null };
    snap.push({
      leafId: ids.get(node), deviceType: node.deviceType, variable: node.variable, measure: m,
      metric: m === 'metric' ? node.metric : undefined, pick: node.pick || undefined,
      dId: rep.dId, state, value: rep.value ?? null, threshold: rep.threshold ?? null,
    });
    return state;
  };
  const state = walk(rule.crossExpr);
  return { state, leaves: snap };
}

module.exports = { feed, evaluate, combine, leafDevices, devicesOfType, anchorType, DEFAULT_FRESH_SEC, DEFAULT_HOLD_SEC };
