const { evaluateD, resolveClears, effectiveCondition } = require('./evaluators/typeD');
const { evaluateC } = require('./evaluators/typeC');
const { evaluateS } = require('./evaluators/typeS');
const { evaluateCrossTree } = require('./evaluators/typeCross');
const { evaluateM } = require('./evaluators/typeM');
const { notify }    = require('./notificationRouter');

// DEC-REF-130 (A13) — cadencia del INFO "setpoint no disponible" (aviso de config de
// baja prioridad): constante EXPLÍCITA. Antes se leía `rule.cooldownMinutes`, un campo
// inexistente en el schema → quedaba fija en 60 min sin que nadie lo decidiera.
const NO_SETPOINT_INFO_COOLDOWN_MS = 60 * 60 * 1000;

// DEC-REF-122 — IDENTIDAD DE LA INSTANCIA DE ALARMA. El estado del motor
// (cooldownState, activeState, windowState) se clava por instancia, no por
// ruleId a secas: cross es por SITIO (`ruleId:siteCode`), el resto por EQUIPO
// (`ruleId:dId`). Antes todo se clavaba por `ruleId`, así que 2 equipos del
// mismo deviceType se pisaban (resolve cruzado, cooldown compartido). mState
// (typeM) y crossState (firedKey) ya eran por instancia → no se tocan.

// spec_grafcet_g1 · G1a (DEC-REF-145) — cada tipo calcula su RECEPTIVIDAD y la entrega
// al GRAFCET de la instancia (ruleFsm). La espera (graceSec), la histéresis, el cierre
// (resolveGraceSec), "sin datos" y si la alarma está abierta viven SOLO en el FSM;
// fireAlarm/fireResolve son las ACCIONES de sus transiciones (callbacks en index.js).
//   'on' = se cumple · 'band' = no se cumple pero sigue en la banda de histéresis
//   'off' = no se cumple y cruzó la banda · null = no evaluable
const toR = (val) => (val === null || val === undefined ? null : (val ? 'on' : 'off'));

function processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, activeState, mState, eventTs, fsm }) {
  const deviceState = siteState.get(dId) || {};
  const deviceType  = deviceState._deviceType || null;
  const siteCode    = deviceState._siteCode   || null;

  for (const pack of packs) {
    for (let rule of pack.rules) {
      // Auditoría 2026-10-14 (M-03) — aislamiento por regla: una regla mal formada
      // (p.ej. type C sin condition) NO puede tirar el proceso.
      try {
        if (rule.type === 'cross') {
          if (!siteCode) continue;
          // DEC-REF-122 — cross es por SITIO: instancia = ruleId:siteCode.
          const ck = `${rule.ruleId}:${siteCode}`;
          const res = evaluateCrossTree(rule, siteState, eventTs, siteCode);
          // DEC-REF-65-A — sumTotal + thresholdUsed viajan a la notificación (hoja sum).
          fsm.evaluate(rule, ck, toR(res.val), {
            dId, value: res.total ?? null, thresholdUsed: res.thresholdUsed ?? null,
            reason: 'cross-tree-fired', mode: 'cross', resolveReason: 'cross-tree-cleared',
          }, eventTs);
          continue;
        }

        if (rule.deviceType !== deviceType) continue;
        if (rule.variable   !== variable)   continue;
        // spec_cascada_ficha C3 — umbral relativo a la instalación (ej. batería 24 V).
        if (rule.condition && rule.condition.scaleRef) {
          rule = { ...rule, condition: effectiveCondition(rule.condition, deviceState) };
        }

        // DEC-REF-122 — D/S/C son por EQUIPO: instancia = ruleId:dId.
        const key = `${rule.ruleId}:${dId}`;

        switch (rule.type) {
          case 'D': {
            // M-07 — null = no evaluable (dato malo/ausente).
            let r = evaluateD(rule, value);
            // C2 — precondición del límite de ficha (ej. solo con el motor en marcha).
            const wh = rule.condition && rule.condition.when;
            if (wh && r !== null) {
              const w = evaluateD({ ruleId: `${rule.ruleId}:when`, condition: { op: wh.op, value: wh.value } }, deviceState[wh.variable]);
              if (w === null) r = null; else if (w === false) r = false;
            }
            // DEC-REF-132 — histéresis: no cumplida pero sin cruzar la banda = 'band'.
            const R = r === null ? null : (r ? 'on' : (resolveClears(rule, value) ? 'off' : 'band'));
            fsm.evaluate(rule, key, R, {
              dId, value, thresholdUsed: rule.condition ? rule.condition.value : null,
              reason: 'threshold', mode: 'direct', resolveReason: 'threshold-cleared',
            }, eventTs);
            break;
          }
          case 'C': {
            const res = evaluateC(rule, value, deviceState);
            // INFO de configuración + escalada EDGE-2 cuando falta el setpoint: avisos de
            // CONFIGURACIÓN, fuera del GRAFCET (spec §5). Se resuelve ANTES de entregar la
            // receptividad: cierra la escalada y libera la clave (M-16).
            if (res.mode === 'fallback' || res.mode === 'no-ref') {
              handleNoSetpoint({ rule, key, dId, value, res, deviceState, cooldownState, activeState });
            } else if (res.mode === 'calibrated') {
              const escalatedKey = `${key}:no-setpoint:escalated`;
              if (cooldownState.has(escalatedKey)) {
                fireResolve({
                  rule, deviceId: dId, stateKey: key,
                  reason: 'setpoint-recovered', mode: 'resolve-by-setpoint-recovered',
                  recommendation: `Resuelto: setpoint de "${rule.variableLabel || rule.variable}" recuperado.`,
                  cooldownState, siteState, activeState,
                });
              }
              cooldownState.delete(`${key}:no-setpoint`);
              cooldownState.delete(`${key}:no-setpoint:start`);
              cooldownState.delete(escalatedKey);
            }
            // Receptividad: calibrado → su resultado; respaldo → el D de respaldo (ahora
            // también CIERRA, M-15); sin referencia → alarma solo si on_missing_ref:'alarm',
            // si no, no evaluable.
            const R = res.mode === 'no-ref' ? (res.fired ? 'on' : null) : toR(res.fired);
            fsm.evaluate(rule, key, R, {
              dId, value, thresholdUsed: res.thresholdUsed,
              reason: res.mode === 'fallback' ? 'threshold-fallback' : (res.mode === 'no-ref' ? 'no-ref' : 'threshold-calibrated'),
              mode: res.mode, resolveReason: 'threshold-cleared',
            }, eventTs);
            break;
          }
          case 'S': {
            const { fired } = evaluateS(rule, value, windowState, dId);
            fsm.evaluate(rule, key, fired ? 'on' : 'off', {
              dId, value, thresholdUsed: rule.window ? rule.window.countThreshold : null,
              reason: 'window', mode: 'window', resolveReason: 'window-cleared',
            }, eventTs);
            break;
          }
          case 'M': {
            // spec_motor_m — soft sensor. spread puede anclar la instancia al equipo outlier.
            const res = evaluateM(rule, value, { mState, dId, eventTs, siteState, siteCode });
            const targetDId = res.outlierDId || dId;
            const mkey = `${rule.ruleId}:${targetDId}`;
            // Q1 — no evaluable (insufficient/maturing/unsupported) = Sin datos: una alarma
            // abierta SIGUE abierta (antes se cerraba, ruleEngine A5).
            const R = res.detail ? null : toR(res.fired);
            fsm.evaluate(rule, mkey, R, {
              dId: targetDId, value: res.detail ? null : res.metricValue,
              thresholdUsed: rule.condition ? rule.condition.value : null,
              reason: 'soft-sensor', mode: 'M', resolveReason: 'soft-sensor-cleared',
            }, eventTs);
            break;
          }
          default:
            console.warn(`[ruleEngine] Tipo desconocido '${rule.type}' en regla ${rule.ruleId}`);
        }
      } catch (err) {
        console.error(`[ruleEngine] Regla ${rule && rule.ruleId} falló evaluando ${dId}/${variable} — omitida: ${err && (err.stack || err.message)}`);
      }
    }
  }
}

