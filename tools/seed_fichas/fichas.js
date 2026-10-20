'use strict';
// fichas.js — CATÁLOGO CANÓNICO de fichas de equipo (fuente única).
// Lo consumen: tools/seed_fichas/seed.js (instalación limpia, POST) y
// tools/sync_auditoria_p0/sync.js (base productiva existente, PUT con merge).
//
// Auditoría 2026-10-14 + decisiones de Franco (misma fecha):
//   · combustible crítico 15 % · batería de arranque 12 V · aceite Cummins en kPa
//   · ELTEK `temperature` = temperatura de BATERÍA (medida por el controlador)
//   · autonomía: alarma 48 h (warning) / 12 h (crítica); buffer 24 h de marcha
//   · factoryRange al seed (antes vivía solo en seeds/migrate_widgets_f4.js)
// Valores marcados "PROVISORIO" en `source` quedan a confirmar con datasheet o
// setpoint del equipo instalado (no se inventan: se citan y se marcan).

const L = (kind, op, value, unit, source) => ({ kind, op, value, unit, source });
const V = (name, label, type, unit, deadband, factoryRange, limits) => {
  const v = { name, label, type };
  if (unit) v.unit = unit;
  if (deadband != null) v.deadband = deadband;
  if (factoryRange) v.factoryRange = factoryRange;
  v.limits = limits || [];
  return v;
};

const RUNNING_GEN = { variable: 'genset_running', op: 'eq', value: 1 };
const SRC_GEF = 'registros_consolidado_gef.md §4 (NFPA 110)';
const SRC_FRANCO = 'decisión Franco 2026-10-14';

// Batería de arranque 12 V (parque Claro, decisión Franco). Override por equipo
// instalado: pendiente de la cascada (spec_cascada_ficha.md · refParams).
// C3 — relativos a la tensión nominal del equipo instalado (refParams.battery_nominal_v);
// sin dato cargado se asume 12 V (base). Un equipo de 24 V escala ×2.
const BATT_REL = { param: 'battery_nominal_v', base: 12 };
const BATTERY_12V = [
  { ...L('warning', 'lt', 11.8, 'V', `${SRC_FRANCO} (sistema 12 V) — pack gen-grupo-v1`), relativeTo: BATT_REL },
  { ...L('trip',    'lt', 11.0, 'V', `${SRC_FRANCO} (sistema 12 V) — pack gen-grupo-v1`), relativeTo: BATT_REL },
  { ...L('warning', 'gt', 15.0, 'V', `${SRC_GEF} b10-11 escalado a 12 V — sobretensión cargador`), relativeTo: BATT_REL },
  { ...L('trip',    'gt', 16.0, 'V', `${SRC_GEF} b10-11 escalado a 12 V — sobretensión cargador`), relativeTo: BATT_REL },
];
const FUEL = [
  L('warning', 'lt', 25, '%', `${SRC_GEF} b0`),
  L('trip',    'lt', 15, '%', SRC_FRANCO),
];
const AUTONOMY_HOURS = (src) => V('autonomy_hours', 'Autonomía estimada', 'float', 'h', 0.1, '0-80', [
  L('warning', 'lt', 48, 'h', src),
  L('trip',    'lt', 12, 'h', src),
]);
// Parámetros del estimador 'measured' (edge-engine/autonomy.js).
const AUTONOMY_ESTIMATOR = { windowHours: 24, minRunMinutes: 45, minDropPct: 2 };

