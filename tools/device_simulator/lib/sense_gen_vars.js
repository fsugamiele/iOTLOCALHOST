'use strict';
// spec_sim_cascada_energia §5 (firmada Franco 2026-10-20) — variables del Wanomi Sense montado
// sobre el grupo: fuente ÚNICA para el seed del simulador (template), la ficha GEN
// (tools/seed_fichas/fichas.js) y la migración de la base (tools/sync_sense_gen.js).
// Vive en lib/ porque el contenedor node monta solo esta carpeta del simulador.
// Sin límites: los umbrales los decide Franco (las reglas de anomalías van en un bloque aparte).
const SENSE_GEN_VARS = [
  { name: 'vib_rms',              label: 'Vibración del motor (RMS)',            type: 'float', unit: 'mm/s', deadband: 0.2, factoryRange: '0-30',  freq: 30 },
  { name: 'vib_firing',           label: 'Vibración a frecuencia de encendido',  type: 'float', unit: 'mm/s', deadband: 0.2, factoryRange: '0-20',  freq: 30 },
  { name: 'vib_peak_hz',          label: 'Frecuencia dominante de vibración',    type: 'float', unit: 'Hz',   deadband: 1,   factoryRange: '0-200', freq: 60 },
  { name: 'exhaust_temp_a',       label: 'Temperatura escape banco A',           type: 'float', unit: '°C',   deadband: 2,   factoryRange: '0-700', freq: 60 },
  { name: 'exhaust_temp_b',       label: 'Temperatura escape banco B',           type: 'float', unit: '°C',   deadband: 2,   factoryRange: '0-700', freq: 60 },
  { name: 'air_filter_dp',        label: 'Restricción del filtro de aire (ΔP)',  type: 'float', unit: 'kPa',  deadband: 0.1, factoryRange: '0-10',  freq: 60 },
  { name: 'fuel_supply_pressure', label: 'Presión de alimentación de combustible', type: 'float', unit: 'bar', deadband: 0.1, factoryRange: '0-10', freq: 30 },
  { name: 'fuel_return_rate',     label: 'Caudal de retorno de combustible',     type: 'float', unit: 'L/h',  deadband: 0.2, factoryRange: '0-20',  freq: 30 },
  { name: 'water_in_fuel',        label: 'Agua en combustible',                  type: 'bool',  unit: '',     deadband: null, factoryRange: null,   freq: 30 },
];
// Widget de template (mismo formato que tools/device_simulator/seed.js).
const SENSE_GEN_WIDGETS = SENSE_GEN_VARS.map((v) => {
  const w = { variable: v.name, variableFullName: v.unit ? `${v.label} (${v.unit})` : v.label, variableType: v.type, variableSendFreq: v.freq };
  if (v.unit) w.unit = v.unit;
  if (v.deadband != null) w.deadband = v.deadband;
  if (v.type === 'float') { w.widget = 'numeric'; w.render = 'gauge'; }
  return w;
});
// Variable de ficha (mismo formato que V() de tools/seed_fichas/fichas.js).
const SENSE_GEN_SHEET_VARS = SENSE_GEN_VARS.map((v) => {
  const x = { name: v.name, label: v.label, type: v.type };
  if (v.unit) x.unit = v.unit;
  if (v.deadband != null) x.deadband = v.deadband;
  if (v.factoryRange) x.factoryRange = v.factoryRange;
  x.limits = [];
  return x;
});
module.exports = { SENSE_GEN_VARS, SENSE_GEN_WIDGETS, SENSE_GEN_SHEET_VARS };
