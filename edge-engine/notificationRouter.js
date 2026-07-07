// edge-engine/notificationRouter.js
// NotificationRouter real — DEC-REF-21 + DEC-REF-23
// Canales: MQTT notif (dashboard) + MQTT NOC event + Mongo + Telegram (feature flag)
// Todos los canales son fire-and-forget — ningún error rompe el loop del motor.

const https    = require('https');
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Schema inline — colección notifications (DEC-REF-23)
// Campos legacy EMQX opcionales; motor edge usa campos semánticamente correctos.
const NotificationRO = mongoose.models.NotificationRO || mongoose.model('NotificationRO',
  new Schema({
    userId: String, dId: String, deviceName: String, payload: Object,
    emqxRuleId: String, topic: String, value: Number, condition: String,
    variable: String, variableFullName: String, readed: Boolean, time: Number,
    // campos motor edge (DEC-REF-23)
    ruleId: String, inferenceId: String, label: String,
    severity: { type: String, enum: ['info','warning','critical'] },
    recommendation: String, siteId: String, reason: String,
    source: String,
    correlationParent: { type: String, default: null },  // DEC-REF-50
    // ── tipo C: modo de disparo + umbral efectivo (DEC-REF-24, #22) ──
    mode:          { type: String, enum: ['direct', 'calibrated', 'fallback', 'no-ref', 'window', 'cross'], default: 'direct' },
    thresholdUsed: { type: Number, default: null },
    unit:          { type: String, default: '' },
    // DEC-REF-46 / DEC-REF-54 — ACK auditable. El motor no los llena; los
    // deja como default para paridad de schema (app + edge sobre la misma
    // colección `notifications`). Set por endpoint app-side.
    acknowledgedBy: { type: String, default: null },
    ackAt:          { type: Number, default: null },
  }, { collection: 'notifications' })
);

// Estado del módulo — inicializado por init()
let _mqttClient = null;
let _siteId     = null;

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID_DEFAULT;

function init({ mqttClient, siteId }) {
  _mqttClient = mqttClient;
  _siteId     = siteId;
  console.log(`[notifRouter] Inicializado — siteId: ${siteId} · Telegram: ${TELEGRAM_TOKEN ? 'ON' : 'OFF'}`);
}

// ── Canal 1: MQTT dashboard (DEC-REF-55 — tópico B-narrow + JSON) ───────────
// Tópico: ${owner}/${dId}/alarm/notif — segmento 3 FIJO literal (la variable
// viaja en el payload, esquiva `n/a` de cross). Payload JSON con shape fija
// (paridad con los publishers legacy webhooks.js).
function sendMqttNotif(alarm) {
  if (!_mqttClient || !alarm.userId || !alarm.deviceId) return;
  const topic = `${alarm.userId}/${alarm.deviceId}/alarm/notif`;
  const unit = alarm.unit ? ` ${alarm.unit}` : '';
  const thr  = alarm.thresholdUsed != null ? ` | umbral: ${alarm.thresholdUsed}${unit}` : '';
  const message = `[${alarm.severity.toUpperCase()}] ${alarm.label} | ${_siteId} | ${alarm.value}${unit}${thr}`;
  const payload = JSON.stringify({
    siteId:            _siteId,
    severity:          alarm.severity,
    ruleId:            alarm.ruleId,
    variable:          alarm.variable,
    message,
    time:              Date.now(),
    correlationParent: alarm.correlationParent || null,
    mode:              alarm.mode || 'direct',
  });
  _mqttClient.publish(topic, payload, { qos: 0 }, err => {
    if (err) console.error('[notifRouter] MQTT notif error:', err.message);
  });
}