const FICHAS = [
  { deviceType: 'cummins-pcc', manufacturer: 'Cummins', model: 'PowerCommand (PCC)', origin: 'third_party', domain: 'grupo', variables: [
    // kPa (decisión Franco). 2,0 / 1,0 bar = 200 / 100 kPa. Vale SOLO con motor en
    // marcha (rpm > 300) — las reglas A0/A1 lo expresan con cross AND.
    V('oil_pressure', 'Presión aceite', 'float', 'kPa', 7, '0-700', [
      L('warning', 'lt', 200, 'kPa', `${SRC_GEF} b3 (<2,0 bar) — ${SRC_FRANCO}: unidad kPa`),
      L('trip',    'lt', 100, 'kPa', `${SRC_GEF} b3 (<1,0 bar) — ${SRC_FRANCO}: unidad kPa`)]),
    V('coolant_temp', 'Temperatura refrigerante', 'float', '°C', 0.5, '30-110', [
      L('warning', 'gt', 100, '°C', 'DEC-REF-87 (100, no 95: régimen 75-95 °C)'),
      L('trip',    'gt', 105, '°C', `${SRC_GEF} b5 (HET)`)]),
    V('rpm', 'RPM motor', 'int', 'rpm', 25, '0-1800', [
      L('warning', 'gt', 1575, 'rpm', '105 % de 1500 rpm (50 Hz, 4 polos)'),
      L('trip',    'gt', 1725, 'rpm', `${SRC_GEF} b2 sobrevelocidad 115 % — GE-07`)]),
    V('run_hours', 'Horas de marcha', 'float', 'h', 0.1, '0-50000'),
    V('battery_voltage', 'Tensión batería arranque', 'float', 'V', 0.3, '10-16', BATTERY_12V),
    V('fuel_level', 'Nivel combustible', 'float', '%', 1, '0-100', FUEL),
    V('fault_code', 'Código de falla', 'int', '', null),
    V('bitmap_42100', 'Status word (42100)', 'int', '', null),
    V('bitmap_42101', 'Alarm word 1 (42101)', 'int', '', null),
    V('bitmap_42102', 'Alarm word 2 (42102)', 'int', '', null),
    V('bitmap_42110', 'Event word (42110)', 'int', '', null),
    V('coolant_temp_setpoint', 'Setpoint temp. refrigerante', 'float', '°C', 0.5),
    V('oil_pressure_setpoint', 'Setpoint presión aceite', 'float', 'kPa', 7),
    // spec_autonomy_extendido / _deteccion_sifoneo_eficiencia — caudalímetro + carga.
    V('fuel_rate', 'Caudal de combustible', 'float', 'L/h', 0.2, '0-10'),        // decisión Franco 2026-10-14 — confirmar con placa
    V('genset_power_kw', 'Potencia del grupo', 'float', 'kW', 0.3, '0-20'),      // coherente con ATS load_kw 0-20 — confirmar con placa
    AUTONOMY_HOURS(SRC_FRANCO),
  ], autonomy: { fuelVariable: 'fuel_level', tankCapacity: 250, consumptionLph: 3.46, flowVariable: 'fuel_rate', flowScale: 1,
                 runningVariable: 'rpm', runningThreshold: 300, ...AUTONOMY_ESTIMATOR } },

  { deviceType: 'ATS', manufacturer: 'ComAp', model: 'InteliATS²', origin: 'third_party', domain: 'energia', variables: [
    V('transfer_state', 'Estado de transferencia', 'categorical', '', null),
    // ±10 % de 220 V L-N = pack ats-inteliats-v1 (F1a/F1b, F2a/F2b). Trip pendiente
    // de setpoints de transferencia del InteliATS.
    V('mains_voltage', 'Tensión red (L-N)', 'float', 'V', 2, '200-240', [
      L('warning', 'lt', 198, 'V', 'pack ats-inteliats-v1 F1a (−10 % de 220 V)'),
      L('warning', 'gt', 242, 'V', 'pack ats-inteliats-v1 F1b (+10 % de 220 V)')]),
    V('mains_freq', 'Frecuencia red', 'float', 'Hz', 0.1, '48-52', [
      L('warning', 'lt', 49.5, 'Hz', 'pack ats-inteliats-v1 F2a'),
      L('warning', 'gt', 50.5, 'Hz', 'pack ats-inteliats-v1 F2b')]),
    V('gen_voltage', 'Tensión generador', 'float', 'V', 2, '200-240'),
    V('gen_freq', 'Frecuencia generador', 'float', 'Hz', 0.1, '48-52'),
    V('load_kw', 'Carga activa', 'float', 'kW', 0.5, '0-20'),
    V('gen_status', 'Estado del generador', 'categorical', '', null),
  ] },

  { deviceType: 'ELTEK', manufacturer: 'Eltek', model: 'Smartpack S', origin: 'third_party', domain: 'energia', variables: [
    // Convención NEGATIVA (DEC-REF-123): flote −54, baja −52, crítica −48, LVD −43,2.
    // "Tensión baja" = gt sobre umbral negativo. PROVISORIO hasta registro 350020.073.
    V('dc_bus_voltage', 'Tensión DC bus', 'float', 'V', 0.3, '-58--42', [
      L('warning', 'gt', -52, 'V', 'DEC-REF-123 / spec_signo_bus_dc.md (A1) — PROVISORIO'),
      L('trip',    'gt', -48, 'V', 'DEC-REF-123 / spec_signo_bus_dc.md (A2) — PROVISORIO'),
      L('trip',    'lt', -57, 'V', 'spec_signo_bus_dc.md DC-05 (sobretensión) — PROVISORIO')]),
    V('dc_load_current', 'Corriente carga', 'float', 'A', 1, '0-300'),
    // Temperatura de BATERÍA (decisión Franco). VRLA: 25 °C nominal, vida ½ cada +10 °C.
    V('temperature', 'Temperatura de batería', 'float', '°C', 0.5, '-20-60', [
      L('warning', 'gt', 35, '°C', 'auditoría 2026-10-14 F-11 — PROVISORIO: confirmar setpoint Smartpack / datasheet batería'),
      L('trip',    'gt', 45, '°C', 'auditoría 2026-10-14 F-11 — PROVISORIO: confirmar setpoint Smartpack / datasheet batería')]),
  ] },

  { deviceType: 'SEC', manufacturer: 'Wanomi', model: 'WN-SITE-SEC (Sense)', origin: 'own', domain: 'seguridad', variables: [
    V('door_shelter', 'Puerta shelter', 'bool', '', null),
    V('door_front', 'Puerta frente', 'bool', '', null),
    V('door_rear', 'Puerta trasera', 'bool', '', null),
    V('door_battery_cabinet', 'Gabinete de baterías', 'bool', '', null),
    V('pir_motion', 'Movimiento interior (PIR)', 'bool', '', null),
    V('fence_vibration', 'Vibración cerco (corte/golpe)', 'bool', '', null),
    V('copper_field_anomaly', 'Movimiento de cobre', 'bool', '', null),
    V('ground_continuity', 'Continuidad de tierra', 'bool', '', null),
    V('battery_beacons_count', 'Baterías presentes (BLE beacons)', 'int', 'u', null),
    V('shelter_temp', 'Temperatura shelter', 'float', '°C', 0.5, '0-50'),
  ] },

  { deviceType: 'GEN', manufacturer: 'Genérico', model: 'Generador genérico', origin: 'third_party', domain: 'grupo', variables: [
    V('fuel_level', 'Nivel combustible', 'float', '%', 1, '0-100', FUEL),
    V('genset_running', 'Motor en marcha', 'bool', '', null),
    V('exhaust_temp', 'Temperatura escape', 'float', '°C', 0.5, '0-700', [
      L('warning', 'gt', 550, '°C', 'decisión Franco 2026-10-14 — a confirmar con datasheet del motor'),
      L('trip',    'gt', 600, '°C', 'decisión Franco 2026-10-14 — a confirmar con datasheet del motor')]),
    V('vibration_signature', 'Firma de vibración', 'categorical', '', null),
    V('crank_current', 'Corriente de arranque', 'float', 'A', 2, '0-600'),
    // Solo con el motor EN MARCHA (`when`): parado, el borne mide la batería (~12,6 V).
    // El widget no puede evaluar `when` → no colorea; lo usan las reglas (cascada C2).
    V('alternator_voltage', 'Tensión alternador', 'float', 'V', 0.1, '12-15', [
      { ...L('warning', 'lt', 13.0, 'V', 'decisión Franco 2026-10-14 — carga baja, a confirmar con regulador'), when: RUNNING_GEN },
      { ...L('warning', 'gt', 14.8, 'V', 'decisión Franco 2026-10-14 — sobrecarga, a confirmar con regulador'), when: RUNNING_GEN }]),
    V('battery_voltage', 'Tensión arranque batería', 'float', 'V', 0.3, '10-16', BATTERY_12V),
    V('crank_attempts_failed', 'Arranques fallidos', 'int', 'u', null, '0-10', [
      L('trip', 'gte', 3, '', `${SRC_GEF} b8 — regla cat-CR00061-D4`)]),
    V('mains_voltage', 'Tensión red eléctrica', 'float', 'V', 2, '200-240', [
      L('warning', 'lt', 198, 'V', 'igual que ATS (−10 % de 220 V) — decisión Franco 2026-10-14'),
      L('warning', 'gt', 242, 'V', 'igual que ATS (+10 % de 220 V) — decisión Franco 2026-10-14')]),
    V('fuel_rate', 'Caudal de combustible', 'float', 'L/h', 0.2, '0-10'),        // decisión Franco 2026-10-14 — confirmar con placa
    V('genset_power_kw', 'Potencia del grupo', 'float', 'kW', 0.3, '0-20'),      // coherente con ATS load_kw 0-20 — confirmar con placa
    AUTONOMY_HOURS(SRC_FRANCO),
    // spec_sim_cascada_energia §5 — Wanomi Sense sobre el grupo (sin límites: los decide Franco).
    ...require('../device_simulator/lib/sense_gen_vars.js').SENSE_GEN_SHEET_VARS,
  ], autonomy: { fuelVariable: 'fuel_level', tankCapacity: 250, consumptionLph: 3.46, flowVariable: 'fuel_rate', flowScale: 1,
                 runningVariable: 'genset_running', ...AUTONOMY_ESTIMATOR } },
];

