const { evaluateD } = require('./evaluators/typeD');
const { evaluateC } = require('./evaluators/typeC');
const { evaluateS } = require('./evaluators/typeS');
const { evaluateCross } = require('./evaluators/typeCross');
const { evaluateM } = require('./evaluators/typeM');
const { notify }    = require('./notificationRouter');

// DEC-REF-122 — IDENTIDAD DE LA INSTANCIA DE ALARMA. El estado del motor
// (cooldownState, activeState, windowState) se clava por instancia, no por
// ruleId a secas: cross es por SITIO (`ruleId:siteCode`), el resto por EQUIPO
// (`ruleId:dId`). Antes todo se clavaba por `ruleId`, así que 2 equipos del
// mismo deviceType se pisaban (resolve cruzado, cooldown compartido). mState
// (typeM) y crossState (firedKey) ya eran por instancia → no se tocan.

function processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, crossState, activeState, mState, eventTs }) {
  const deviceState = siteState.get(dId) || {};
  const deviceType  = deviceState._deviceType || null;
  const siteCode    = deviceState._siteCode   || null;

  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.type === 'cross') {
        if (!siteCode) continue;
        // DEC-REF-122 — cross es por SITIO: instancia = ruleId:siteCode.
        const ck = `${rule.ruleId}:${siteCode}`;
        const res = evaluateCross(rule, siteState, crossState, eventTs, siteCode);
        if (res.fired) {
          // DEC-REF-65-A · propagamos sumTotal + thresholdUsed cuando la
          // regla es cross-con-hoja-sum (evaluateCross los expone). Reglas
          // cross-tree sin sum: res.sumTotal es undefined → value queda
          // null como antes (path DEC-REF-56-A intacto).
          fireAlarm({
            rule, value: res.sumTotal ?? null, deviceId: dId, stateKey: ck,
            reason: 'cross-tree-fired',
            mode: 'cross',
            thresholdUsed: res.thresholdUsed ?? null,
            cooldownState, siteState, activeState,
          });
        } else if (res.resolved) {
          // SF-4 · DEC-REF-64 — el evaluador cross reportó que la regla ACTIVA
          // dejó de cumplirse (transición firedKey true→delete). Sólo emite
          // resolve si estaba en activeState (defensa vs delete de una regla
          // que nunca fired en esta sesión, p.ej. tras un reload).
          if (activeState.has(ck)) {
            fireResolve({
              rule, deviceId: dId, stateKey: ck,
              reason: 'cross-tree-cleared',
              mode: 'resolve-by-condition',
              cooldownState, siteState, activeState,
            });
          }
        }
        continue;
      }

      if (rule.deviceType !== deviceType) continue;
      if (rule.variable   !== variable)   continue;

      // DEC-REF-122 — D/S/C son por EQUIPO: instancia = ruleId:dId.
      // (M `spread` re-ancla al equipo outlier dentro de su case → mkey.)
      const key = `${rule.ruleId}:${dId}`;

      let triggered = false;
      let evaluated = false;  // marca los cases que llegaron a evaluar
      switch (rule.type) {
        case 'D':
          triggered = evaluateD(rule, value);
          evaluated = true;
          break;
        case 'C': {
          const res = evaluateC(rule, value, deviceState);
          triggered = res.fired;
          if (triggered) {
            fireAlarm({
              rule, value, deviceId: dId, stateKey: key,
              reason: res.mode === 'fallback' ? 'threshold-fallback' : 'threshold-calibrated',
              mode: res.mode, thresholdUsed: res.thresholdUsed,
              cooldownState, siteState,
            });
          }
          // Sub-paso 2b: INFO de configuración cuando setpoint no disponible (DEC-REF-24)
          if (res.mode === 'fallback' || res.mode === 'no-ref') {
            const noSetpointKey = `${key}:no-setpoint`;
            const startKey      = `${key}:no-setpoint:start`;
            const escalatedKey  = `${key}:no-setpoint:escalated`;

            // EDGE-2: marca de inicio del episodio (tiempo-de-eventos). Nace la primera vez que falta el setpoint.
            if (!cooldownState.has(startKey)) {
              cooldownState.set(startKey, Date.now());
            }

            // INFO de configuración (cooldown propio, intacto)
            const lastNoSetpoint = cooldownState.get(noSetpointKey) || 0;
            const cooldownMs = (rule.cooldownMinutes || 60) * 60 * 1000;
            if (Date.now() - lastNoSetpoint > cooldownMs) {
              cooldownState.set(noSetpointKey, Date.now());
              notify({
                ruleId:         rule.ruleId,
                inferenceId:    rule.inferenceId,
                label:          rule.label,
                variableLabel:  rule.variableLabel || '',
                unit:           rule.unit || '',
                severity:       'info',
                recommendation: `Setpoint de "${rule.variableLabel || rule.variable}" no disponible en siteState. Verificar configuración del controlador y variable "${rule.setpointSource?.variable || 'no definida'}".`,
                deviceId:       dId,
                deviceName:     deviceState._deviceName || dId,
                variable:       rule.variable,
                value,
                mode:           res.mode,
                thresholdUsed:  res.thresholdUsed,
                userId:         deviceState._userId || '',
                ts:             new Date().toISOString(),
                reason:         'setpoint-unavailable',
              });
            }

            // EDGE-2: escalada temporal INFO→warning (ATENCIÓN). Opt-in, una sola vez por episodio.
            if (rule.escalateAfterMinutes != null && !cooldownState.has(escalatedKey)) {
              const episodeStart = cooldownState.get(startKey);
              const escalateMs   = rule.escalateAfterMinutes * 60 * 1000;
              if (Date.now() - episodeStart >= escalateMs) {
                cooldownState.set(escalatedKey, Date.now());  // marca idempotente: no re-emitir ni re-bypass
                // DEC-REF-66-B (#45/R22): la escalada pinta el pin warning
                // (DEC-REF-27) — marcar activeState para que el reset
                // calibrado pueda emitir fireResolve simétrico.
                if (activeState) activeState.set(key, Date.now());
                notify({
                  ruleId:         rule.ruleId,
                  inferenceId:    rule.inferenceId,
                  label:          rule.label,
                  variableLabel:  rule.variableLabel || '',
                  unit:           rule.unit || '',
                  severity:       'warning',
                  recommendation: `Setpoint de "${rule.variableLabel || rule.variable}" sigue no disponible tras ${rule.escalateAfterMinutes} min. Revisar configuración del controlador con prioridad.`,
                  deviceId:       dId,
                  deviceName:     deviceState._deviceName || dId,
                  variable:       rule.variable,
                  value,
                  mode:           res.mode,
                  thresholdUsed:  res.thresholdUsed,
                  userId:         deviceState._userId || '',
                  ts:             new Date().toISOString(),
                  reason:         'setpoint-unavailable-escalated',
                });
              }
            }
          } else if (res.mode === 'calibrated') {
            // EDGE-2 reset: el setpoint reapareció → cerrar el episodio.
            // DEC-REF-66-B (#45/R22): si el episodio HABÍA escalado (pin
            // warning visible al operador vía DEC-REF-64.a), emitir
            // fireResolve simétrico. El INFO sin escalada (DEC-REF-27,
            // no pinta pin) sigue cerrando en silencio.
            const escalatedKey = `${key}:no-setpoint:escalated`;
            if (cooldownState.has(escalatedKey)) {
              fireResolve({
                rule, deviceId: dId, stateKey: key,
                reason: 'setpoint-recovered',
                mode:   'resolve-by-setpoint-recovered',
                recommendation: `Resuelto: setpoint de "${rule.variableLabel || rule.variable}" recuperado.`,
                cooldownState, siteState, activeState,
              });
            }
            cooldownState.delete(`${key}:no-setpoint`);
            cooldownState.delete(`${key}:no-setpoint:start`);
            cooldownState.delete(escalatedKey);
          }
          continue;
        }
        case 'S': {
          const { fired, count, windowActual } = evaluateS(rule, value, windowState, dId);
          if (fired) {
            fireAlarm({
              rule, value, deviceId: dId, stateKey: key,
              reason: 'window',
              thresholdUsed: rule.window?.countThreshold,
              mode: 'window',
              cooldownState, siteState, activeState,
            });
          } else if (activeState.has(key) && count < (rule.window?.countThreshold || 1)) {
            // SF-4 · DEC-REF-64 + DEC-REF-122 (A2) — resolver SOLO cuando la ventana
            // deslizante ya NO cumple el countThreshold (no ante cualquier no-match).
            fireResolve({
              rule, deviceId: dId, stateKey: key,
              reason: 'window-cleared',
              mode: 'resolve-by-condition',
              cooldownState, siteState, activeState,
            });
          }
          continue;
        }
        case 'M': {
          // spec_motor_m.md — soft sensor: métrica derivada vs condition.
          // M2 multivariante (spread) puede devolver `outlierDId` = el equipo
          // puntual a intervenir (A+B): la alarma se ancla a ESE device.
          const res = evaluateM(rule, value, { mState, dId, eventTs, siteState, siteCode });
          if (res.detail) continue;   // insufficient/maturing/unsupported → sin señal
          const targetDId = res.outlierDId || dId;
          // DEC-REF-122 — la instancia M se ancla al equipo objetivo (spread → outlier).
          const mkey = `${rule.ruleId}:${targetDId}`;
          if (res.fired) {
            fireAlarm({
              rule, value: res.metricValue, deviceId: targetDId, stateKey: mkey,
              reason: 'soft-sensor', mode: 'M',
              thresholdUsed: rule.condition ? rule.condition.value : null,
              cooldownState, siteState, activeState,
            });
          } else if (activeState.has(mkey)) {
            fireResolve({
              rule, deviceId: targetDId, stateKey: mkey,
              reason: 'soft-sensor-cleared', mode: 'M',
              cooldownState, siteState, activeState,
            });
          }
          continue;
        }
        default:
          console.warn(`[ruleEngine] Tipo desconocido '${rule.type}' en regla ${rule.ruleId}`);
          continue;
      }
      if (evaluated && triggered) {
        // DEC-REF-102 D-2 — un fire cancela un resolve pendiente: la alarma
        // sigue activa y NO se re-notifica (el cooldown de fireAlarm gobierna).
        cooldownState.delete(`${key}:resolveStart`);
        fireAlarm({ rule, value, deviceId: dId, stateKey: key, reason: 'threshold',
                    thresholdUsed: rule.condition?.value, cooldownState, siteState, activeState });
      } else if (evaluated && !triggered && rule.type === 'D' && activeState.has(key)) {
        // SF-4 · DEC-REF-64 — transición activa→inactiva en typeD: el mensaje
        // recibido para esta variable no cumple la condition. Cierra el evento.
        // Restricción a type 'D': para type 'C' la semántica no-ref/fallback
        // no equivale a "condición resuelta" — queda como pendiente (ver
        // DEC-REF-64.c: la ventana temporal cubre C hasta que se aclare).
        // DEC-REF-102 D-2 — persistencia del resolve: con resolveGraceSec > 0
        // la condición debe permanecer NO cumplida durante esa ventana antes
        // de emitir el resolve; un valor que vuelve a cruzar el umbral dentro
        // de la ventana cancela el cierre (rama triggered, arriba).
        const resolveGraceMs = (rule.resolveGraceSec || 0) * 1000;
        if (resolveGraceMs === 0) {
          fireResolve({
            rule, deviceId: dId, stateKey: key,
            reason: 'threshold-cleared',
            mode: 'resolve-by-condition',
            cooldownState, siteState, activeState,
          });
        } else {
          const rsKey = `${key}:resolveStart`;
          if (!cooldownState.has(rsKey)) {
            cooldownState.set(rsKey, Date.now());
          } else if (Date.now() - cooldownState.get(rsKey) >= resolveGraceMs) {
            cooldownState.delete(rsKey);
            fireResolve({
              rule, deviceId: dId, stateKey: key,
              reason: 'threshold-cleared',
              mode: 'resolve-by-condition',
              cooldownState, siteState, activeState,
            });
          }
        }
      } else if (evaluated && !triggered && rule.type === 'D') {
        // Regla inactiva y condición no cumplida — limpiar un resolveStart
        // huérfano (p.ej. quedó de un episodio anterior ya resuelto).
        cooldownState.delete(`${key}:resolveStart`);
      }
    }
  }
}