// DEC-REF-24 / EDGE-2 — INFO "setpoint no disponible" + escalada opt-in a warning.
// Sin cambios de comportamiento respecto de antes de G1a; solo se movió de lugar.
function handleNoSetpoint({ rule, key, dId, value, res, deviceState, cooldownState, activeState }) {
  const noSetpointKey = `${key}:no-setpoint`;
  const startKey      = `${key}:no-setpoint:start`;
  const escalatedKey  = `${key}:no-setpoint:escalated`;
  if (!cooldownState.has(startKey)) cooldownState.set(startKey, Date.now());
  const lastNoSetpoint = cooldownState.get(noSetpointKey) || 0;
  if (Date.now() - lastNoSetpoint > NO_SETPOINT_INFO_COOLDOWN_MS) {
    cooldownState.set(noSetpointKey, Date.now());
    notify({
      ruleId: rule.ruleId, inferenceId: rule.inferenceId, label: rule.label,
      variableLabel: rule.variableLabel || '', unit: rule.unit || '', severity: 'info',
      recommendation: `Setpoint de "${rule.variableLabel || rule.variable}" no disponible en siteState. Verificar configuración del controlador y variable "${rule.setpointSource?.variable || 'no definida'}".`,
      deviceId: dId, deviceName: deviceState._deviceName || dId, variable: rule.variable, value,
      mode: res.mode, thresholdUsed: res.thresholdUsed, userId: deviceState._userId || '',
      ts: new Date().toISOString(), reason: 'setpoint-unavailable',
    });
  }
  if (rule.escalateAfterMinutes != null && !cooldownState.has(escalatedKey)) {
    const episodeStart = cooldownState.get(startKey);
    if (Date.now() - episodeStart >= rule.escalateAfterMinutes * 60 * 1000) {
      cooldownState.set(escalatedKey, Date.now());
      // DEC-REF-66-B — la escalada pinta pin warning: marcar activo para el resolve simétrico.
      if (activeState) activeState.set(key, Date.now());
      notify({
        ruleId: rule.ruleId, inferenceId: rule.inferenceId, label: rule.label,
        variableLabel: rule.variableLabel || '', unit: rule.unit || '', severity: 'warning',
        recommendation: `Setpoint de "${rule.variableLabel || rule.variable}" sigue no disponible tras ${rule.escalateAfterMinutes} min. Revisar configuración del controlador con prioridad.`,
        deviceId: dId, deviceName: deviceState._deviceName || dId, variable: rule.variable, value,
        mode: res.mode, thresholdUsed: res.thresholdUsed, userId: deviceState._userId || '',
        ts: new Date().toISOString(), reason: 'setpoint-unavailable-escalated',
      });
    }
  }
}

// spec_motor_m §8-D3 — tick de `staleness`: el silencio no llega por mensaje. Recorre las
// reglas staleness y, por cada equipo de su deviceType, entrega la receptividad al FSM.
function processStalenessTick({ packs, siteState, mState, fsm }) {
  const now = Date.now();
  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.type !== 'M' || rule.metric !== 'staleness') continue;
      for (const [dId, devState] of siteState) {
        if (!devState || devState._deviceType !== rule.deviceType) continue;
        const key = `${rule.ruleId}:${dId}`;   // DEC-REF-122 — por equipo
        const res = evaluateM(rule, null, { mState, dId, eventTs: now, siteState, tick: true });
        if (res.detail && !fsm.get(key)) continue;   // equipo nunca visto y sin instancia: nada que decir
        fsm.evaluate(rule, key, res.detail ? null : toR(res.fired), {
          dId, value: res.detail ? null : res.metricValue,
          thresholdUsed: rule.condition ? rule.condition.value : null,
          reason: 'stale', mode: 'M', resolveReason: 'stale-cleared',
        }, now);
      }
    }
  }
}