// Cadencia de publicación por variable (spec_cascada_ficha C1: nace en la ficha y
// se propaga a widgets[].variableSendFreq). Valores = los vigentes en los templates
// (tools/device_simulator/seed.js); ELTEK sin template de sim → 60 s. Aprobado por
// Franco 2026-10-14. Variables no listadas: 60 s.
const CADENCE_30S = {
  'cummins-pcc': ['rpm', 'fuel_rate', 'genset_power_kw', 'fault_code'],
  ATS: ['transfer_state', 'gen_status'],
  ELTEK: [],
  SEC: ['door_shelter', 'door_front', 'door_rear', 'door_battery_cabinet', 'pir_motion', 'fence_vibration', 'copper_field_anomaly'],
  GEN: ['fuel_rate', 'genset_power_kw', 'genset_running', 'crank_current', 'crank_attempts_failed',
        'vib_rms', 'vib_firing', 'fuel_supply_pressure', 'fuel_return_rate', 'water_in_fuel'],
};
const CADENCE_120S = { SEC: ['shelter_temp'] };
for (const f of FICHAS) {
  for (const v of f.variables) {
    v.cadence = (CADENCE_30S[f.deviceType] || []).includes(v.name) ? '30s'
      : (CADENCE_120S[f.deviceType] || []).includes(v.name) ? '120s' : '60s';
  }
}

module.exports = { FICHAS };
