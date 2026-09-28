// Tipo M — soft sensors / reglas predictivas (spec_motor_m.md · Ola M1).
// Calcula una MÉTRICA DERIVADA sobre la serie reciente (buffer en `mState`) y la
// compara contra `rule.condition` — reusa la primitiva de comparación de typeD
// (fuente única de comparadores, igual que hace typeS con matchCondition).
// Ola M1: slope · acceleration · projection (univariante, sobre ventana).
// Ola M4: stepJump · flatline (buffer) · staleness (silencio, por tick §8-D3).
// Devuelve { fired, metricValue, detail }.
//   metricValue: el número derivado (para la notificación: "pendiente −0,7 V/min")
//   detail: 'insufficient' | 'maturing' | 'unsupported' → no dispara ni resuelve
const { evaluateD } = require('./typeD');

// Pendiente por regresión lineal simple, en unidad/MINUTO.
function slopePerMin(buf) {
  const n = buf.length;
  if (n < 2) return 0;
  const t0 = buf[0].ts;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of buf) {
    const x = (p.ts - t0) / 60000; // minutos desde el primer punto
    const y = p.value;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function computeMetric(rule, buf) {
  switch (rule.metric) {
    case 'slope':
      return { metricValue: slopePerMin(buf) };

    case 'acceleration': {
      // Δpendiente entre 1ª y 2ª mitad de la ventana (unidad/min por ventana).
      const mid = Math.floor(buf.length / 2);
      const first = buf.slice(0, mid);
      const second = buf.slice(mid);
      if (first.length < 2 || second.length < 2) return { metricValue: null, detail: 'insufficient' };
      return { metricValue: slopePerMin(second) - slopePerMin(first) };
    }

    case 'projection': {
      // Tiempo-a-target (horas) = (target − valorActual) ÷ pendiente.
      const slope = slopePerMin(buf); // unidad/min
      const current = buf[buf.length - 1].value;
      const target = rule.mParams && rule.mParams.target;
      if (typeof target !== 'number' || slope === 0) return { metricValue: Infinity };
      const minsToTarget = (target - current) / slope;
      if (minsToTarget < 0) return { metricValue: Infinity }; // el valor se ALEJA del target
      return { metricValue: minsToTarget / 60 };
    }

    case 'stepJump': {
      // |valor − valorPrevio| en el último paso (las dos muestras más recientes):
      // salto abrupto (sifoneo) vs consumo suave.
      const n = buf.length;
      if (n < 2) return { metricValue: null, detail: 'insufficient' };
      return { metricValue: Math.abs(buf[n - 1].value - buf[n - 2].value) };
    }

    case 'flatline': {
      // Rango (máx−mín) del buffer: ≈0 durante toda la ventana = sensor clavado
      // (muerto / lectura falsa, forense). Dispara con condition.value = epsilon.
      let mn = buf[0].value, mx = buf[0].value;
      for (const p of buf) { if (p.value < mn) mn = p.value; if (p.value > mx) mx = p.value; }
      return { metricValue: mx - mn };
    }

    default:
      return { metricValue: null, detail: 'unsupported' };
  }
}

// ── M4 · staleness (silencio de comunicación) ───────────────────────────
// NO usa buffer: guarda el último ts de LLEGADA y mide (ahora − últimoTs) en min.
// Se refresca en cada mensaje entrante (→ resolve al reconectar) y además se
// evalúa por TICK periódico (§8-D3): sin mensaje no habría evaluación.
function evaluateStaleness(rule, { mState, dId, eventTs, tick }) {
  const key = `${rule.ruleId}:${dId}`;
  const now = (eventTs != null) ? eventTs : Date.now();
  const st = mState.get(key) || { lastTs: null };
  if (!tick) { st.lastTs = now; mState.set(key, st); }   // mensaje entrante → refresca
  if (st.lastTs == null) return { fired: false, metricValue: null, detail: 'insufficient' };
  const minsSilent = (now - st.lastTs) / 60000;
  return { fired: evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, minsSilent), metricValue: minsSilent };
}

