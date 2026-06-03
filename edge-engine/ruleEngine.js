const { evaluateD } = require('./evaluators/typeD');
const notify        = require('./notificationRouter');

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
        case 'C':
        case 'S':
        case 'cross':
          console.log(`[ruleEngine] Tipo ${rule.type} pendiente — regla ${rule.ruleId} omitida`);
          continue;
        default:
          console.warn(`[ruleEngine] Tipo desconocido '${rule.type}' en regla ${rule.ruleId}`);
          continue;
      }
      if (triggered) {
        fireAlarm({ rule, value, deviceId: dId, reason: 'threshold', cooldownState });
      }
    }
  }
}

function fireAlarm({ rule, value, deviceId, reason, cooldownState }) {
  const now       = Date.now();
  const lastFired = cooldownState.get(rule.ruleId) || 0;
  const cooldownMs = (rule.cooldownSec || 0) * 1000;

  if (now - lastFired < cooldownMs) return;

  cooldownState.set(rule.ruleId, now);

  const alarm = {
    ruleId:            rule.ruleId,
    inferenceId:       rule.inferenceId,
    label:             rule.label,
    severity:          rule.severity,
    recommendation:    rule.recommendation,
    correlationParent: rule.correlationParent,
    deviceId,
    variable:          rule.variable,
    value,
    reason,
    ts:                new Date().toISOString(),
  };

  notify(alarm);
}

module.exports = { processMessage };