// stateKey (DEC-REF-122): identidad de la instancia; el caller la calcula y la
// pasa. Fallback a `rule.ruleId` si no viene (compat defensiva).
// spec_cascada_ficha — `{umbral}` en label/recommendation → valor vigente (fuente única).
const { fillThreshold } = require('../app/api/services/limitRef');

function fireAlarm({ rule, value, deviceId, stateKey, reason, mode, thresholdUsed, cooldownState, siteState, activeState }) {
  const now       = Date.now();
  const key       = stateKey || rule.ruleId;
  // DEC-REF-122 (anti-refire · A3) — si ya hay una alarma ABIERTA para esta
  // instancia, NO re-notificar: el cooldown gobierna solo el primer fire y el
  // re-disparo TRAS un resolve (que limpia activeState). cross ya suprimía vía
  // firedKey; esto unifica D/S/M. (typeC no pasa activeState → no aplica acá.)
  if (activeState && activeState.has(key)) return;
  const lastFired = cooldownState.get(key) || 0;
  const cooldownMs = (rule.cooldownSec || 0) * 1000;

  if (now - lastFired < cooldownMs) return;

  cooldownState.set(key, now);
  // SF-4 · DEC-REF-64.a — marca la INSTANCIA como ACTIVA. La transición
  // activa→inactiva (typeD/S post-!triggered, typeCross delete(firedKey),
  // o cleanup por reload D3) emitirá resolve al ver este flag y borrarlo.
  if (activeState) activeState.set(key, now);

  const devState = siteState ? siteState.get(deviceId) || {} : {};

  const alarm = {
    ruleId:            rule.ruleId,
    userId:            devState._userId     || '',
    deviceName:        devState._deviceName || '',
    inferenceId:       rule.inferenceId,
    label:             fillThreshold(rule.label, rule, thresholdUsed),
    variableLabel:     rule.variableLabel || '',
    severity:          rule.severity,
    recommendation:    fillThreshold(rule.recommendation, rule, thresholdUsed),
    unit:              rule.unit || '',
    correlationParent: rule.correlationParent,
    deviceId,
    variable:          rule.variable,
    value,
    reason,
    mode:              mode || 'direct',
    thresholdUsed:     thresholdUsed !== undefined ? thresholdUsed : null,
    kind:              'fire',
    ts:                new Date().toISOString(),
  };

  notify(alarm);
}

// SF-4 · DEC-REF-64 — fireResolve: emisión de evento resolve.
// Simétrico a fireAlarm pero SIN cooldown propio (el activeState.has
// garantiza que solo se emita cuando había fire vigente — el spam se
// controla ahí). Borra el flag activo antes de notify() por el mismo
// motivo: si notify tarda y otro path evalúa la regla en el intertanto,
// no re-emite resolve por la misma transición.
function fireResolve({ rule, deviceId, stateKey, reason, mode, recommendation, cooldownState, siteState, activeState }) {
  const key = stateKey || rule.ruleId;   // DEC-REF-122 — por instancia
  if (!activeState || !activeState.has(key)) return;
  activeState.delete(key);
  // DEC-REF-102 D-1 (#77) — el cooldown de fire SÍ se limpia al resolver:
  // una recurrencia genuina de la falla después del cierre debe notificar de
  // inmediato (antes quedaba muda hasta cooldownSec — medido con G2: 900 s de
  // silencio tras resolve, "las alarmas no saltan"). La protección anti-flap
  // que el cooldown cubría acá migra al resolve persistente
  // (resolveGraceSec, DEC-REF-102 D-2): quien evita la ráfaga fire/resolve es
  // la ventana de persistencia, no el silencio del re-disparo.
  cooldownState.delete(key);

  const devState = siteState ? siteState.get(deviceId) || {} : {};

  const alarm = {
    ruleId:            rule.ruleId,
    userId:            devState._userId     || '',
    deviceName:        devState._deviceName || '',
    inferenceId:       rule.inferenceId,
    label:             fillThreshold(rule.label, rule),
    variableLabel:     rule.variableLabel || '',
    severity:          rule.severity,
    recommendation:    recommendation || ('Alarma resuelta: ' + (fillThreshold(rule.label, rule) || rule.ruleId)),
    unit:              rule.unit || '',
    correlationParent: rule.correlationParent,
    deviceId,
    variable:          rule.variable,
    value:             null,
    reason,
    mode:              mode || 'resolve-by-condition',
    thresholdUsed:     null,
    kind:              'resolve',
    ts:                new Date().toISOString(),
  };

  notify(alarm);
}