// ── M2 · multivariante instantáneo (lee siteState, sin buffer) ──────────
const INSTANT_METRICS = ['ratio', 'divergence', 'spread'];

function median(vals) {
  const s = vals.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
// Valor actual de una {deviceType, variable} en el site: prioriza el device que
// disparó (mismo equipo, caso ratio/divergence), si no el primero de su tipo.
function readOne(siteState, siteCode, dId, input, fallbackDt) {
  const dt = (input && input.deviceType) || fallbackDt;
  const variable = input && input.variable;
  const self = siteState.get(dId);
  if (self && Number.isFinite(Number(self[variable]))) return Number(self[variable]);
  for (const [, st] of siteState) {
    if (st && st._siteCode === siteCode && st._deviceType === dt && Number.isFinite(Number(st[variable]))) return Number(st[variable]);
  }
  return null;
}

function evaluateInstant(rule, { siteState, dId, siteCode }) {
  if (!siteState) return { fired: false, metricValue: null, detail: 'insufficient' };
  const inputs = (rule.inputs && rule.inputs.length) ? rule.inputs : [{ deviceType: rule.deviceType, variable: rule.variable }];

  if (rule.metric === 'spread') {
    // A+B (firma Franco): desbalance del conjunto + equipo puntual a intervenir.
    const dt = inputs[0].deviceType || rule.deviceType;
    const variable = inputs[0].variable || rule.variable;
    const members = [];
    for (const [id, st] of siteState) {
      if (st && st._siteCode === siteCode && st._deviceType === dt) {
        const n = Number(st[variable]);
        if (Number.isFinite(n)) members.push({ dId: id, v: n });
      }
    }
    if (members.length < 2) return { fired: false, metricValue: null, detail: 'insufficient' };
    let maxM = members[0], minM = members[0];
    for (const m of members) { if (m.v > maxM.v) maxM = m; if (m.v < minM.v) minM = m; }
    const spread = maxM.v - minM.v;
    const fired = evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, spread);
    // culpable = el más alejado de la mediana del grupo (alto o bajo)
    const med = median(members.map(m => m.v));
    let outlier = members[0];
    for (const m of members) if (Math.abs(m.v - med) > Math.abs(outlier.v - med)) outlier = m;
    return { fired, metricValue: spread, outlierDId: outlier.dId };
  }

  // ratio / divergence: dos entradas (típicamente dos variables del mismo equipo)
  const a = readOne(siteState, siteCode, dId, inputs[0], rule.deviceType);
  const b = readOne(siteState, siteCode, dId, inputs[1] || inputs[0], rule.deviceType);
  if (a == null || b == null) return { fired: false, metricValue: null, detail: 'insufficient' };
  let metricValue;
  if (rule.metric === 'ratio') {
    if (b === 0) return { fired: false, metricValue: Infinity };
    metricValue = a / b;
  } else {
    metricValue = Math.abs(a - b);   // divergence
  }
  const fired = evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, metricValue);
  return { fired, metricValue };
}

// ── M3 · acumuladores en el tiempo ──────────────────────────────────────
const ACCUM_METRICS = ['accumulator', 'cumulativeSince']; // persisten en Mongo

// "activo" inferido por el motor (opción B, DEC D6): bool→true · número>0 ·
// string no-reposo (RUNNING/ON/…) vs STOPPED/OFF/IDLE/AUTO.
function isActive(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v > 0;
  if (typeof v === 'string') return !['STOPPED', 'OFF', 'IDLE', 'STOP', '0', 'FALSE', 'NO', 'AUTO', ''].includes(v.trim().toUpperCase());
  return false;
}

