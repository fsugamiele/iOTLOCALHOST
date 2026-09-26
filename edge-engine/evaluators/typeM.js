// Tipo M — soft sensors / reglas predictivas (spec_motor_m.md · Ola M1).
// Calcula una MÉTRICA DERIVADA sobre la serie reciente (buffer en `mState`) y la
// compara contra `rule.condition` — reusa la primitiva de comparación de typeD
// (fuente única de comparadores, igual que hace typeS con matchCondition).
// Ola M1: slope · acceleration · projection (univariante, sobre ventana).
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

    default:
      return { metricValue: null, detail: 'unsupported' };
  }
}

function evaluateM(rule, value, { mState, dId, eventTs }) {
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
