'use strict';

const { FIELD_DATA } = require('./field_data.js');

// ════════════════════════════════════════════════════════════════════
// Consumo real de combustible del Cummins de CR00061 — DEC-REF-79 (ii).
// 3,46 L/h derivado de EVIDENCIA DE CAMPO: CR00070 Ituzaingó consumió
// 1.410 L en 17 días 24/7 tras perder suministro comercial. Tanque de
// 250 L rectangular (DEC-REF-79 i) ⇒ lectura lineal por geometría.
// variableSendFreq del fuel_level = 60 s (seed.js:96) ⇒ 1 tick = 1 min.
//   1,384 %/h ÷ 60 min/h = 0,02307 %/tick
// Derivamos explícito para que la procedencia del número sea obvia.
// weekly_exercise (DEC-REF-79-B a) usa este ritmo real.
// fuel_drawdown (DEC-REF-79-B b) usa ritmo acelerado y declarado en el
// config del escenario, NO acá.
// ════════════════════════════════════════════════════════════════════
const FUEL_CONSUMPTION_L_PER_H       = 3.46;   // DEC-REF-79 (ii)
const TANK_CAPACITY_L                = 250;    // DEC-REF-79 (i)
const FUEL_CONSUMPTION_PCT_PER_TICK  = (FUEL_CONSUMPTION_L_PER_H / TANK_CAPACITY_L) * 100 / 60;

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

function initialCumminsState(siteCode) {
  const base = {
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
    // DEC-REF-66.d + EDGE-2 — setpoints del controlador PCC.
    // Valores realistas Cummins: HET (High Engine Temp) alarm ~95°C,
    // LOP (Low Oil Pressure) alarm ~25 psi. typeC los consume para
    // camino calibrated; scenario cummins_setpoint_lost los suprime.
    coolant_temp_setpoint: 95.0,
    oil_pressure_setpoint: 25.0,
  };
  // DEC-REF-79 (vi) — overrides con evidencia de relevamiento por (siteCode,
  // role). El motor no inventa el dato; lo aporta field_data.js.
  const overrides = ((FIELD_DATA[siteCode] || {}).CUMMINS) || {};
  return { ...base, ...overrides };
}