// spec_motor_m.md §8-D3 (Ola M4) — tick periódico para `staleness`: el silencio
// NO llega por mensaje entrante (si el equipo dejó de publicar, no hay evento que
// dispare la evaluación). Un setInterval en index.js llama a esto: recorre las
// reglas M `staleness` y, por cada device de su deviceType, mide (ahora − últimoTs)
// en mState y entra al MISMO camino de emisión (fire/resolve/cooldown) que el resto.
// El resolve al reconectar lo emite el camino de mensaje (processMessage · case M).
function processStalenessTick({ packs, siteState, cooldownState, activeState, mState }) {
  const now = Date.now();
  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.type !== 'M' || rule.metric !== 'staleness') continue;
      for (const [dId, devState] of siteState) {
        if (!devState || devState._deviceType !== rule.deviceType) continue;
        const key = `${rule.ruleId}:${dId}`;   // DEC-REF-122 — staleness es por equipo
        const res = evaluateM(rule, null, { mState, dId, eventTs: now, siteState, tick: true });
        if (res.detail) continue;   // insufficient (device sin muestras aún) → sin señal
        if (res.fired) {
          fireAlarm({
            rule, value: res.metricValue, deviceId: dId, stateKey: key,
            reason: 'stale', mode: 'M',
            thresholdUsed: rule.condition ? rule.condition.value : null,
            cooldownState, siteState, activeState,
          });
        } else if (activeState.has(key)) {
          fireResolve({
            rule, deviceId: dId, stateKey: key,
            reason: 'stale-cleared', mode: 'M',
            cooldownState, siteState, activeState,
          });
        }
      }
    }
  }
}

// stateKey (DEC-REF-122): identidad de la instancia; el caller la calcula y la
// pasa. Fallback a `rule.ruleId` si no viene (compat defensiva).
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
    label:             rule.label,
    variableLabel:     rule.variableLabel || '',
    severity:          rule.severity,
    recommendation:    rule.recommendation,
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
    label:             rule.label,
    variableLabel:     rule.variableLabel || '',
    severity:          rule.severity,
    recommendation:    recommendation || ('Alarma resuelta: ' + (rule.label || rule.ruleId)),
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

module.exports = { processMessage, processStalenessTick, fireResolve };
