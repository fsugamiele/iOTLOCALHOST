// spec_deteccion_sifoneo_eficiencia (baseline sobre eficiencia) — CONSUMO ESPECÍFICO
// del grupo = fuel_rate [L/h] ÷ genset_power_kw [kW] = L/kWh. El edge lo publica como
// variable `fuel_efficiency` para que una regla M `baseline` AUTO-CALIBRE la deficiencia
// SUTIL — esa que un umbral fijo instantáneo (regla `ratio`) no distingue del ruido
// (§8 disenso de la spec). Aísla la carga: sube solo si el grupo quema más por kW.
//
// Solo computa con el grupo ENTREGANDO CARGA (power>0) y consumiendo (flow>0): un grupo
// en reposo/ralentí no tiene eficiencia definida. Debounce 1/min por equipo (la eficiencia
// es una relación estable; recalcularla en cada mensaje no aporta resolución).
//
// Anti-loop: el edge recibe su propia publicación de `fuel_efficiency`, pero el cálculo
// solo dispara con fuel_rate o genset_power_kw (≠ 'fuel_efficiency') → no se realimenta.

const EFFICIENCY_VARIABLE = 'fuel_efficiency';
const FLOW_VARIABLE = 'fuel_rate';
const POWER_VARIABLE = 'genset_power_kw';
const PUBLISH_MIN_INTERVAL_MS = 60 * 1000;

const lastPublishTs = new Map();   // dId -> ts

// maybeComputeEfficiency({ client, userId, dId, variable, deviceState, eventTs })
// Devuelve true si publicó. deviceState = siteState.get(dId) (tiene el último valor
// de cada variable del equipo, incluidos fuel_rate y genset_power_kw).
function maybeComputeEfficiency({ client, userId, dId, variable, deviceState, eventTs }) {
  if (!userId || !deviceState) return false;
  // Solo dispara con sus insumos (y nunca con su propia salida → anti-loop).
  if (variable !== FLOW_VARIABLE && variable !== POWER_VARIABLE) return false;

  const flow = Number(deviceState[FLOW_VARIABLE]);
  const power = Number(deviceState[POWER_VARIABLE]);
  if (!(power > 0) || !(flow > 0)) return false;   // sin carga/caudal → eficiencia indefinida

  const now = eventTs != null ? eventTs : Date.now();
  if (now - (lastPublishTs.get(dId) || 0) < PUBLISH_MIN_INTERVAL_MS) return false;
  lastPublishTs.set(dId, now);

  const eff = Math.round((flow / power) * 1000) / 1000;   // L/kWh
  client.publish(
    `${userId}/${dId}/${EFFICIENCY_VARIABLE}/sdata`,
    JSON.stringify({ value: eff, save: 1 }),
    { qos: 0 },
    (err) => { if (err) console.error(`[efficiency] Publish FALLÓ (${dId} ${eff}): ${err.message}`); }
  );
  return true;
}

// Se invoca en el reload SF-3 (igual que resetAutonomyRuntime): el debounce queda obsoleto.
function resetEfficiencyRuntime() {
  lastPublishTs.clear();
}

module.exports = { maybeComputeEfficiency, resetEfficiencyRuntime, EFFICIENCY_VARIABLE };
