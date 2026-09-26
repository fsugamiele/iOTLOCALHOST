const { evaluateD } = require('./evaluators/typeD');
const { evaluateC } = require('./evaluators/typeC');
const { evaluateS } = require('./evaluators/typeS');
const { evaluateCross } = require('./evaluators/typeCross');
const { evaluateM } = require('./evaluators/typeM');
const { notify }    = require('./notificationRouter');

function processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, crossState, activeState, mState, eventTs }) {
  const deviceState = siteState.get(dId) || {};
  const deviceType  = deviceState._deviceType || null;
  const siteCode    = deviceState._siteCode   || null;

  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.type === 'cross') {
        if (!siteCode) continue;
        const res = evaluateCross(rule, siteState, crossState, eventTs, siteCode);
        if (res.fired) {
          // DEC-REF-65-A · propagamos sumTotal + thresholdUsed cuando la
          // regla es cross-con-hoja-sum (evaluateCross los expone). Reglas
          // cross-tree sin sum: res.sumTotal es undefined → value queda
          // null como antes (path DEC-REF-56-A intacto).
          fireAlarm({
            rule, value: res.sumTotal ?? null, deviceId: dId,
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
          if (activeState.has(rule.ruleId)) {
            fireResolve({
              rule, deviceId: dId,
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
              rule, value, deviceId: dId,
              reason: res.mode === 'fallback' ? 'threshold-fallback' : 'threshold-calibrated',
              mode: res.mode, thresholdUsed: res.thresholdUsed,
              cooldownState, siteState,
            });
          }
          // Sub-paso 2b: INFO de configuración cuando setpoint no disponible (DEC-REF-24)
          if (res.mode === 'fallback' || res.mode === 'no-ref') {
            const noSetpointKey = `${rule.ruleId}:no-setpoint`;
            const startKey      = `${rule.ruleId}:no-setpoint:start`;
            const escalatedKey  = `${rule.ruleId}:no-setpoint:escalated`;

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
                if (activeState) activeState.set(rule.ruleId, Date.now());
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
            const escalatedKey = `${rule.ruleId}:no-setpoint:escalated`;
            if (cooldownState.has(escalatedKey)) {
              fireResolve({
                rule, deviceId: dId,
                reason: 'setpoint-recovered',
                mode:   'resolve-by-setpoint-recovered',
                recommendation: `Resuelto: setpoint de "${rule.variableLabel || rule.variable}" recuperado.`,
                cooldownState, siteState, activeState,
              });
            }
            cooldownState.delete(`${rule.ruleId}:no-setpoint`);
            cooldownState.delete(`${rule.ruleId}:no-setpoint:start`);
            cooldownState.delete(escalatedKey);
          }
          continue;
        }
        case 'S': {
          const { fired, count, windowActual } = evaluateS(rule, value, windowState);
          if (fired) {
            fireAlarm({
              rule, value, deviceId: dId,
              reason: 'window',
              thresholdUsed: rule.window?.countThreshold,
              mode: 'window',
              cooldownState, siteState, activeState,
            });
          } else if (activeState.has(rule.ruleId)) {
            // SF-4 · DEC-REF-64 — transición activa→inactiva en typeS: la
            // ventana ya no acumula suficientes events. Cierra el evento.
            fireResolve({
              rule, deviceId: dId,
              reason: 'window-cleared',
              mode: 'resolve-by-condition',
              cooldownState, siteState, activeState,
            });
          }
          continue;
        }
        case 'M': {
          // spec_motor_m.md — soft sensor: métrica derivada vs condition.
          const res = evaluateM(rule, value, { mState, dId, eventTs });
          if (res.detail) continue;   // insufficient/maturing/unsupported → sin señal
          if (res.fired) {
            fireAlarm({
              rule, value: res.metricValue, deviceId: dId,
              reason: 'soft-sensor', mode: 'M',
              thresholdUsed: rule.condition ? rule.condition.value : null,
              cooldownState, siteState, activeState,
            });
          } else if (activeState.has(rule.ruleId)) {
            fireResolve({
              rule, deviceId: dId,
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
        cooldownState.delete(`${rule.ruleId}:resolveStart`);
        fireAlarm({ rule, value, deviceId: dId, reason: 'threshold',
                    thresholdUsed: rule.condition?.value, cooldownState, siteState, activeState });
      } else if (evaluated && !triggered && rule.type === 'D' && activeState.has(rule.ruleId)) {
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
            rule, deviceId: dId,
            reason: 'threshold-cleared',
            mode: 'resolve-by-condition',
            cooldownState, siteState, activeState,
          });
        } else {
          const rsKey = `${rule.ruleId}:resolveStart`;
          if (!cooldownState.has(rsKey)) {
            cooldownState.set(rsKey, Date.now());
          } else if (Date.now() - cooldownState.get(rsKey) >= resolveGraceMs) {
            cooldownState.delete(rsKey);
            fireResolve({
              rule, deviceId: dId,
              reason: 'threshold-cleared',
              mode: 'resolve-by-condition',
              cooldownState, siteState, activeState,
            });
          }
        }
      } else if (evaluated && !triggered && rule.type === 'D') {
        // Regla inactiva y condición no cumplida — limpiar un resolveStart
        // huérfano (p.ej. quedó de un episodio anterior ya resuelto).
        cooldownState.delete(`${rule.ruleId}:resolveStart`);
      }
    }
  }
}

function fireAlarm({ rule, value, deviceId, reason, mode, thresholdUsed, cooldownState, siteState, activeState }) {
  const now       = Date.now();
  const lastFired = cooldownState.get(rule.ruleId) || 0;
  const cooldownMs = (rule.cooldownSec || 0) * 1000;

  if (now - lastFired < cooldownMs) return;

  cooldownState.set(rule.ruleId, now);
  // SF-4 · DEC-REF-64.a — marca la regla como ACTIVA. La transición
  // activa→inactiva (typeD/S post-!triggered, typeCross delete(firedKey),
  // o cleanup por reload D3) emitirá resolve al ver este flag y borrarlo.
  if (activeState) activeState.set(rule.ruleId, now);

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
function fireResolve({ rule, deviceId, reason, mode, recommendation, cooldownState, siteState, activeState }) {
  if (!activeState || !activeState.has(rule.ruleId)) return;
  activeState.delete(rule.ruleId);
  // DEC-REF-102 D-1 (#77) — el cooldown de fire SÍ se limpia al resolver:
  // una recurrencia genuina de la falla después del cierre debe notificar de
  // inmediato (antes quedaba muda hasta cooldownSec — medido con G2: 900 s de
  // silencio tras resolve, "las alarmas no saltan"). La protección anti-flap
  // que el cooldown cubría acá migra al resolve persistente
  // (resolveGraceSec, DEC-REF-102 D-2): quien evita la ráfaga fire/resolve es
  // la ventana de persistencia, no el silencio del re-disparo.
  cooldownState.delete(rule.ruleId);

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

module.exports = { processMessage, fireResolve };
