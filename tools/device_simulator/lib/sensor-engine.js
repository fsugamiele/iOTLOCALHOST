'use strict';

// Estado inicial y escenarios pre-grabados para WN-SITE-SEC y WN-SITE-GEN.
// Convención de booleanos: 0 = estado normal/seguro, 1 = evento/alarma.
// EXCEPCIONES (lógica invertida):
//   - ground_loop: 1 = loop intacto (normal), 0 = cortado (alarma)
//   - battery_tag: 1 = tag presente (normal), 0 = ausente (alarma)

// SEC: 7 variables de seguridad (sin sensores de combustible/energía)
function initialSecState() {
  return {
    door_main:    0,  // puerta principal del shelter
    door_cabinet: 0,  // gabinete eléctrico interno
    pir_motion:   0,  // sensor PIR de movimiento
    ground_loop:  1,  // 1 = loop de tierra intacto (normal)
    fence_vib:    0,  // vibración del cerco perimetral
    tower_vib:    0,  // vibración de la torre
    battery_tag:  1,  // 1 = tag BLE de batería VRLA presente (normal)
  };
}

// GEN: 8 variables de generador/energía
function initialGenState() {
  return {
    fuel_level:        85.0,   // % de combustible en tanque
    genset_running:    0,      // 0 = motor apagado
    genset_temp:       42.0,   // °C - temperatura motor en reposo
    genset_vib:        0.02,   // g - vibración motor (idle)
    genset_amps:       0.0,    // A - corriente de salida
    genset_temp_alarm: 0,      // 1 = sobre-temperatura
    genset_door:       0,      // puerta caseta del genset
    mains_voltage:     220.0,  // V - tensión de red
  };
}

// Drift suave para sensores float: pequeñas variaciones aleatorias en cada tick.
// Sin escenario activo, los floats oscilan dentro de rangos seguros.
function evolve(variable, currentValue) {
  switch (variable) {
    case 'fuel_level':
      // Drift -0.01% por tick + ruido (consumo lento simulado)
      return Math.max(0, Math.min(100, currentValue - 0.01 + (Math.random() - 0.5) * 0.1));
    case 'genset_temp':
      // Oscila ±0.5°C alrededor del valor actual
      return Math.max(20, Math.min(95, currentValue + (Math.random() - 0.5) * 0.5));
    case 'mains_voltage':
      // Oscila ±1.5V alrededor del valor actual (simula red estable)
      return Math.max(210, Math.min(230, currentValue + (Math.random() - 0.5) * 1.5));
    case 'genset_vib':
      // Vibración base muy baja con micro-variaciones
      return Math.max(0, currentValue + (Math.random() - 0.5) * 0.002);
    case 'genset_amps':
      // Sin escenario, queda en 0 (motor apagado)
      return currentValue;
    default:
      // Booleanos: nunca evolucionan automáticamente, solo cambian por comandos
      return currentValue;
  }
}

// Escenarios declarativos: array de pasos { sensor, value, atMs }.
// device.js programa setTimeout por cada paso.
// atMs es relativo al inicio del escenario.
const SCENARIOS = {
  // Robo nocturno: vibración de cerco → puerta abierta → PIR → cabinet abierto
  intrusion: [
    { sensor: 'fence_vib',    value: 1, atMs:     0 },
    { sensor: 'fence_vib',    value: 0, atMs:  4000 },
    { sensor: 'door_main',    value: 1, atMs:  8000 },
    { sensor: 'pir_motion',   value: 1, atMs:  9000 },
    { sensor: 'door_cabinet', value: 1, atMs: 12000 },
    { sensor: 'tower_vib',    value: 1, atMs: 15000 },
    // Cleanup automático después de la secuencia
    { sensor: 'door_main',    value: 0, atMs: 60000 },
    { sensor: 'door_cabinet', value: 0, atMs: 60000 },
    { sensor: 'pir_motion',   value: 0, atMs: 60000 },
    { sensor: 'tower_vib',    value: 0, atMs: 60000 },
  ],

  // Sabotaje de combustible: nivel baja drásticamente sin que el motor esté encendido
  fuel_siphon: [
    { sensor: 'fuel_level', value: 85, atMs:    0 },
    { sensor: 'fuel_level', value: 72, atMs: 3000 },
    { sensor: 'fuel_level', value: 58, atMs: 6000 },
    { sensor: 'fuel_level', value: 41, atMs: 9000 },
    { sensor: 'fuel_level', value: 28, atMs: 12000 },
  ],

  // Mantenimiento legítimo: tag BLE presente (técnico autorizado), abre puertas, sale
  maintenance: [
    { sensor: 'door_main',    value: 1, atMs:      0 },
    { sensor: 'door_cabinet', value: 1, atMs:   2000 },
    { sensor: 'pir_motion',   value: 1, atMs:   3000 },
    { sensor: 'pir_motion',   value: 0, atMs:  90000 },
    { sensor: 'door_cabinet', value: 0, atMs: 120000 },
    { sensor: 'door_main',    value: 0, atMs: 125000 },
  ],

  // Falla de generador: corte de luz → motor arranca → sobre-calienta → para
  genset_failure: [
    { sensor: 'mains_voltage',     value: 0,  atMs:     0 },
    { sensor: 'genset_running',    value: 1,  atMs:  5000 },
    { sensor: 'genset_amps',       value: 45, atMs:  6000 },
    { sensor: 'genset_temp',       value: 75, atMs: 30000 },
    { sensor: 'genset_temp',       value: 92, atMs: 60000 },
    { sensor: 'genset_temp_alarm', value: 1,  atMs: 62000 },
    { sensor: 'genset_running',    value: 0,  atMs: 65000 },
    { sensor: 'genset_amps',       value: 0,  atMs: 65500 },
  ],

  // Loop de tierra cortado: alguien corta el cable de aterrizamiento
  ground_loop_cut: [
    { sensor: 'ground_loop', value: 0, atMs:      0 },
    { sensor: 'ground_loop', value: 1, atMs: 300000 },  // restaurado a 5min (mantenimiento)
  ],
};

module.exports = {
  initialSecState,
  initialGenState,
  evolve,
  SCENARIOS,
};
