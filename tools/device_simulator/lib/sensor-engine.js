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
// spec_deteccion_sifoneo_eficiencia — carga eléctrica nominal del grupo en marcha (kW).
// Habilita el consumo específico (L/h ÷ kW) para la regla de eficiencia/deficiencia.
// En producción lo reporta la controladora del grupo; acá lo simula el sim.
const GENSET_POWER_KW_NOMINAL        = 10.0;

// spec_sim_cascada_energia (Qk2) — descarga de baterías COMPRIMIDA y declarada: sin red ni
// grupo, el bus DC va de flote (−54 V) al LVD (−43,2 V) en SIM_DC_DISCHARGE_MIN minutos
// (real: horas). Recarga con red o grupo a 0,5 V/min hasta el flote.
const DC_FLOAT_V = -54.0, DC_LVD_V = -43.2;
// Franco 2026-10-20 — física de la planta −48 V (PROVISORIO hasta el doc Eltek 350020.073):
//   · al perderse la red (sin grupo) las baterías toman la carga sin corte: el bus pasa EN EL
//     ACTO del flote a la tensión de descarga (~−51 V ≈ 2,12 V/celda × 24) y desde ahí baja
//     despacio hasta el LVD;
//   · en el LVD se abre el contactor: el sitio cae y el controlador (alimentado del mismo bus)
//     deja de reportar. Vuelve con la red o el grupo (reconexión), recargando desde el LVD.
const DC_BATT_V = -51.0;
// Franco 2026-10-22 — enfriamiento del grupo antes de detenerse: al volver la red el ATS
// retransfiere y el grupo sigue en marcha SIN carga este tiempo (PCC 1302: retardo de parada
// 0–600 s, sección 8.3.3.4). Parametrizable; 0 = se detiene a los 5 s como antes.
const GEN_COOLDOWN_S = process.env.SIM_GEN_COOLDOWN_S != null && process.env.SIM_GEN_COOLDOWN_S !== ''
  ? Math.max(0, Math.min(600, Number(process.env.SIM_GEN_COOLDOWN_S) || 0)) : 300;
const NO_LOAD_FACTOR = 0.3;   // consumo en vacío ≈ 30 % del nominal (enfriamiento)

// Franco 2026-10-22 — código de falla del PCC 1302 coherente con la física del grupo (manual
// A040D969, sección 9.8 / perfil cummins-pcc1302). Gana el más grave. Los escenarios de código
// (holdVars fault_code) y los valores fijados a mano siguen mandando mientras duran.
// Franco 2026-10-22 — fin del enfriamiento del grupo. Lo llama device.js en CADA tick de cualquier
// equipo del sitio (antes de las retenciones de escenario): pasado GEN_COOLDOWN_S con la red
// presente, el grupo se detiene; si la red cae durante el enfriamiento, se cancela y el grupo
// retoma la carga. Devuelve true en el instante en que el grupo se detiene.
function finEnfriamiento(sh) {
  if (!sh || !sh.gen_cooling) { if (sh && sh._coolingSince) delete sh._coolingSince; return false; }
  if (!redPresente(sh)) { delete sh.gen_cooling; delete sh._coolingSince; return false; }
  if (!sh._coolingSince) { sh._coolingSince = Date.now(); return false; }
  if (Date.now() - sh._coolingSince < GEN_COOLDOWN_S * 1000) return false;
  delete sh.gen_cooling; delete sh._coolingSince;
  sh.gen_running = false;
  return true;
}

function codigoFallaPcc(st, sh) {
  const enMarcha = grupoEnMarcha(sh);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const rpm = num(st.rpm), oil = num(st.oil_pressure), ct = num(st.coolant_temp), bat = num(st.battery_voltage);
  if (rpm != null && rpm > 1725) return 1992;                                   // sobrevelocidad 115 %
  if (Number(sh && sh.gen_crank_failures) >= 3) return 1438;                    // falla de arranque
  if (enMarcha && rpm != null && rpm > 300 && oil != null && oil < 180) return 415;   // parada por aceite (ECM)
  if (ct != null && ct > 107.2) return 146;                                     // refrigerante sobre lo normal
  if (enMarcha && rpm != null && rpm > 300 && oil != null && oil < 198) return 143;   // advertencia de aceite
  if (bat != null && bat < 11.8) return 441;                                    // batería baja (12 V)
  if (bat != null && bat > 15.0) return 442;                                    // batería alta (12 V)
  return 0;
}
const DC_DISCHARGE_MIN = Number(process.env.SIM_DC_DISCHARGE_MIN) > 0 ? Number(process.env.SIM_DC_DISCHARGE_MIN) : 20;
const DC_RECHARGE_V_PER_MIN = 0.5;

