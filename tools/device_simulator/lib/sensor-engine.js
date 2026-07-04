'use strict';

// ════════════════════════════════════════════════════════════════════
// sensor-engine.js — v2 alineado con pitch de Claro
//
// Estados iniciales reflejan el reposo realista de un site.
// `evolve` recibe el estado completo del device para tomar decisiones
// contextuales (ej. fuel solo se consume si motor está corriendo).
// 7 escenarios pre-grabados que cubren los casos del pitch.
// ════════════════════════════════════════════════════════════════════

function initialSecState() {
  return {
    door_shelter: 0,
    door_front: 0,
    door_rear: 0,
    door_battery_cabinet: 0,
    pir_motion: 0,
    fence_vibration: 0,
    copper_field_anomaly: 0,
    ground_continuity: 1,        // 1 = íntegra
    battery_beacons_count: 4,    // 4 baterías esperadas
    shelter_temp: 22.0,
  };
}

function initialGenState() {
  return {
    fuel_level: 75.0,
    genset_running: 0,
    exhaust_temp: 25.0,
    vibration_signature: 'normal',
    crank_current: 0.0,
    alternator_voltage: 0.0,
    battery_voltage: 12.6,
    crank_attempts_failed: 0,
    mains_voltage: 220.0,
  };
}

function initialAtsState() {
  return {
    deviceType:     'ATS',    // metadata interna — no publicada
    transfer_state: 'AUTO',
    mains_voltage:  220.0,
    mains_freq:     50.0,
    gen_voltage:    0.0,
    gen_freq:       0.0,
    load_kw:        5.0,
    gen_status:     'STOPPED',
  };
}

function initialCumminsState() {
  return {
    deviceType:      'CUMMINS',  // metadata interna — no publicada
    oil_pressure:    0.0,
    coolant_temp:    30.0,
    rpm:             0,
    run_hours:       0.0,
    battery_voltage: 12.6,
    fuel_level:      75.0,
    fault_code:      0,
    bitmap_42100:    0,
    bitmap_42101:    0,
    bitmap_42102:    0,
    bitmap_42110:    0,
  };
}