// dutyCycle — % del tiempo "activo" en la ventana (buffer, NO persiste: es corto).
function evaluateDutyCycle(rule, value, { mState, dId, eventTs }) {
  const w = rule.mWindow || {};
  if (!w.durationSec) return { fired: false, metricValue: null, detail: 'insufficient' };
  const key = `${rule.ruleId}:${dId}`;
  const now = (eventTs != null) ? eventTs : Date.now();
  const cutoff = now - w.durationSec * 1000;
  const st = mState.get(key) || { buf: [] };
  st.buf = (st.buf || []).filter(p => p.ts >= cutoff);
  st.buf.push({ ts: now, active: isActive(value) });
  mState.set(key, st);
  if (st.buf.length < 2) return { fired: false, metricValue: null, detail: 'insufficient' };
  let activeMs = 0, totalMs = 0;
  for (let i = 1; i < st.buf.length; i++) {
    const dt = st.buf[i].ts - st.buf[i - 1].ts;
    totalMs += dt;
    if (st.buf[i - 1].active) activeMs += dt;
  }
  const metricValue = totalMs > 0 ? (activeMs / totalMs) * 100 : 0;
  return { fired: evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, metricValue), metricValue };
}

// accumulator / cumulativeSince — acumuladores PERSISTENTES (Mongo, DEC D2).
// El estado (`{acc,lastValue,_persist,dirty}`) vive en mState; el edge lo hidrata
// al arrancar y flushea los `dirty`. cumulativeSince: acumula la caída desde el
// último salto hacia arriba (recarga auto-detectada, opción B — DEC D6).
function evaluateAccum(rule, value, { mState, dId }) {
  const key = `${rule.ruleId}:${dId}`;
  const st = mState.get(key) || { acc: 0, lastValue: null };
  st._persist = true;
  if (st.lastValue == null) {
    st.lastValue = value; st.dirty = true; mState.set(key, st);
    return { fired: false, metricValue: 0, detail: 'insufficient' };
  }
  if (rule.metric === 'cumulativeSince') {
    if (value > st.lastValue + 1) st.acc = 0;              // recarga → reinicia
    else if (value < st.lastValue) st.acc += (st.lastValue - value); // caída → acumula
  } else {                                                  // accumulator: integral de incrementos
    if (value > st.lastValue) st.acc += (value - st.lastValue);
  }
  st.lastValue = value; st.dirty = true; mState.set(key, st);
  return { fired: evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, st.acc), metricValue: st.acc };
}

function evaluateM(rule, value, ctx) {
  if (rule.metric === 'staleness') return evaluateStaleness(rule, ctx);
  if (INSTANT_METRICS.includes(rule.metric)) return evaluateInstant(rule, ctx);
  if (rule.metric === 'dutyCycle') return evaluateDutyCycle(rule, value, ctx);
  if (ACCUM_METRICS.includes(rule.metric)) return evaluateAccum(rule, value, ctx);
  const { mState, dId, eventTs } = ctx;
  const w = rule.mWindow || {};
  if (!w.durationSec || value === null || value === undefined) {
    return { fired: false, metricValue: null, detail: 'insufficient' };
  }

  // Buffer circular por regla:device, con purga deslizante (espejo de typeS).
  // Usa el timestamp del EVENTO (no el de proceso) → serie correcta y testeable.
  const key = `${rule.ruleId}:${dId}`;
  const now = (eventTs != null) ? eventTs : Date.now();
  const cutoff = now - w.durationSec * 1000;
  const buf = (mState.get(key) || []).filter(p => p.ts >= cutoff);
  buf.push({ ts: now, value });
  mState.set(key, buf);

  const minSamples = w.minSamples || 2;
  if (buf.length < minSamples) return { fired: false, metricValue: null, detail: 'insufficient' };

  const { metricValue, detail } = computeMetric(rule, buf);
  if (detail) return { fired: false, metricValue: metricValue ?? null, detail };
  // Infinity (projection que se aleja del target) = no dispara, sin ser error.
  if (metricValue === null || !Number.isFinite(metricValue)) {
    return { fired: false, metricValue };
  }
  const fired = evaluateD({ ruleId: rule.ruleId, condition: rule.condition }, metricValue);
  return { fired, metricValue };
}

module.exports = { evaluateM, slopePerMin };