// Hechos del sitio (spec_sim_cascada_energia §1). `mains_ok` sin definir = red presente.
const redPresente = (sh) => !(sh && sh.mains_ok === false);
const grupoEnMarcha = (sh) => !!(sh && sh.gen_running);
// spec §5 — el GEN es el Wanomi Sense del grupo: en un sitio con estado de marcha compartido
// (lo fija el ATS o un escenario de marcha) sigue a ese estado; si no, a su propio genset_running.
function genEnMarcha(deviceState, sh) {
  if (deviceState && deviceState.deviceType === 'CUMMINS') return grupoEnMarcha(sh);
  if (sh && sh.gen_running !== undefined) return grupoEnMarcha(sh);
  return !!(deviceState && deviceState.genset_running);
}
// spec §6 — anomalía activa del Sense (una a la vez) y su efecto en el consumo.
const fallaSense = (sh) => (sh && sh.sense_fault) || null;
const FACTOR_CONSUMO = { inyector_tapado: 1.06, inyector_goteando: 1.10, filtro_aire_obstruido: 1.05 };
// Minutos transcurridos desde la última evolución de una variable (para tasas por tiempo real).
function minutosDesde(deviceState, key) {
  const now = Date.now();
  const k = `_t_${key}`;
  const prev = deviceState[k];
  deviceState[k] = now;
  return prev ? Math.min((now - prev) / 60000, 5) : 0;
}
// Firma de vibración (categórica, se mantiene — Franco 2026-10-20) derivada de la velocidad RMS.
function firmaVibracion(rms) {
  if (!(rms >= 0)) return 'normal';
  if (rms < 4.5) return 'normal';
  if (rms < 7.1) return 'warning';
  if (rms < 11.2) return 'anomaly';
  return 'critical';
}

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
    deviceType: 'GEN',            // metadata interna — no publicada
    fuel_level: 75.0,
    // spec_autonomy_extendido — caudalímetro: caudal instantáneo (L/h). 0 en
    // reposo; con el grupo en marcha evolve lo lleva al ritmo real de campo.
    fuel_rate: 0.0,
    // spec_deteccion_sifoneo_eficiencia — carga eléctrica del grupo (kW). 0 en reposo.
    genset_power_kw: 0.0,
    // DEC-REF-115 (#85) — autonomy_hours ya NO la publica el equipo: la
    // calcula la plataforma (edge-engine/autonomy.js) desde fuel_level.
    genset_running: 0,
    exhaust_temp: 25.0,
    vibration_signature: 'normal',
    crank_current: 0.0,
    alternator_voltage: 0.0,
    battery_voltage: 12.6,
    crank_attempts_failed: 0,
    mains_voltage: 220.0,
    // spec_sim_cascada_energia §5 — sensores Wanomi Sense sobre el grupo (no los da la controladora).
    vib_rms: 0.1,                 // mm/s — acelerómetro en el bloque
    vib_firing: 0.0,              // mm/s — banda de la frecuencia de encendido
    vib_peak_hz: 0.0,             // Hz — pico del espectro
    exhaust_temp_a: 25.0,         // °C — termocupla banco A
    exhaust_temp_b: 25.0,         // °C — termocupla banco B
    air_filter_dp: 0.0,           // kPa — restricción del filtro de aire
    fuel_supply_pressure: 0.3,    // bar — alimentación (0,3 = columna estática detenido)
    fuel_return_rate: 0.0,        // L/h — caudalímetro de retorno
    water_in_fuel: 0,             // 0/1 — sensor del separador
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
    // spec_autonomy_extendido — caudalímetro (mismo modelo que GEN). 0 en reposo.
    fuel_rate:       0.0,
    // spec_deteccion_sifoneo_eficiencia — carga eléctrica del grupo (kW). 0 en reposo.
    genset_power_kw: 0.0,
    // DEC-REF-115 (#85) — autonomy_hours ya NO la publica el equipo: la
    // calcula la plataforma (edge-engine/autonomy.js) desde fuel_level.
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
    oil_pressure_setpoint: 172.0,   // kPa (≈25 psi)
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
    dc_bus_voltage:  -54.0,          // flote ~-54 V (planta -48 VDC telco, NEGATIVO) · DEC-REF-123 · PROVISORIO
    dc_load_current: 30.0,           // A — carga TOTAL del banco del controlador
    temperature:     28.0,           // °C ambiente shelter
    _divergeHigh:    false,          // flag per-device (no publicado) — escenario rect_divergencia (motor M2 spread)
  };
}