// SF-6 · DEC-REF-65.c — Eltek Smartpack S (rectificación telco -48 VDC).
// Variables según informe `docsRefactor/_biblioteca_campo/mapeo_modbus_drivers.md`
// (Driver 1 · Eltek Smartpack S ★ MVP): dc_bus_voltage (sense global),
// dc_load_current (via shunt — carga TOTAL de su banco), temperature.
// El caso "sumar cargas" en producción real es multi-controlador Smartpack S
// coexistiendo en un site grande (cada controlador ya agrega N rectificadores
// por CAN internamente y expone su dc_load_current como TOTAL). La suma
// SF-6 es entre controladores, no entre rectificadores.
//
// Valores iniciales realistas para el escenario E2E: cada módulo publica
// ~30 A en estado normal (3 módulos → total ~90 A); con eltek_load_high
// suben a ~90 A cada uno (total ~270 A). Regla test cruza en un umbral
// entre esos dos valores (p.ej. 200 A).
function initialEltekState() {
  return {
    deviceType:      'ELTEK',        // metadata interna — no publicada
    dc_bus_voltage:  -48.0,          // -48 VDC nominal telco
    dc_load_current: 30.0,           // A — carga TOTAL del banco del controlador
    temperature:     28.0,           // °C ambiente shelter
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
        // DEC-REF-79 (ii) — consumo REAL derivado del campo.
        // Jitter reducido a 25% del consumo cuando consuming, para que el
        // nivel baje monotónicamente (físicamente el consumo no es negativo).
        // En reposo el jitter original (0.02) refleja ruido del sensor.
        const decrement = consuming ? FUEL_CONSUMPTION_PCT_PER_TICK : 0;
        const noise     = consuming ? jitter(FUEL_CONSUMPTION_PCT_PER_TICK * 0.25) : jitter(0.02);
        return clamp(currentValue - decrement + noise, 0, 100);
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

    case 'battery_voltage': {
      // DEC-REF-79 (iii) — con el motor corriendo el alternador carga la
      // batería → tensión sube a ~13,8-14,4 V. En reposo ~12,6 V
      // (relevamiento #15). La transición reposo→carga habilita las reglas
      // E4/E5 del catálogo (cargador no recupera / cargador caído), que
      // miran exactamente ese paso; sin esto no se pueden demostrar.
      // Drift lento hacia el target (mismo patrón de dc_load_current):
      // saltar 12,6→14,1 en un solo tick de 60s sería feo; con step 1,0
      // V/tick llega a régimen en 2-3 min (dentro del ejercicio de 5 min).
      const target = sharedState.gen_running ? 14.1 : 12.6;
      const step   = Math.sign(target - currentValue) * Math.min(Math.abs(target - currentValue), 1.0);
      return clamp(currentValue + step + jitter(0.1), 12.0, 14.4);
    }

    case 'crank_current':
      return 0;  // siempre 0 fuera de eventos de arranque

    // ── Eltek Smartpack S (SF-6 · DEC-REF-65.c) ──────────────────────
    case 'dc_bus_voltage':
      // -48 VDC nominal con jitter menor. En scenario eltek_bus_alarm
      // (futuro) puede bajar a -46 (undervoltage) — no en R15.
      return clamp(currentValue + jitter(0.15), -49.5, -46.5);

    // ── Setpoints Cummins PCC (DEC-REF-66.d + EDGE-2) ────────────
    // Retornan null cuando el sharedState lo indica → device.js:_publish
    // acepta null en variables setpoint y publica {"value":null} — el
    // edge asigna siteState[dId][setpointVar]=null → typeC entra en
    // fallback/no-ref (typeC.js:12-13). Modela pérdida de comm Modbus
    // real del controlador.
    case 'coolant_temp_setpoint':
      if (sharedState.cummins_setpoint_suppressed) return null;
      return clamp(currentValue + jitter(0.2), 94.5, 95.5);

    case 'oil_pressure_setpoint':
      if (sharedState.cummins_setpoint_suppressed) return null;
      return clamp(currentValue + jitter(0.2), 24.5, 25.5);

    case 'dc_load_current': {
      // Estado compartido del site controla carga alta/normal
      // (espejo del patrón mains_failure/mains_restore).
      const target = sharedState.eltek_load_high ? 90 : 30;
      // Drift lento hacia el target ± jitter (∼2 A/tick)
      if (Math.abs(currentValue - target) > 5) {
        return currentValue + Math.sign(target - currentValue) * 5 + jitter(1);
      }
      return clamp(currentValue + jitter(1), target - 3, target + 3);
    }

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

  // SF-6 · DEC-REF-65.c — Eltek: cruce de carga provocable.
  // El scenario setea `eltek_load_high` en el sharedState del site; la
  // función `evolve` de `dc_load_current` lo lee y mueve el target a 90 A
  // (normalmente 30 A). Aplicado a los 3 módulos Eltek del site, el total
  // sube de ~90 A a ~270 A → cruza cualquier umbral entre esos dos valores.
  // MUY IMPORTANTE: el sharedState es POR SITE, no por device. Basta con
  // enviar el scenario a UN Eltek del site — los otros 2 lo verán via
  // sharedState al próximo tick (patrón espejo de mains_failure).
  eltek_load_high: {
    description: 'Carga rectificadores alta — total del site cruza umbral',
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_load_high: true } },
    ],
  },

  eltek_load_restore: {
    description: 'Carga rectificadores vuelve a normal',
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_load_high: false } },
    ],
  },

  // DEC-REF-66.d + EDGE-2 — pérdida de comm Modbus del controlador PCC:
  // los setpoints dejan de publicarse (evolve retorna null → _publish
  // acepta null para variables setpoint_*). typeC entra en fallback si
  // fallbackToD:true, o no-ref/ignore/alarm. Tras escalateAfterMinutes
  // sin setpoint, EDGE-2 emite el warning setpoint-unavailable-escalated
  // (ruleEngine.js:104, DEC-REF-26 — ya cableado, verificable acá).
  cummins_setpoint_lost: {
    description: 'Cummins PCC pierde publicación de setpoints (falla comm Modbus)',
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { cummins_setpoint_suppressed: true } },
    ],
  },

  cummins_setpoint_restore: {
    description: 'Cummins PCC recupera publicación de setpoints',
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { cummins_setpoint_suppressed: false } },
    ],
  },

  // DEC-REF-77-A + DEC-REF-79-B (a) — ciclo de ejercicio semanal SIN corte
  // de red. Apuntar al ATS del site: setea gen_status='RUNNING', que se
  // propaga por sharedState.gen_running (device.js:_syncSharedState). Los
  // timers del Cummins siguen corriendo → sus variables (rpm, oil_pressure,
  // coolant_temp, battery_voltage, run_hours, fuel_level) evolucionan
  // coherentes por evolve() con sharedState.gen_running=true. Al terminar
  // el cleanup restaura el estado inicial del ATS (gen_status='STOPPED') →
  // sharedState.gen_running=false → Cummins vuelve al reposo naturalmente.
  //
  // Cambios respecto de mains_failure_ats_transfer: NO tocamos mains_voltage
  // ni mains_freq (esto es lo que evita la alarma de pérdida de red). Ritmo
  // REAL de fuel (DEC-REF-79-B a): 5 min × 0,02307 %/min = 0,115% invisible,
  // y es correcto. La demostración de autonomía va por fuel_drawdown.
  weekly_exercise: {
    description: 'Ciclo de ejercicio semanal — arranca motor 5 min con red presente',
    duration_ms: 300000,   // 5 min reales, observables
    // noCleanup:false — cleanup restaura ATS al initial (gen_status='STOPPED')
    steps: [
      { at: 0,      set: { gen_status: 'STARTING' } },
      { at: 5000,   set: { gen_status: 'RUNNING', gen_voltage: 220.0, gen_freq: 50.0 } },
      { at: 290000, set: { gen_status: 'STOPPED', gen_voltage: 0, gen_freq: 0 } },
    ],
  },

  // DEC-REF-79 (vi) — empuja run_hours cerca del threshold de servicio
  // (3000 = 12 ciclos × 250 h). Arranca en 2969,1 por FIELD_DATA en cada
  // reinicio; este escenario mueve el dato al borde del threshold, y el
  // motor decide si alarma (regla D1/D2 del catálogo).
  // Apuntar al Cummins del sitio.
  service_due: {
    description: 'Empuja run_hours al borde del próximo servicio (2999,5 h; threshold 3000)',
    duration_ms: 10000,    // el escenario solo mueve el dato, no simula tiempo
    noCleanup: true,       // el dato queda empujado hasta el próximo restart del sim
    steps: [
      { at: 0, set: { run_hours: 2999.5 } },
    ],
  },

  // DEC-REF-79-B (b) — RITMO ACELERADO Y DECLARADO. Baja el tanque desde
  // 70% (por encima del umbral 48h ≈ 66%) hasta 15% (bajo umbral 12h ≈ 17%)
  // en 5,5 min de wallclock. Pendiente aparente ≈ 10 %/min = 600 %/h ≈ 433×
  // el consumo real de campo (3,46 L/h). No es maquillaje: el cálculo de
  // autonomía es correcto sobre la pendiente observada; lo que se comprime
  // es el TIEMPO — precedente vigente fuel_siphon.
  // Apuntar al Cummins del sitio.
  //
  // DEC-REF-79-B-A — SECUENCIA OBLIGATORIA. fuel_drawdown NO vive solo.
  // Durante el escenario los timers del Cummins están apagados (_runScenario
  // llama _cancelActiveTimers al inicio) → solo publica fuel_level; el resto
  // (rpm, oil_pressure, coolant_temp, run_hours, battery_voltage) queda
  // congelado en los valores que tenía al disparo. Disparado sobre motor
  // en reposo, el tanque baja con el motor apagado = firma del SIFONEO,
  // no del consumo (contradice DEC-REF-79 iii). La consola de la demo
  // debe disparar la secuencia:
  //   1) mains_failure_ats_transfer sobre el ATS (noCleanup deja motor
  //      corriendo por sharedState.gen_running)
  //   2) esperar 2-3 min para que el Cummins llegue a régimen
  //   3) fuel_drawdown sobre el Cummins → variables congeladas en valores
  //      de MOTOR CORRIENDO, que es lo correcto para simular consumo real
  fuel_drawdown: {
    description: 'Autonomía — baja el tanque cruzando umbrales 48h y 12h en 6 min',
    duration_ms: 360000,   // 6 min total (12 steps de 30s + 30s de cola)
    noCleanup: true,       // deja el nivel en 15% para operador
    steps: [
      { at: 0,      set: { fuel_level: 70 } },
      { at: 30000,  set: { fuel_level: 65 } },
      { at: 60000,  set: { fuel_level: 60 } },
      { at: 90000,  set: { fuel_level: 55 } },
      { at: 120000, set: { fuel_level: 50 } },
      { at: 150000, set: { fuel_level: 45 } },
      { at: 180000, set: { fuel_level: 40 } },
      { at: 210000, set: { fuel_level: 35 } },
      { at: 240000, set: { fuel_level: 30 } },
      { at: 270000, set: { fuel_level: 25 } },
      { at: 300000, set: { fuel_level: 20 } },
      { at: 330000, set: { fuel_level: 15 } },  // cruza el umbral de 12 h
    ],
  },

};

module.exports = {
  initialSecState,
  initialGenState,
  initialAtsState,
  initialCumminsState,
  initialEltekState,   // SF-6 · DEC-REF-65.c
  evolve,
  SCENARIOS,
};
