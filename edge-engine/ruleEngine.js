const { evaluateD } = require('./evaluators/typeD');
const { evaluateC } = require('./evaluators/typeC');
const { notify }    = require('./notificationRouter');

function processMessage({ dId, variable, value, siteState, packs, cooldownState }) {
  const deviceState = siteState.get(dId) || {};
  const deviceType  = deviceState._deviceType || null;

  for (const pack of packs) {
    for (const rule of pack.rules) {
      if (rule.deviceType !== deviceType) continue;
      if (rule.variable   !== variable)   continue;

      let triggered = false;
      switch (rule.type) {
        case 'D':
          triggered = evaluateD(rule, value);
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
          }
          continue;
        }
        case 'S':
        case 'cross':
          console.log(`[ruleEngine] Tipo ${rule.type} pendiente — regla ${rule.ruleId} omitida`);
          continue;
        default:
          console.warn(`[ruleEngine] Tipo desconocido '${rule.type}' en regla ${rule.ruleId}`);
          continue;
      }
      if (triggered) {
        fireAlarm({ rule, value, deviceId: dId, reason: 'threshold',
                    thresholdUsed: rule.condition?.value, cooldownState, siteState });
      }
    }
  }
}

function fireAlarm({ rule, value, deviceId, reason, mode, thresholdUsed, cooldownState, siteState }) {
  const now       = Date.now();
  const lastFired = cooldownState.get(rule.ruleId) || 0;
  const cooldownMs = (rule.cooldownSec || 0) * 1000;

  if (now - lastFired < cooldownMs) return;

  cooldownState.set(rule.ruleId, now);

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
    ts:                new Date().toISOString(),
  };

  notify(alarm);
}

module.exports = { processMessage };
