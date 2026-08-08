'use strict';
// Manifiesto de siembra F3 · DEC-REF-87 · 11 reglas en 3 packs.
//
// - ats-inteliats-v1  → NUEVO (5 reglas, deviceType ATS)
// - eltek-smartpack-v1 → NUEVO (4 reglas, deviceType ELTEK)
// - cummins-pcc-v1    → +2 (cat-CR00061-C1 refrigerante + cat-CR00061-D4 arranques)
//   Las 5 productivas del pack se preservan literalmente (leídas por GET al
//   momento del PUT). El manifiesto solo declara las 2 nuevas para agregar.
//
// Textos de recommendation: DEC-REF-80 para F1/F2/F4/C1/D4; nuevos para
// eltek-A/B (redactados: qué pasó + qué hacer, sin jerga).
//
// Cita normativa (198-242V, 49,5-50,5Hz) NO se atribuye: pendiente Área 1
// (DEC-REF-87 v, DEC-REF-80 v).

// Convenciones del schema (app/api/models/rule_definition.js):
//   type: 'D' | 'C' | 'S' | 'cross'
//   condition: {op, value} — para D siempre; para C es el fallback si
//     fallbackToD:true y no hay setpoint calibrado.
//   crossExpr: árbol para type 'cross' (AND/OR/hoja equipo/hoja sum).
//   fallbackToD: Boolean; true = usa condition cuando falta setpoint.
//   on_missing_ref: 'ignore' | 'alarm'

