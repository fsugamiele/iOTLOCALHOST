// STUB sesión #19 — implementación completa en sesión siguiente (DEC-REF-21).

function notify(alarm) {
  const tag = alarm.severity.toUpperCase().padEnd(8);
  console.log(`[ALARM] ${tag} | ${alarm.ts} | device:${alarm.deviceId} | rule:${alarm.ruleId} | var:${alarm.variable}=${alarm.value}`);
  console.log(`        → ${alarm.recommendation}`);
  if (alarm.correlationParent) {
    console.log(`        → parent: ${alarm.correlationParent}`);
  }
}

module.exports = notify;