// spec_grafcet_g1c (DEC-REF-148) — "al modificarse la regla vuelve a Vigilando y repite el
// proceso": tras una edición (la instancia ya volvió a E1), reevalúa AL INSTANTE con el último
// valor conocido de cada equipo. Solo D, C y cross: S y M no admiten reinyectar un valor
// repetido (contaría dos veces en su ventana/buffer) → repiten el proceso con el próximo dato.
function reevaluateRules({ ruleIds, packs, siteState, cooldownState, windowState, activeState, mState, fsm, now }) {
  const set = new Set(ruleIds || []);
  const ts = now || Date.now();
  let n = 0;
  for (const pack of packs) {
    for (const rule of (pack.rules || [])) {
      if (!set.has(rule.ruleId) || !['D', 'C', 'cross'].includes(rule.type)) continue;
      const sub = [{ rules: [rule] }];
      const ctx = { siteState, packs: sub, cooldownState, windowState, activeState, mState, eventTs: ts, fsm };
      if (rule.type === 'cross') {
        for (const [dId, ds] of siteState) {
          if (ds && ds._siteCode) { processMessage({ dId, variable: null, value: null, ...ctx }); n++; break; }
        }
        continue;
      }
      for (const [dId, ds] of siteState) {
        if (!ds || ds._deviceType !== rule.deviceType || ds[rule.variable] === undefined) continue;
        processMessage({ dId, variable: rule.variable, value: ds[rule.variable], ...ctx });
        n++;
      }
    }
  }
  return n;
}

// spec_grafcet_g1c (DEC-REF-148 · Qe1) — "Sin datos" por SILENCIO del equipo. En cada tick,
// toda instancia cuyo equipo lleva más de silenceMs sin mensajes (`_lastSeen`) recibe
// receptividad nula → E5 desde cualquier etapa. Protocolo: no abre ni cierra alarmas; se
// queda en E5 HASTA QUE LLEGUE EL DATO (el próximo mensaje la saca: T51/T53).
// Fuera: `staleness` (mide justamente el silencio) y cross (sus hojas ya controlan frescura).
// Caso raro #7: sin mensajes desde el arranque, el reloj corre desde `startedAt`.
function processSilenceTick({ ruleById, siteState, fsm, silenceMs, startedAt, now }) {
  const ts = now || Date.now();
  let n = 0;
  for (const inst of fsm.instances.values()) {
    if (inst.step === 'E5') continue;
    const rule = ruleById.get(inst.ruleId);
    if (!rule || rule.type === 'cross' || (rule.type === 'M' && rule.metric === 'staleness')) continue;
    const ds = inst.dId ? siteState.get(inst.dId) : null;
    if (!ds) continue;
    const last = Math.max(Number(ds._lastSeen) || 0, startedAt || 0);
    if (ts - last <= silenceMs) continue;
    fsm.evaluate(rule, inst.key, null, { dId: inst.dId, value: null, reason: 'silence' }, ts);
    n++;
  }
  return n;
}

module.exports = { processMessage, processStalenessTick, processSilenceTick, reevaluateRules, fireAlarm, fireResolve };