const ATS_INTELIATS_V1 = {
  packId:      'ats-inteliats-v1',
  deviceType:  'ATS',
  version:     1,
  description: 'Salud del ATS (subtensión, sobretensión, sub/sobrefrecuencia, grupo corriendo sin generar) — CR00061 seed · DEC-REF-87',
  canary:      false,
  rules: [
    {
      ruleId:            'cat-CR00061-F1a',
      label:             'Subtensión de red',
      variableLabel:     'Tensión red (V)',
      unit:              'V',
      inferenceId:       'F1a',
      type:              'cross',
      severity:          'warning',
      recommendation:    'Tensión de red por debajo de 198 V. Riesgo de daño a motores. Verificar suministro comercial.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ATS',
      variable:          'mains_voltage',
      crossExpr: {
        op: 'AND',
        children: [
          { deviceType: 'ATS', variable: 'mains_voltage', condition: { op: 'gt', value: 50  } },
          { deviceType: 'ATS', variable: 'mains_voltage', condition: { op: 'lt', value: 198 } }
        ]
      },
      graceSec:          0,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-CR00061-F1b',
      label:             'Sobretensión de red',
      variableLabel:     'Tensión red (V)',
      unit:              'V',
      inferenceId:       'F1b',
      type:              'D',
      severity:          'warning',
      recommendation:    'Tensión de red por encima de 242 V. Riesgo de daño a electrónica. Verificar suministro comercial y protecciones.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ATS',
      variable:          'mains_voltage',
      condition:         { op: 'gt', value: 242 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-CR00061-F2a',
      label:             'Subfrecuencia de red',
      variableLabel:     'Frecuencia red (Hz)',
      unit:              'Hz',
      inferenceId:       'F2a',
      type:              'D',
      severity:          'warning',
      recommendation:    'Frecuencia de red por debajo de 49,5 Hz. Verificar suministro comercial.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ATS',
      variable:          'mains_freq',
      condition:         { op: 'lt', value: 49.5 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-CR00061-F2b',
      label:             'Sobrefrecuencia de red',
      variableLabel:     'Frecuencia red (Hz)',
      unit:              'Hz',
      inferenceId:       'F2b',
      type:              'D',
      severity:          'warning',
      recommendation:    'Frecuencia de red por encima de 50,5 Hz. Verificar suministro comercial.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ATS',
      variable:          'mains_freq',
      condition:         { op: 'gt', value: 50.5 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-CR00061-F4',
      label:             'Grupo corriendo sin generar tensión',
      variableLabel:     'gen_status ∧ gen_voltage',
      unit:              '',
      inferenceId:       'F4',
      type:              'cross',
      severity:          'critical',
      recommendation:    'Grupo corriendo sin generar tensión. Verificar excitación del alternador o breaker del grupo.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ATS',
      variable:          'n/a',
      crossExpr: {
        op: 'AND',
        children: [
          { deviceType: 'ATS', variable: 'gen_status',  condition: { op: 'eq', value: 'RUNNING' } },
          { deviceType: 'ATS', variable: 'gen_voltage', condition: { op: 'lt', value: 100       } }
        ]
      },
      graceSec:          30,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
  ],
};

const ELTEK_SMARTPACK_V1 = {
  packId:      'eltek-smartpack-v1',
  deviceType:  'ELTEK',
  version:     1,
  description: 'Salud del sistema DC Eltek Smartpack (bus DC, corriente de carga) — CR00061 seed · DEC-REF-87',
  canary:      false,
  rules: [
    {
      ruleId:            'cat-eltek-A1',
      label:             'Tensión de bus DC baja',
      variableLabel:     'Tensión bus DC',
      unit:              'V',
      inferenceId:       'A1',
      type:              'D',
      severity:          'warning',
      recommendation:    'Tensión del bus DC por debajo de 52 V. Sistema en descarga o carga insuficiente. Verificar rectificadores y estado de baterías.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ELTEK',
      variable:          'dc_bus_voltage',
      condition:         { op: 'lt', value: 52 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-eltek-A2',
      label:             'Tensión de bus DC crítica',
      variableLabel:     'Tensión bus DC',
      unit:              'V',
      inferenceId:       'A2',
      type:              'D',
      severity:          'critical',
      recommendation:    'Tensión del bus DC crítica (<48 V). Descarga profunda del banco. Contactar mantenimiento urgente para evitar daño a baterías y corte de sitio.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ELTEK',
      variable:          'dc_bus_voltage',
      condition:         { op: 'lt', value: 48 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-eltek-B1',
      label:             'Corriente de carga DC alta',
      variableLabel:     'Corriente carga DC',
      unit:              'A',
      inferenceId:       'B1',
      type:              'D',
      severity:          'warning',
      recommendation:    'Corriente de carga DC elevada (>80 A). Verificar cantidad de equipos consumidores conectados.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ELTEK',
      variable:          'dc_load_current',
      condition:         { op: 'gt', value: 80 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
    {
      ruleId:            'cat-eltek-B2',
      label:             'Corriente de carga DC crítica',
      variableLabel:     'Corriente carga DC',
      unit:              'A',
      inferenceId:       'B2',
      type:              'D',
      severity:          'critical',
      recommendation:    'Corriente de carga DC crítica (>95 A). Riesgo de sobrecarga del sistema. Reducir consumo o coordinar con red DC.',
      correlationParent: null,
      cooldownSec:       300,
      deviceType:        'ELTEK',
      variable:          'dc_load_current',
      condition:         { op: 'gt', value: 95 },
      fallbackToD:       true,
      on_missing_ref:    'ignore',
      reset_behavior:    'auto',
    },
  ],
};

// Sólo las 2 nuevas para agregar al pack cummins-pcc-v1 existente.
// El loader lee las 5 productivas via GET y las combina antes del PUT.
const CUMMINS_PCC_V1_APPEND = [
  {
    ruleId:            'cat-CR00061-C1',
    label:             'Temperatura de refrigerante alta',
    variableLabel:     'Temperatura de refrigerante',
    unit:              '°C',
    inferenceId:       'C1',
    type:              'C',
    severity:          'warning',
    recommendation:    'Temperatura de refrigerante fuera de rango. Verificar radiador, ventilador y nivel. Reducir carga inmediatamente. Detener el motor si no baja en 5 min.',
    correlationParent: null,
    cooldownSec:       300,
    deviceType:        'cummins-pcc',
    variable:          'coolant_temp',
    condition:         { op: 'gt', value: 100 }, // fallback absoluto — DEC-REF-87 (100, no 95: régimen 75-95 °C)
    fallbackToD:       true,
    setpointSource:    { variable: 'coolant_temp_setpoint', scale: 1 },
    on_missing_ref:    'ignore',
    reset_behavior:    'auto',
  },
  {
    ruleId:            'cat-CR00061-D4',
    label:             'Arranques fallidos consecutivos',
    variableLabel:     'Intentos de arranque fallidos',
    unit:              '',
    inferenceId:       'D4',
    type:              'D',
    severity:          'critical',
    recommendation:    '3 intentos de arranque fallidos consecutivos. Motor no arranca. Verificar batería, combustible y sistema de arranque.',
    correlationParent: null,
    cooldownSec:       300,
    deviceType:        'GEN', // variable vive en template WN-SITE-GEN v2 (device GEN), NO Cummins
    variable:          'crank_attempts_failed',
    condition:         { op: 'gte', value: 3 },
    fallbackToD:       true,
    on_missing_ref:    'ignore',
    reset_behavior:    'auto',
  },
];

module.exports = { ATS_INTELIATS_V1, ELTEK_SMARTPACK_V1, CUMMINS_PCC_V1_APPEND };