function jitter(magnitude) {
  return (Math.random() - 0.5) * 2 * magnitude;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// evolve recibe el estado completo del device y el sharedState del site
function evolve(variable, currentValue, deviceState, sharedState) {
  sharedState = sharedState || {};

  // Bool, int (counts), categorical strings: no drift en idle
  if (typeof currentValue === 'boolean') return currentValue;
  if (typeof currentValue === 'string') return currentValue;
  if (Number.isInteger(currentValue) &&
      (variable === 'battery_beacons_count' || variable === 'crank_attempts_failed' ||
       variable === 'fault_code' || variable.startsWith('bitmap_'))) {
    return currentValue;
  }

  // Floats con drift contextual
  switch (variable) {
    // ── InteliATS PWR ────────────────────────────────────────────
    case 'mains_voltage':
      if (deviceState && deviceState.deviceType === 'ATS') {
        if (currentValue < 100) return currentValue;
        return clamp(currentValue + jitter(3), 210, 230);
      }
      // legacy GEN
      if (currentValue < 100) return currentValue;
      return clamp(currentValue + jitter(2), 215, 225);

    case 'mains_freq':
      return clamp(currentValue + jitter(0.2), 49.5, 50.5);

    case 'gen_voltage': {
      const atsRunning = deviceState && deviceState.gen_status !== 'STOPPED';
      if (!atsRunning) return 0;
      return clamp(currentValue + jitter(2), 215, 225);
    }

    case 'gen_freq': {
      const atsRunning = deviceState && deviceState.gen_status !== 'STOPPED';
      if (!atsRunning) return 0;
      return clamp(currentValue + jitter(0.1), 49.8, 50.2);
    }

    case 'load_kw':
      return clamp(currentValue + jitter(0.5), 0, 15);

    // ── Cummins PowerCommand ─────────────────────────────────────
    case 'rpm': {
      const target = sharedState.gen_running ? 1500 : 0;
      if (currentValue < target) return Math.min(currentValue + 100, target);
      if (currentValue > target) return Math.max(currentValue - 100, target);
      return currentValue + (target > 0 ? Math.round(jitter(10)) : 0);
    }

    case 'oil_pressure':
      if (!sharedState.gen_running) return 0;
      return clamp(currentValue + jitter(1), 35, 55);

    case 'coolant_temp':
      if (sharedState.gen_running) {
        return clamp(currentValue + jitter(1), 75, 95);
      }
      return clamp(currentValue - 1, 30, currentValue);

    case 'run_hours':
      // incremento por tick asume variableSendFreq 60s → 1/60 hr por tick
      return sharedState.gen_running ? currentValue + (1 / 60) : currentValue;

    case 'fuel_level': {
      if (deviceState && deviceState.deviceType === 'CUMMINS') {
        const consuming = sharedState.gen_running || false;
        return clamp(currentValue - (consuming ? 0.1 : 0) + jitter(0.02), 0, 100);
      }
      // legacy GEN
      const consumption = deviceState && deviceState.genset_running ? 0.05 : 0;
      return clamp(currentValue - consumption + jitter(0.02), 0, 100);
    }

    case 'shelter_temp':
      return clamp(currentValue + jitter(0.3), 18, 30);

    case 'exhaust_temp': {
      if (deviceState && deviceState.genset_running) {
        // Motor corriendo: mantener ~350°C con jitter
        return clamp(currentValue + jitter(5), 320, 380);
      }
      // Motor apagado: enfría 2°C/lectura hacia ambiente
      return clamp(currentValue - 2, 25, currentValue);
    }

    case 'alternator_voltage': {
      if (deviceState && deviceState.genset_running) {
        return clamp(currentValue + jitter(0.1), 13.5, 14.2);
      }
      return 0;  // sin motor, sin tensión de alternador
    }

    case 'battery_voltage':
      return clamp(currentValue + jitter(0.05), 12.0, 13.0);

    case 'crank_current':
      return 0;  // siempre 0 fuera de eventos de arranque

    default:
      return currentValue;
  }
}

// ════════════════════════════════════════════════════════════════════
// SCENARIOS — pre-grabados
//
// Estructura:
//   description:  texto para UI
//   duration_ms:  tiempo total. Después de esto se hace cleanup (excepto noCleanup)
//   steps:        array de { at: ms, set: { var: value } }
//   noCleanup:    si true, los valores quedan donde el último step los dejó
//   isMaintenanceEvent: si true, el sistema de alarmas debe marcar como autorizado
// ════════════════════════════════════════════════════════════════════

const SCENARIOS = {

  intrusion: {
    description: 'Intrusión por cerco con robo de baterías',
    duration_ms: 60000,
    steps: [
      { at: 0,     set: { fence_vibration: 1 } },
      { at: 4000,  set: { fence_vibration: 0 } },
      { at: 8000,  set: { door_shelter: 1 } },
      { at: 9000,  set: { pir_motion: 1 } },
      { at: 12000, set: { door_battery_cabinet: 1 } },
      { at: 15000, set: { battery_beacons_count: 3 } },
      { at: 20000, set: { battery_beacons_count: 2 } },
      { at: 25000, set: { battery_beacons_count: 1 } },
    ],
  },

  copper_theft: {
    description: 'Robo de cobre en perímetro',
    duration_ms: 75000,
    steps: [
      { at: 0,     set: { copper_field_anomaly: 1 } },
      { at: 5000,  set: { ground_continuity: 0 } },
      { at: 12000, set: { fence_vibration: 1 } },
      { at: 16000, set: { fence_vibration: 0 } },
    ],
  },

  fuel_siphon: {
    description: 'Sifoneo de combustible (motor apagado)',
    duration_ms: 15000,
    noCleanup: true,
    steps: [
      { at: 0,     set: { fuel_level: 75.0 } },
      { at: 500,   set: { fuel_level: 73.0 } },
      { at: 2000,  set: { fuel_level: 68.0 } },
      { at: 4000,  set: { fuel_level: 60.0 } },
      { at: 6000,  set: { fuel_level: 50.0 } },
      { at: 8000,  set: { fuel_level: 42.0 } },
      { at: 12000, set: { fuel_level: 35.0 } },
      { at: 15000, set: { fuel_level: 30.0 } },
    ],
  },

  genset_no_start: {
    description: 'Corte de luz, generador no arranca tras 3 intentos',
    duration_ms: 45000,
    steps: [
      { at: 0,     set: { mains_voltage: 0 } },
      { at: 3000,  set: { battery_voltage: 12.4 } },
      { at: 3500,  set: { crank_current: 230 } },
      { at: 4500,  set: { crank_current: 0, crank_attempts_failed: 1 } },
      { at: 8000,  set: { crank_current: 220 } },
      { at: 9000,  set: { crank_current: 0, crank_attempts_failed: 2 } },
      { at: 13000, set: { crank_current: 180 } },
      { at: 14000, set: { crank_current: 0, crank_attempts_failed: 3 } },
    ],
  },

  genset_vibration_anomaly: {
    description: 'Falla predictiva por firma vibracional anómala',
    duration_ms: 30000,
    steps: [
      { at: 0,     set: { mains_voltage: 0 } },
      { at: 2000,  set: { crank_current: 240 } },
      { at: 3000,  set: { crank_current: 0 } },
      { at: 3500,  set: { genset_running: 1, exhaust_temp: 100 } },
      { at: 5000,  set: { vibration_signature: 'normal' } },
      { at: 10000, set: { vibration_signature: 'warning' } },
      { at: 15000, set: { vibration_signature: 'anomaly' } },
      { at: 22000, set: { vibration_signature: 'critical' } },
    ],
  },

  battery_degraded: {
    description: 'Batería de arranque degradada',
    duration_ms: 20000,
    steps: [
      { at: 0,     set: { mains_voltage: 0 } },
      { at: 3000,  set: { battery_voltage: 11.2 } },
      { at: 3500,  set: { crank_current: 150 } },
      { at: 4500,  set: { battery_voltage: 9.8 } },
      { at: 5000,  set: { crank_current: 0, crank_attempts_failed: 1 } },
      { at: 8000,  set: { battery_voltage: 11.5 } },
    ],
  },

  maintenance: {
    description: 'Mantenimiento autorizado (técnico con tag BLE)',
    duration_ms: 90000,
    isMaintenanceEvent: true,
    steps: [
      { at: 2000,  set: { door_shelter: 1 } },
      { at: 3000,  set: { door_front: 1 } },
      { at: 5000,  set: { pir_motion: 1 } },
      { at: 20000, set: { door_battery_cabinet: 1 } },
      { at: 30000, set: { battery_beacons_count: 3 } },
      { at: 60000, set: { battery_beacons_count: 4 } },
      { at: 75000, set: { door_battery_cabinet: 0 } },
      { at: 80000, set: { pir_motion: 0 } },
      { at: 85000, set: { door_front: 0, door_shelter: 0 } },
    ],
  },

  mains_failure_ats_transfer: {
    description: 'Corte de red — ATS transfiere a generador',
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0,     set: { mains_voltage: 0 } },
      { at: 2000,  set: { gen_status: 'STARTING' } },
      { at: 8000,  set: { gen_status: 'RUNNING', gen_voltage: 220.0, gen_freq: 50.0 } },
      { at: 10000, set: { transfer_state: 'AUTO' } },
    ],
  },

  mains_failure_gen_no_start: {
    description: 'Corte de red — generador NO arranca (cascada)',
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0,     set: { mains_voltage: 0 } },
    ],
  },

  mains_restore: {
    description: 'Restauración de red — ATS vuelve a red, generador se apaga',
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0,    set: { mains_voltage: 220.0, mains_freq: 50.0 } },
      { at: 5000, set: { gen_status: 'STOPPED', gen_voltage: 0, gen_freq: 0 } },
    ],
  },

};

module.exports = {
  initialSecState,
  initialGenState,
  initialAtsState,
  initialCumminsState,
  evolve,
  SCENARIOS,
};