// ── Canal 2: MQTT NOC event (JSON estructurado, DEC-REF-21) ─────────────────
function sendNocEvent(alarm) {
  if (!_mqttClient) return;
  const topic   = `wanomi/noc/${_siteId}/event`;
  const payload = JSON.stringify({
    ruleId:            alarm.ruleId,
    inferenceId:       alarm.inferenceId,
    label:             alarm.label,
    severity:          alarm.severity,
    recommendation:    alarm.recommendation,
    correlationParent: alarm.correlationParent,
    deviceId:          alarm.deviceId,
    deviceName:        alarm.deviceName,
    variable:          alarm.variable,
    variableLabel:     alarm.variableLabel,
    value:             alarm.value,
    mode:              alarm.mode || 'direct',
    thresholdUsed:     alarm.thresholdUsed ?? null,
    unit:              alarm.unit || '',
    reason:            alarm.reason,
    siteId:            _siteId,
    ts:                alarm.ts,
  });
  _mqttClient.publish(topic, payload, { qos: 1 }, err => {
    if (err) console.error('[notifRouter] MQTT NOC error:', err.message);
  });
}

// ── Canal 3: Mongo (DEC-REF-22) ──────────────────────────────────────────────
async function saveToMongo(alarm) {
  try {
    await NotificationRO.create({
      // campos semánticamente correctos (motor edge)
      ruleId:          alarm.ruleId,
      inferenceId:     alarm.inferenceId,
      label:           alarm.label,
      severity:        alarm.severity,
      recommendation:  alarm.recommendation,
      siteId:          _siteId,
      reason:          alarm.reason,
      source:          'edge-engine',
      correlationParent: alarm.correlationParent,   // DEC-REF-50
      mode:             alarm.mode || 'direct',
      thresholdUsed:    (alarm.thresholdUsed !== undefined && alarm.thresholdUsed !== null)
                          ? alarm.thresholdUsed : null,
      unit:             alarm.unit || '',
      // campos comunes
      userId:          alarm.userId,
      dId:             alarm.deviceId,
      deviceName:      alarm.deviceName,
      variable:        alarm.variable,
      variableFullName: alarm.variableLabel || '',
      value:           typeof alarm.value === 'number' ? alarm.value : null,
      payload:         { severity: alarm.severity, recommendation: alarm.recommendation, value: alarm.value },
      readed:          false,
      time:            Date.now(),
    });
  } catch (err) {
    console.error('[notifRouter] Mongo save error:', err.message);
  }
}

// ── Canal 4: Telegram (feature flag por env) ─────────────────────────────────
function sendTelegram(alarm) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const emoji = alarm.severity === 'critical' ? '🔴' :
                alarm.severity === 'warning'  ? '⚠️' : 'ℹ️';
  const unit  = alarm.unit ? ` ${alarm.unit}` : '';

  const lines = [
    `${emoji} ${alarm.label} — ${_siteId}`,
    `Dispositivo: ${alarm.deviceName || alarm.deviceId} | Variable: ${alarm.variableLabel || alarm.variable} = ${alarm.value}${unit}`,
  ];

  if (alarm.mode === 'direct') {
    lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (fijo)`);
  } else if (alarm.mode === 'calibrated') {
    lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (calibrado)`);
  } else if (alarm.mode === 'fallback') {
    lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (respaldo — setpoint no disponible)`);
  }
  // mode='no-ref': omitir línea de umbral

  lines.push(`→ ${alarm.recommendation}`);

  const text   = lines.join('\n');
  const params = new URLSearchParams({ chat_id: TELEGRAM_CHAT_ID, text });
  const url    = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?${params}`;
  https.get(url, res => {
    if (res.statusCode !== 200)
      console.error(`[notifRouter] Telegram error: HTTP ${res.statusCode}`);
  }).on('error', err => {
    console.error('[notifRouter] Telegram request error:', err.message);
  });
}

// ── notify: orquestador principal ────────────────────────────────────────────
function notify(alarm) {
  const tag = alarm.severity.toUpperCase().padEnd(8);
  console.log(`[ALARM] ${tag} | ${alarm.ts} | device:${alarm.deviceId} | rule:${alarm.ruleId} | var:${alarm.variable}=${alarm.value}`);
  console.log(`        → ${alarm.recommendation}`);

  // Fire-and-forget — el orden no importa, ningún canal bloquea al siguiente
  sendMqttNotif(alarm);
  sendNocEvent(alarm);
  saveToMongo(alarm).catch(err => console.error('[notifRouter] saveToMongo uncaught:', err.message));
  sendTelegram(alarm);
}

module.exports = { init, notify };