function jitter(magnitude) {
  return (Math.random() - 0.5) * 2 * magnitude;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// spec_autonomy_extendido — MODELO ÚNICO DE CONSUMO (coherencia fuel_rate ↔ fuel_level).
// Una sola tasa instantánea (L/h) es la fuente de verdad: `fuel_rate` la REPORTA
// (medidor) y `fuel_level` la INTEGRA (el tanque baja a esa tasa). Así el caudalímetro
// y el tanque COINCIDEN. `sharedState.fuel_eff_factor` (default 1) multiplica la tasa
// base y sube el consumo lento y COHERENTE en ambas variables → modela pérdida de
// eficiencia / falla incipiente (≠ sifoneo, que es una fuga del tanque que NO pasa por
// el medidor y por eso se inyecta a mano solo en fuel_level).
function consumptionLphNow(sharedState) {
  const eff = Number(sharedState && sharedState.fuel_eff_factor) > 0
    ? Number(sharedState.fuel_eff_factor) : 1;
  const falla = FACTOR_CONSUMO[fallaSense(sharedState)] || 1;   // spec §6 — anomalía de inyección/aire
  const vacio = sharedState && sharedState.gen_cooling && redPresente(sharedState) ? NO_LOAD_FACTOR : 1;   // enfriamiento sin carga
  return FUEL_CONSUMPTION_L_PER_H * eff * falla * vacio;
}

// evolve recibe el estado completo del device y el sharedState del site
function evolve(variable, currentValue, deviceState, sharedState) {
  // MODELO HÍBRIDO (Franco): por default cada variable VARÍA realista (ruido de
  // sensor de campo) y conserva su comportamiento contextual (grupo encendido,
  // rectificador con carga, etc. — vía sharedState/deviceState). Lo que el operador
  // FIJA a mano se PINEA en device.js (_pinned) y no pasa por acá (retiene el valor).
  sharedState = sharedState || {};

  // spec §5 — firma de vibración categórica derivada de vib_rms (antes del corte de strings).
  if (variable === 'vibration_signature' && deviceState && typeof deviceState.vib_rms === 'number') return firmaVibracion(deviceState.vib_rms);
  // Bool, int (counts), categorical strings: no drift en idle
  if (typeof currentValue === 'boolean') return currentValue;
  if (typeof currentValue === 'string') return currentValue;
  // spec §1 — intentos fallidos del grupo del sitio (escenarios de corte sin arranque).
  if (variable === 'crank_attempts_failed' && sharedState.gen_crank_failures != null) return sharedState.gen_crank_failures;
  if (variable === 'water_in_fuel') return fallaSense(sharedState) === 'agua_en_combustible' ? 1 : 0;
  if (variable === 'genset_running' && deviceState && deviceState.deviceType !== 'CUMMINS' && sharedState.gen_running !== undefined) {
    return grupoEnMarcha(sharedState) ? 1 : 0;
  }
  // Franco 2026-10-22 — el código de falla del Cummins sale de la física del grupo.
  if (variable === 'fault_code' && deviceState && deviceState.deviceType === 'CUMMINS') return codigoFallaPcc(deviceState, sharedState);
  if (Number.isInteger(currentValue) &&
      (variable === 'battery_beacons_count' || variable === 'crank_attempts_failed' ||
       variable === 'fault_code' || variable.startsWith('bitmap_') || variable === 'genset_running')) {
    return currentValue;
  }

  // Floats con drift contextual
  switch (variable) {
    // ── InteliATS PWR ────────────────────────────────────────────
    case 'mains_voltage':
      // spec_sim_cascada_energia §1 — la red es un hecho del SITIO: ATS y GEN la ven igual.
      if (!redPresente(sharedState)) return 0;
      if (currentValue < 100) return 220.0;   // volvió la red
      if (deviceState && deviceState.deviceType === 'ATS') return clamp(currentValue + jitter(3), 210, 230);
      return clamp(currentValue + jitter(2), 215, 225);

    case 'mains_freq':
      if (!redPresente(sharedState)) return 0;
      if (currentValue < 45) return 50.0;
      return clamp(currentValue + jitter(0.2), 49.5, 50.5);

    case 'gen_voltage': {
      // El ATS mide el lado del grupo: hay tensión si el grupo gira (arranque por el ATS o local).
      const atsRunning = (deviceState && deviceState.gen_status === 'RUNNING') || grupoEnMarcha(sharedState);
      if (!atsRunning) return 0;
      if (currentValue < 100) return 220.0;
      return clamp(currentValue + jitter(2), 215, 225);
    }

    case 'gen_freq': {
      const atsRunning = (deviceState && deviceState.gen_status === 'RUNNING') || grupoEnMarcha(sharedState);
      if (!atsRunning) return 0;
      if (currentValue < 45) return 50.0;
      return clamp(currentValue + jitter(0.1), 49.8, 50.2);
    }

    case 'load_kw':
      return clamp(currentValue + jitter(0.5), 0, 15);

    // ── Cummins PowerCommand ─────────────────────────────────────
    case 'rpm': {
      const target = sharedState.gen_running ? 1500 : 0;
      // DEC-REF-102 D-3 (#77) — rampa 750 rpm/tick (era 100): un motor real
      // llega a 1500 rpm en segundos y hace spindown en segundos; a cadencia
      // 30 s son ~2 ticks. La rampa vieja (15 ticks ≈ 7,5 min) estiraba el
      // transitorio de apagado (rpm>300 con oil=0) por minutos y vencía
      // cualquier graceSec razonable en las reglas A0/A1.
      if (currentValue < target) return Math.min(currentValue + 750, target);
      if (currentValue > target) return Math.max(currentValue - 750, target);
      return currentValue + (target > 0 ? Math.round(jitter(10)) : 0);
    }

    case 'oil_pressure':
      if (!sharedState.gen_running) return 0;
      // DEC-REF-104 D-4 (#78) — falla real de aceite demostrable: con el flag
      // del escenario cummins_oil_failure la presión cae y SE SOSTIENE baja
      // (sin el flag, el clamp [35,55] hacía imposible demostrar A0/A1 con
      // valor real — solo disparaban por el transitorio de arranque).
      // Auditoría 2026-10-14 (F-03, decisión Franco) — unidad kPa (antes psi 35-55 /
      // falla 0,4-0,8 "bar" en canal psi). Normal 240-380 kPa; falla 40-80 kPa (<1 bar).
      if (sharedState.cummins_oil_failure) return clamp(currentValue + jitter(2), 40, 80);
      return clamp(currentValue + jitter(7), 240, 380);

    case 'coolant_temp':
      if (sharedState.gen_running) {
        // S4 — régimen normal 75-90 °C. Antes el tope era 95 y el setpoint de alarma (HET)
        // oscila 94,5-95,5: con el motor caliente cruzaba el setpoint sin falla (falsa alarma
        // de "refrigerante alta"). La sobretemperatura real se ejercita con falla_sobretemperatura.
        return clamp(currentValue + jitter(1), 75, 90);
      }
      // Calefactor de bloque caído (escenario): detenido, el refrigerante se enfría hasta ~15 °C.
      if (sharedState.calefactor_caido) return Math.max(14, currentValue - 2 + jitter(0.3));
      if (currentValue < 30) return Math.min(30, currentValue + 1);   // calefactor de vuelta: recupera de a poco
      return clamp(currentValue - 1, 30, currentValue);

    case 'run_hours':
      // incremento por tick asume variableSendFreq 60s → 1/60 hr por tick
      return sharedState.gen_running ? currentValue + (1 / 60) : currentValue;

    case 'fuel_level': {
      // Baja del tanque DERIVADA de la MISMA tasa que reporta el medidor (fuel_rate)
      // → coherencia (spec_autonomy_extendido). GEN consume por su genset_running;
      // CUMMINS por sharedState.gen_running (via ATS). 1 tick = 1 min (variableSendFreq
      // 60s) → %/tick = Lph / tanque × 100 / 60. Jitter 25% del decremento para que
      // baje monotónico (el consumo no es negativo); en reposo ruido de sensor 0.02.
      const esCummins = deviceState && deviceState.deviceType === 'CUMMINS';
      // spec §5 — MISMO TANQUE: con un Cummins en el sitio, el nivel REAL vive en el estado del
      // sitio (`tank_pct`) y lo integra el Cummins; el Sense (GEN) lo lee con su ultrasónico.
      if (!esCummins && sharedState.tank_pct != null) return clamp(sharedState.tank_pct + jitter(0.15), 0, 100);
      const consuming = genEnMarcha(deviceState, sharedState);
      const lph       = consumptionLphNow(sharedState);
      const decrement = consuming ? (lph / TANK_CAPACITY_L) * 100 / 60 : 0;
      const noise     = consuming ? jitter(decrement * 0.25) : jitter(0.02);
      // spec_deteccion_sifoneo_eficiencia — SIFONEO: drenaje extra del tanque que NO
      // pasa por el medidor (fuel_rate lo ignora) → tanque cae más rápido que el caudal
      // reportado → divergence. Aplica haya o no consumo (se puede sifonear apagado).
      const siphonLph = Number(sharedState.siphon_lph) > 0 ? Number(sharedState.siphon_lph) : 0;
      const siphonDec = (siphonLph / TANK_CAPACITY_L) * 100 / 60;
      if (!esCummins) return clamp(currentValue - decrement - siphonDec + noise, 0, 100);
      // Cummins: integra el nivel real y publica el de su sensor de fábrica (+ desvío del
      // escenario sensor_fabrica_miente).
      const offset = Number(sharedState.factory_fuel_offset) || 0;
      const real = clamp((sharedState.tank_pct != null ? sharedState.tank_pct : currentValue - offset) - decrement - siphonDec + noise, 0, 100);
      sharedState.tank_pct = real;
      return clamp(real + offset, 0, 100);
    }

    case 'fuel_rate': {
      // Caudalímetro (spec_autonomy_extendido) — REPORTA la misma tasa que vacía el
      // tanque POR CONSUMO, ± ruido de sensor. 0 en reposo. NO incluye el sifón (por eso
      // diverge del tanque ante robo). Comparte consumptionLphNow con fuel_level → medidor
      // y tanque coinciden en operación normal; fuel_eff_factor los sube juntos.
      const flowing = genEnMarcha(deviceState, sharedState);
      if (!flowing) return 0;
      const lph = consumptionLphNow(sharedState);
      return clamp(lph + jitter(lph * 0.1), 0, 40);
    }

    case 'genset_power_kw': {
      // spec_deteccion_sifoneo_eficiencia — carga eléctrica del grupo (kW). 0 en reposo;
      // en marcha ~nominal ± ruido. Habilita el consumo específico (fuel_rate ÷ kW) de la
      // regla de eficiencia. GEN mira su genset_running; CUMMINS el sharedState.gen_running.
      const online = genEnMarcha(deviceState, sharedState);
      if (!online) return 0;
      if (sharedState.gen_cooling && redPresente(sharedState)) return 0;   // enfriamiento: en marcha pero sin carga (el ATS ya retransfirió)
      return clamp(GENSET_POWER_KW_NOMINAL + jitter(1), 5, 15);
    }

    case 'shelter_temp':
      return clamp(currentValue + jitter(0.3), 18, 30);

    case 'autonomy_hours':
      // DEC-REF-115 (#85) — la calcula la plataforma (edge-engine); el sim
      // no la tiene en estado. Si un escenario viejo la pide, no inventar.
      return currentValue;

    case 'exhaust_temp': {
      // spec §5 — con termocuplas por banco, la temperatura de escape es su promedio.
      if (deviceState && typeof deviceState.exhaust_temp_a === 'number' && typeof deviceState.exhaust_temp_b === 'number') {
        return (deviceState.exhaust_temp_a + deviceState.exhaust_temp_b) / 2;
      }
      if (genEnMarcha(deviceState, sharedState)) {
        // Motor corriendo: mantener ~350°C con jitter
        return clamp(currentValue + jitter(5), 320, 380);
      }
      // Motor apagado: enfría 2°C/lectura hacia ambiente
      return clamp(currentValue - 2, 25, currentValue);
    }

    // ── Wanomi Sense sobre el grupo (spec_sim_cascada_energia §5–§6) ──────
    case 'exhaust_temp_a':
    case 'exhaust_temp_b': {
      if (!genEnMarcha(deviceState, sharedState)) return clamp(currentValue - 8, 25, Math.max(25, currentValue));
      const f = fallaSense(sharedState);
      let target = 350;
      if (f === 'filtro_aire_obstruido') target += 30;
      if (variable === 'exhaust_temp_b' && f === 'inyector_tapado') target -= 50;
      if (variable === 'exhaust_temp_b' && f === 'inyector_goteando') target += 45;
      // Calienta/enfría ~20 °C por lectura hacia el objetivo, con ruido de termocupla.
      const step = Math.sign(target - currentValue) * Math.min(Math.abs(target - currentValue), 20);
      return clamp(currentValue + step + jitter(3), 25, 700);
    }

    case 'vib_rms': {
      if (!genEnMarcha(deviceState, sharedState)) return clamp(0.1 + jitter(0.05), 0, 1);
      const f = fallaSense(sharedState);
      const base = f === 'desbalance_mecanico' ? 9.5 : f === 'inyector_tapado' ? 4.0 : f === 'inyector_goteando' ? 3.2 : 2.5;
      return clamp(base + jitter(base * 0.08), 0, 30);
    }

    case 'vib_firing': {
      if (!genEnMarcha(deviceState, sharedState)) return 0;
      const f = fallaSense(sharedState);
      const base = f === 'inyector_tapado' ? 3.0 : f === 'inyector_goteando' ? 2.0 : 1.2;
      return clamp(base + jitter(base * 0.1), 0, 20);
    }

    case 'vib_peak_hz': {
      if (!genEnMarcha(deviceState, sharedState)) return 0;
      const f = fallaSense(sharedState);
      // 6 cilindros, 4 tiempos, 1500 rpm → encendido a 75 Hz; 1× rpm = 25 Hz; ½ orden = 12,5 Hz.
      const base = f === 'desbalance_mecanico' ? 25 : f === 'inyector_tapado' ? 12.5 : 75;
      return clamp(base + jitter(base * 0.01), 0, 200);
    }

    case 'vibration_signature':
      // Se mantiene CATEGÓRICA (Franco 2026-10-20); si el equipo mide vib_rms, se deriva de ella.
      if (deviceState && typeof deviceState.vib_rms === 'number') return firmaVibracion(deviceState.vib_rms);
      return currentValue;

    case 'air_filter_dp': {
      if (!genEnMarcha(deviceState, sharedState)) return 0;
      const kw = Number(deviceState && deviceState.genset_power_kw) || GENSET_POWER_KW_NOMINAL;
      const k = fallaSense(sharedState) === 'filtro_aire_obstruido' ? 0.48 : 0.12;
      return clamp(k * kw + jitter(0.05), 0, 10);
    }

    case 'fuel_supply_pressure': {
      if (!genEnMarcha(deviceState, sharedState)) return clamp(0.3 + jitter(0.02), 0, 1);
      const base = fallaSense(sharedState) === 'filtro_combustible_tapado' ? 1.6 : 3.8;
      return clamp(base + jitter(0.1), 0, 10);
    }

    case 'fuel_return_rate': {
      if (!genEnMarcha(deviceState, sharedState)) return 0;
      const f = fallaSense(sharedState);
      const base = f === 'inyector_goteando' ? 2.7 : f === 'filtro_combustible_tapado' ? 3.2 : 4.5;
      return clamp(base + jitter(0.3), 0, 20);
    }

    case 'alternator_voltage': {
      if (genEnMarcha(deviceState, sharedState)) {
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
      // Sistema 24V (regla de alarma <22/<20): reposo/float ~26,4 V; con el grupo
      // en marcha el alternador carga → ~27,6 V. El reposo NO dispara la alarma.
      // S2 — cada grupo carga SU batería: el Cummins sigue al ATS (sharedState.gen_running);
      // el GEN, a su propio genset_running. Antes el GEN miraba al ATS: en marcha propia
      // (generador_marcha) su batería no cargaba → falsas alarmas de cargador / batería baja.
      const enMarcha = genEnMarcha(deviceState, sharedState);
      const target = enMarcha ? 14.1 : 12.6;
      const step   = Math.sign(target - currentValue) * Math.min(Math.abs(target - currentValue), 1.0);
      return clamp(currentValue + step + jitter(0.1), 11.8, 14.6);
    }

    case 'crank_current':
      return 0;  // siempre 0 fuera de eventos de arranque

    // ── Eltek Smartpack S (SF-6 · DEC-REF-65.c) ──────────────────────
    case 'gen_status':
      // El ATS no puede seguir diciendo RUNNING si un escenario del sitio detuvo el grupo
      // (genset_no_start / battery_degraded sobre el GEN después de una transferencia).
      if (currentValue === 'RUNNING' && sharedState.gen_running === false) return 'STOPPED';
      return currentValue;

    case 'dc_bus_voltage': {
      // DEC-REF-123 — planta -48 VDC telco, NEGATIVA. Flote (sano) ~-54 V; en
      // descarga la MAGNITUD cae → el valor SUBE (menos negativo) hacia el LVD
      // (~-43,2 V). Valores PROVISORIOS (estándar -48 telco), a confirmar contra
      // el registro Eltek 350020.073 / lab. Dispara slope/projection del motor M.
      // spec_sim_cascada_energia §1 — descarga sin red NI grupo (o por el escenario de demo);
      // tasa por tiempo real, comprimida (Qk2). Con red o grupo, recarga hasta el flote.
      const min = minutosDesde(deviceState, 'dc_bus_voltage');
      const descarga = sharedState.eltek_discharge || (!redPresente(sharedState) && !grupoEnMarcha(sharedState));
      if (descarga) {
        // Escalón al entrar en descarga: del flote a la tensión de baterías, sin pasar por el medio.
        if (!deviceState._dcDescarga) { deviceState._dcDescarga = true; if (currentValue < DC_BATT_V) return DC_BATT_V + jitter(0.05); }
        if (deviceState._lvdAbierto) return DC_LVD_V;               // sitio caído: no hay bus que medir
        const tasa = (DC_LVD_V - DC_BATT_V) / DC_DISCHARGE_MIN;     // V/min (positiva: sube hacia el LVD)
        const v = currentValue + tasa * min + jitter(0.03);
        if (v >= DC_LVD_V) { deviceState._lvdAbierto = true; return DC_LVD_V; }   // abre el LVD → el equipo se apaga
        return clamp(v, -54.5, DC_LVD_V);
      }
      // Volvió la red o el grupo: reconecta el LVD (el controlador vuelve a reportar) y recarga.
      deviceState._dcDescarga = false;
      deviceState._lvdAbierto = false;
      if (currentValue > -53.5) return Math.min(currentValue, Math.max(DC_FLOAT_V, currentValue - DC_RECHARGE_V_PER_MIN * Math.max(min, 0.5)));
      return clamp(currentValue + jitter(0.15), -54.5, -53.5);
    }

    case 'temperature': {
      // ELTEK — temperatura del sistema (auditoría 2026-10-20: estaba clavada en 28 °C). Ruido
      // lento 26–30 °C; en descarga los módulos/baterías se calientan un poco.
      if (!(deviceState && deviceState.deviceType === 'ELTEK')) return currentValue;
      const descarga = sharedState.eltek_discharge || (!redPresente(sharedState) && !grupoEnMarcha(sharedState));
      if (descarga) return clamp(currentValue + 0.1 + jitter(0.05), 26, 35);
      return clamp(currentValue + jitter(0.15) + (currentValue > 30 ? -0.1 : 0), 26, 32);
    }

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
      return clamp(currentValue + jitter(1), 169, 176);   // LOP ≈ 25 psi = 172 kPa

    case 'dc_load_current': {
      // Estado compartido del site controla carga alta/normal
      // (espejo del patrón mains_failure/mains_restore).
      // `_divergeHigh` (per-device, escenario rect_divergencia) hace que SOLO
      // este rectificador suba → desbalance vs los otros del site (motor M2 spread).
      const target = (deviceState._divergeHigh || sharedState.eltek_load_high) ? 90 : 30;
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
//   roles:        DEC-REF-99 D-2 (#74) — roles de device a los que aplica el
//                 escenario ('SEC' | 'GEN' | 'CUMMINS' | 'ATS' | 'ELTEK').
//                 Metadata: el sim NO la consume para ejecutar (la guarda real
//                 es la validación de variables de device.js:_runScenario);
//                 la sirve GET /simulator/scenarios para que la UI ofrezca
//                 solo los escenarios del equipo. FUENTE ÚNICA del catálogo —
//                 cierra la divergencia whitelist↔engine (BACKLOG-SIM-5).
//                 'ELTEK' cubre ELTEK-01..03 por prefix match.
// ════════════════════════════════════════════════════════════════════

const SCENARIOS = {

  intrusion: {
    description: 'Intrusión por cerco con robo de baterías',
    roles: ['SEC'],
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
    roles: ['SEC'],
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
    roles: ['GEN', 'CUMMINS'],
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
    description: 'Corte de luz, generador no arranca tras 3 intentos (corta la red de todo el sitio)',
    roles: ['GEN'],
    duration_ms: 45000,
    steps: [
      // spec_sim_cascada_energia — el corte es del SITIO (ATS, GEN y rectificadores lo ven).
      // El grupo NO arranca: si quedó en marcha de un escenario anterior, se detiene (si no, los
      // rectificadores seguían en flote "alimentados" por un grupo que no arrancó).
      { at: 0,     set: { mains_voltage: 0, genset_running: 0 }, sharedSet: { mains_ok: false, gen_crank_failures: 0, gen_running: false } },
      { at: 3000,  set: { battery_voltage: 12.4 } },
      { at: 3500,  set: { crank_current: 230 } },
      { at: 4500,  set: { crank_current: 0, crank_attempts_failed: 1 }, sharedSet: { gen_crank_failures: 1 } },
      { at: 8000,  set: { crank_current: 220 } },
      { at: 9000,  set: { crank_current: 0, crank_attempts_failed: 2 }, sharedSet: { gen_crank_failures: 2 } },
      { at: 13000, set: { crank_current: 180 } },
      { at: 14000, set: { crank_current: 0, crank_attempts_failed: 3 }, sharedSet: { gen_crank_failures: 3 } },
    ],
  },

  genset_vibration_anomaly: {
    description: 'Falla predictiva por firma vibracional anómala',
    roles: ['GEN'],
    duration_ms: 30000,
    steps: [
      // spec §5 — la firma (categórica) sale de vib_rms: el escenario mueve la vibración real.
      { at: 0,     set: { mains_voltage: 0 }, sharedSet: { mains_ok: false } },
      { at: 2000,  set: { crank_current: 240 } },
      { at: 3000,  set: { crank_current: 0 } },
      { at: 3500,  set: { genset_running: 1 }, sharedSet: { gen_running: true } },
      { at: 5000,  set: { vib_rms: 2.5, vibration_signature: 'normal' } },
      { at: 10000, set: { vib_rms: 5.5, vibration_signature: 'warning' } },
      { at: 15000, set: { vib_rms: 8.5, vibration_signature: 'anomaly' } },
      { at: 22000, set: { vib_rms: 12.0, vibration_signature: 'critical' } },
    ],
  },

  battery_degraded: {
    description: 'Batería de arranque degradada',
    roles: ['GEN'],
    duration_ms: 20000,
    steps: [
      { at: 0,     set: { mains_voltage: 0, genset_running: 0 }, sharedSet: { mains_ok: false, gen_running: false } },
      { at: 3000,  set: { battery_voltage: 11.2 } },
      { at: 3500,  set: { crank_current: 150 } },
      { at: 4500,  set: { battery_voltage: 9.8 } },
      { at: 5000,  set: { crank_current: 0, crank_attempts_failed: 1 } },
      { at: 8000,  set: { battery_voltage: 11.5 } },
    ],
  },

  // spec_autonomy_extendido — arranque del grupo para demostrar consumo + caudalímetro.
  // Fija genset_running=1 y devuelve el control a evolve (duración corta): el motor
  // queda EN MARCHA (noCleanup) y evolve consume fuel_level + publica fuel_rate al
  // ritmo real de campo. Con la ficha GEN configurada (flowVariable/runningVariable),
  // el edge calcula autonomía 'metered' (Medida). Persiste hasta reset o generador_parada.
  generador_marcha: {
    description: 'Generador en marcha — consumo de gasoil y caudalímetro en línea',
    roles: ['GEN'],
    duration_ms: 5000,     // corto: fija la marcha y evolve toma el consumo/caudal
    noCleanup: true,
    steps: [
      // spec §5 — marcha del GRUPO del sitio (el Cummins y el Sense la ven igual).
      { at: 0, set: { genset_running: 1 }, sharedSet: { gen_running: true } },
    ],
  },

  generador_parada: {
    description: 'Generador se detiene — cesa el consumo y el caudalímetro vuelve a 0',
    roles: ['GEN'],
    duration_ms: 3000,
    noCleanup: true,
    steps: [
      { at: 0, set: { genset_running: 0 }, sharedSet: { gen_running: false } },
    ],
  },

  // spec_autonomy_extendido — PÉRDIDA DE EFICIENCIA (≠ sifoneo). Sube fuel_eff_factor:
  // el consumo trepa ~8% sobre lo normal, COHERENTE en medidor y tanque (no divergen).
  // Sutil (dentro del ruido instantáneo), pero un baseline/slope del motor M sobre el
  // consumo lo detecta con el tiempo. Correr con el grupo EN MARCHA para que se vea.
  // fuel_eff_factor vive en sharedState (per-site) → persiste hasta consumo_normal.
  consumo_ineficiente: {
    description: 'Pérdida de eficiencia — el consumo sube ~8% sostenido (falla incipiente, no sifoneo)',
    roles: ['GEN', 'CUMMINS'],
    duration_ms: 5000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { fuel_eff_factor: 1.08 } },
    ],
  },

  consumo_normal: {
    description: 'Consumo vuelve a eficiencia normal',
    roles: ['GEN', 'CUMMINS'],
    duration_ms: 3000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { fuel_eff_factor: 1.0 } },
    ],
  },

  // spec_deteccion_sifoneo_eficiencia — SIFONEO EN MARCHA (≠ deficiencia). Drena el
  // tanque ~20 L/h extra que NO pasa por el medidor → fuel_level cae mucho más rápido
  // que fuel_rate → consumption_tank >> fuel_rate → dispara divergence. Correr con el
  // grupo en marcha para que consumption_tank sea computable. Persiste hasta sifoneo_fin.
  sifoneo_en_marcha: {
    description: 'Sifoneo en marcha — el tanque se vacía sin pasar por el caudalímetro (divergencia)',
    roles: ['GEN', 'CUMMINS'],
    duration_ms: 5000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { siphon_lph: 20 } },
    ],
  },

  sifoneo_fin: {
    description: 'Fin del sifoneo — el tanque vuelve a caer solo por consumo',
    roles: ['GEN', 'CUMMINS'],
    duration_ms: 3000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { siphon_lph: 0 } },
    ],
  },

  maintenance: {
    description: 'Mantenimiento autorizado (técnico con tag BLE)',
    roles: ['SEC'],
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
    description: 'Corte de red — ATS transfiere a generador (el grupo sostiene el sitio)',
    roles: ['ATS'],
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      // spec_sim_cascada_energia — corte del SITIO: los rectificadores descargan hasta que el grupo toma.
      { at: 0,     set: { mains_voltage: 0, mains_freq: 0 }, sharedSet: { mains_ok: false, gen_crank_failures: 0 } },
      { at: 2000,  set: { gen_status: 'STARTING' } },
      { at: 8000,  set: { gen_status: 'RUNNING', gen_voltage: 220.0, gen_freq: 50.0 } },
      { at: 10000, set: { transfer_state: 'AUTO' } },
    ],
  },

  mains_failure_gen_no_start: {
    description: 'Corte de red — el grupo NO arranca: los rectificadores se descargan (cascada completa)',
    roles: ['ATS'],
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      // spec_sim_cascada_energia — 3 intentos de arranque fallidos y el sitio queda con baterías.
      { at: 0,     set: { mains_voltage: 0, mains_freq: 0 }, sharedSet: { mains_ok: false, gen_crank_failures: 0 } },
      { at: 2000,  set: { gen_status: 'STARTING' } },
      { at: 6000,  sharedSet: { gen_crank_failures: 1 } },
      { at: 11000, sharedSet: { gen_crank_failures: 2 } },
      { at: 16000, sharedSet: { gen_crank_failures: 3 } },
      { at: 18000, set: { gen_status: 'STOPPED' } },
    ],
  },

  mains_restore: {
    description: `Restauración de red — vuelve la red, el ATS retransfiere, el grupo se enfría ${GEN_COOLDOWN_S} s sin carga y se detiene; los rectificadores recargan`,
    roles: ['ATS', 'GEN'],
    duration_ms: 10000,
    noCleanup: true,
    steps: [
      { at: 0,    set: { mains_voltage: 220.0, mains_freq: 50.0 }, sharedSet: { mains_ok: true, gen_crank_failures: 0 } },
      // Retransferencia a la red: el grupo queda en marcha sin carga (enfriamiento).
      // El fin del enfriamiento lo decide el ATS en evolve (gen_status): si la red vuelve a caer
      // durante el enfriamiento, el grupo retoma la carga y NO se detiene.
      GEN_COOLDOWN_S > 0
        ? { at: 5000, sharedSet: { gen_cooling: true } }
        : { at: 5000, set: { gen_status: 'STOPPED', gen_voltage: 0, gen_freq: 0, genset_running: 0 }, sharedSet: { gen_running: false } },
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
    roles: ['ELTEK'],
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_load_high: true } },
    ],
  },

  eltek_load_restore: {
    description: 'Carga rectificadores vuelve a normal',
    roles: ['ELTEK'],
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_load_high: false } },
    ],
  },

  // spec_motor_m.md · Ola M1 — demostración del motor M (soft sensors).
  // Rampa de descarga del bus DC: `evolve('dc_bus_voltage')` sube la tensión
  // hacia el LVD mientras el flag está activo. Dispara reglas M `slope`
  // (tensión cayendo) y `projection` (tiempo al LVD). Duración larga para que
  // el buffer del soft sensor acumule la ventana.
  eltek_dc_descarga: {
    description: 'Planta DC en descarga — tensión de bus hacia el LVD (demo motor M)',
    roles: ['ELTEK'],
    duration_ms: 180000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_discharge: true } },
    ],
  },

  eltek_dc_recupera: {
    description: 'Planta DC recupera — tensión de bus vuelve a nominal',
    roles: ['ELTEK'],
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { eltek_discharge: false } },
    ],
  },

  // spec_motor_m.md · Ola M4 — demo del motor M forense (flatline).
  // Congela `dc_bus_voltage` en su nominal y lo re-publica IDÉNTICO cada tick
  // (primitiva `hold` del sim): la serie plana (rango≈0) delata un sensor clavado
  // pese al report-by-exception. Enviar a UN Eltek del site.
  sensor_muerto: {
    description: 'Sensor clavado — lectura de tensión DC congelada (demo motor M4 flatline)',
    roles: ['ELTEK'],
    duration_ms: 120000,
    noCleanup: true,
    holdVars: ['dc_bus_voltage'],
    steps: [
      { at: 0, set: { dc_bus_voltage: -54.0 } },   // DEC-REF-123 — flote negativo
    ],
  },

  // spec_motor_m.md · Ola M5 — demo del motor M estadístico (variance/baseline).
  // Hace oscilar `dc_bus_voltage` con amplitud creciente (cada step publica por
  // superar el deadband): el buffer acumula lecturas muy dispersas → σ alta
  // (variance) y el último valor se aleja de la media (baseline z-score).
  vibracion_anomala: {
    description: 'Lectura inestable — dispersión creciente (demo motor M5 variance/baseline)',
    roles: ['ELTEK'],
    duration_ms: 90000,
    noCleanup: true,
    steps: [
      { at: 0,     set: { dc_bus_voltage: -54 } },   // DEC-REF-123 — oscila alrededor del flote negativo
      { at: 3000,  set: { dc_bus_voltage: -52 } },
      { at: 6000,  set: { dc_bus_voltage: -56 } },
      { at: 9000,  set: { dc_bus_voltage: -50 } },
      { at: 12000, set: { dc_bus_voltage: -58 } },
      { at: 15000, set: { dc_bus_voltage: -49 } },
      { at: 18000, set: { dc_bus_voltage: -59 } },
      { at: 21000, set: { dc_bus_voltage: -48 } },
    ],
  },

  // spec_motor_m.md · Ola M2 — demo del motor M multivariante (spread).
  // Enviar a UN Eltek del site: SOLO ese rectificador sube su carga (per-device
  // `_divergeHigh`) mientras los otros siguen ~30 A → desbalance del conjunto.
  // El motor M `spread` lo detecta y señala a ESTE como el equipo a intervenir.
  rect_divergencia: {
    description: 'Rectificador desbalanceado — un módulo se lleva mucha más carga que el resto (demo motor M2)',
    roles: ['ELTEK'],
    duration_ms: 180000,
    noCleanup: true,
    steps: [
      { at: 0, set: { _divergeHigh: true } },
    ],
  },

  rect_balance: {
    description: 'Rectificadores rebalanceados — la carga vuelve a repartirse',
    roles: ['ELTEK'],
    duration_ms: 60000,
    noCleanup: true,
    steps: [
      { at: 0, set: { _divergeHigh: false } },
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
    roles: ['CUMMINS'],
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { cummins_setpoint_suppressed: true } },
    ],
  },

  cummins_setpoint_restore: {
    description: 'Cummins PCC recupera publicación de setpoints',
    roles: ['CUMMINS'],
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
    roles: ['ATS'],
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
    roles: ['CUMMINS'],
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
  // DEC-REF-79-B-A — SECUENCIA RECOMENDADA. Desde spec_sim_cascada_energia (Qk4) el
  // escenario ya NO apaga las demás mediciones: solo fuel_level queda en manos del
  // escenario y el resto del Cummins sigue evolucionando. Disparado sobre motor en
  // reposo, el tanque baja con el motor apagado = firma del SIFONEO, no del consumo
  // (contradice DEC-REF-79 iii). Para una demo de autonomía:
  //   1) mains_failure_ats_transfer sobre el ATS (noCleanup deja motor
  //      corriendo por sharedState.gen_running)
  //   2) esperar 2-3 min para que el Cummins llegue a régimen
  //   3) fuel_drawdown sobre el Cummins → variables congeladas en valores
  //      de MOTOR CORRIENDO, que es lo correcto para simular consumo real
  fuel_drawdown: {
    description: 'Autonomía — baja el tanque cruzando umbrales 48h y 12h en 6 min',
    roles: ['CUMMINS'],
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

  // DEC-REF-104 D-4 (#78) — falla de presión de aceite con motor en marcha.
  // Apuntar al CUMMINS con el motor CORRIENDO (gen_running=true, p.ej. tras
  // mains_failure_ats_transfer o weekly_exercise): el flag hace que evolve
  // sostenga oil_pressure <100 kPa → las reglas A0/A1 (rpm>300 AND oil<200/100 kPa,
  // graceSec 60) disparan de forma genuina, no por transitorio.
  cummins_oil_failure: {
    description: 'Pérdida de presión de aceite con motor en marcha (sostenida)',
    roles: ['CUMMINS'],
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { cummins_oil_failure: true } },
    ],
  },

  cummins_oil_restore: {
    description: 'Presión de aceite recuperada',
    roles: ['CUMMINS'],
    duration_ms: 30000,
    noCleanup: true,
    steps: [
      { at: 0, sharedSet: { cummins_oil_failure: false } },
    ],
  },

  // ── DEC-REF-133 — inyección de fallas para EJERCITAR los traps que el sim no
  // alcanza en operación normal (coolant tope 95, rpm tope 1500, fault_code 0).
  // Pinean la falla (holdVars) y recuperan con un step de reset → el trap dispara
  // Y resuelve (ciclo completo), sin dejar la falla pegada. Disparar sobre un
  // device cummins: {command:'scenario', value:'<nombre>'} en simulator/<dId>/control.
  falla_sobretemperatura: {
    description: 'Sobretemperatura de motor (ejercita GE-04: coolant_temp > 105)',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['coolant_temp'],
    steps: [
      { at: 0,     set: { coolant_temp: 110 } },
      { at: 75000, set: { coolant_temp: 88 } },   // recupera → GE-04 resuelve
    ],
  },
  falla_sobrevelocidad: {
    description: 'Sobrevelocidad del motor (ejercita GE-07: rpm > 1725)',
    roles: ['CUMMINS'],
    duration_ms: 60000,
    holdVars: ['rpm'],
    steps: [
      { at: 0,     set: { rpm: 1800 } },
      { at: 45000, set: { rpm: 1500 } },           // recupera → GE-07 resuelve
    ],
  },
  falla_codigo_filtro_aire: {
    // Manual PCC 1302: el 488 es temperatura del múltiple de admisión alta (> 85 °C / 90 s), no filtro de aire.
    description: 'Código de falla 488 — temperatura de admisión alta (ejercita GE-12 eq 488 + GE-17 neq 0)',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['fault_code'],
    steps: [
      { at: 0,     set: { fault_code: 488 } },
      { at: 75000, set: { fault_code: 0 } },        // limpia → GE-12/17 resuelven
    ],
  },
  // Franco 2026-10-21 — reglas nuevas del PCC 1302 (manual A040D969).
  grupo_no_en_automatico: {
    description: 'Código 1463 — el control del grupo quedó fuera de Auto (ejercita GE-1463 + GE-17). Combinar con un corte de red: el grupo no arranca',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['fault_code'],
    steps: [
      { at: 0,     set: { fault_code: 1463 } },
      { at: 75000, set: { fault_code: 0 } },
    ],
  },
  modo_derivacion_activo: {
    description: 'Código 1131 — modo derivación (battle short): protecciones anuladas (ejercita GE-1131 + GE-17)',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['fault_code'],
    steps: [
      { at: 0,     set: { fault_code: 1131 } },
      { at: 75000, set: { fault_code: 0 } },
    ],
  },
  // Franco 2026-10-22 — regla «Refrigerante frío (grupo detenido)» (< 21 °C, 1 min).
  calefactor_bloque_caido: {
    description: 'Calefactor de bloque caído — con el grupo detenido el refrigerante baja a ~15 °C (ejercita «Refrigerante frío»). Se corrige con calefactor_bloque_normal o reset',
    roles: ['CUMMINS'],
    duration_ms: 3000,
    noCleanup: true,
    steps: [{ at: 0, sharedSet: { calefactor_caido: true } }],
  },
  calefactor_bloque_normal: {
    description: 'Calefactor de bloque reparado — el refrigerante vuelve a mantenerse tibio',
    roles: ['CUMMINS'],
    duration_ms: 3000,
    noCleanup: true,
    steps: [{ at: 0, sharedSet: { calefactor_caido: null } }],
  },
  falla_enlace_ecu: {
    description: 'Código de falla 781 — enlace motor↔ECU (ejercita GE-16 eq 781 + GE-17)',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['fault_code'],
    steps: [
      { at: 0,     set: { fault_code: 781 } },
      { at: 75000, set: { fault_code: 0 } },
    ],
  },
  falla_no_arranca: {
    description: 'Código de falla 1438 — no gira al arranque (ejercita AR-02 eq 1438 + GE-17)',
    roles: ['CUMMINS'],
    duration_ms: 90000,
    holdVars: ['fault_code'],
    steps: [
      { at: 0,     set: { fault_code: 1438 } },
      { at: 75000, set: { fault_code: 0 } },
    ],
  },

  // ── spec_sim_cascada_energia §6 — anomalías que ve el Wanomi Sense (no la controladora).
  // Fijan la anomalía en el estado del sitio y evolve mueve TODAS las mediciones afectadas de
  // forma coherente. Persisten hasta `sense_normal` o el reset del equipo. Correr con el grupo
  // en marcha (salvo agua y sensor de fábrica, que se ven también detenido).
  inyector_tapado: {
    description: 'Inyector tapado — un banco más frío, vibración de encendido alta (½ orden) y +6 % de consumo',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'inyector_tapado' } }],
  },
  inyector_goteando: {
    description: 'Inyector goteando — un banco más caliente, menos retorno de combustible y +10 % de consumo',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'inyector_goteando' } }],
  },
  filtro_aire_obstruido: {
    description: 'Filtro de aire obstruido — sube la restricción (ΔP), el escape se calienta y +5 % de consumo',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'filtro_aire_obstruido' } }],
  },
  filtro_combustible_tapado: {
    description: 'Filtro de combustible tapado — cae la presión de alimentación y el retorno',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'filtro_combustible_tapado' } }],
  },
  desbalance_mecanico: {
    description: 'Desbalance mecánico / anclajes flojos — vibración alta a 1× rpm (firma «anomaly»)',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'desbalance_mecanico' } }],
  },
  agua_en_combustible: {
    description: 'Agua en el combustible — el sensor del separador detecta agua',
    roles: ['GEN'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: 'agua_en_combustible' } }],
  },
  sensor_fabrica_miente: {
    description: 'Sensor de nivel de fábrica descalibrado — el Cummins marca +18 % sobre el tanque real (el Sense lee el real)',
    roles: ['GEN', 'CUMMINS'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { factory_fuel_offset: 18 } }],
  },
  sense_normal: {
    description: 'Vuelta a normal — sin anomalías del grupo y sensor de fábrica calibrado',
    roles: ['GEN', 'CUMMINS'], duration_ms: 3000, noCleanup: true,
    steps: [{ at: 0, sharedSet: { sense_fault: null, factory_fuel_offset: 0 } }],
  },

};

// Franco 2026-10-20 — equipo sin energía: el rectificador con el LVD abierto (sitio caído) no
// publica nada (su controlador se alimenta del mismo bus). device.js lo consulta en _publish.
function equipoSinEnergia(deviceState) { return !!(deviceState && deviceState._lvdAbierto); }

module.exports = {
  equipoSinEnergia,
  finEnfriamiento,
  initialSecState,
  initialGenState,
  initialAtsState,
  initialCumminsState,
  initialEltekState,   // SF-6 · DEC-REF-65.c
  evolve,
  SCENARIOS,
};
