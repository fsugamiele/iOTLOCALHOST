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
    // DEC-REF-64 amplía el enum con 'resolve-by-edit' y 'resolve-by-condition'.
    // DEC-REF-66-B (#45/R22) suma 'resolve-by-setpoint-recovered' para el reset EDGE-2.
    mode:          { type: String, enum: ['direct', 'calibrated', 'fallback', 'no-ref', 'window', 'cross', 'resolve-by-edit', 'resolve-by-condition', 'resolve-by-setpoint-recovered'], default: 'direct' },
    thresholdUsed: { type: Number, default: null },
    unit:          { type: String, default: '' },
    // DEC-REF-46 / DEC-REF-54 — ACK auditable. El motor no los llena; los
    // deja como default para paridad de schema (app + edge sobre la misma
    // colección `notifications`). Set por endpoint app-side.
    acknowledgedBy: { type: String, default: null },
    ackAt:          { type: Number, default: null },
    // DEC-REF-59 + DEC-REF-64 — kind del evento: 'fire' (raise) o 'resolve' (clear).
    // default 'fire' preserva la lectura de las notifs preexistentes como fire.
    // Paridad total con app/api/models/notifications.js — este schema inline y el
    // ES-module de app/ escriben la MISMA colección notifications.
    kind:          { type: String, enum: ['fire', 'resolve'], default: 'fire' },
  }, { collection: 'notifications' })
);

// Estado del módulo — inicializado por init()
let _mqttClient = null;
let _siteId     = null;

const TELEGRAM_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID_DEFAULT;

// DEC-REF-67 (#45/R22) — retry acotado async no-bloqueante en sendTelegram.
const TELEGRAM_MAX_ATTEMPTS      = 3;
const TELEGRAM_RETRY_BASE_MS     = 2000;   // 2s → 4s → 8s (exponencial)
const TELEGRAM_RETRY_JITTER_MS   = 1000;   // 0-1s de jitter
const TELEGRAM_REQUEST_TIMEOUT_MS = 5000;  // req.setTimeout — corta cuelgues largos

function init({ mqttClient, siteId }) {
  _mqttClient = mqttClient;
  _siteId     = siteId;
  const telegramMode = TELEGRAM_TOKEN
    ? `ON (retry ${TELEGRAM_MAX_ATTEMPTS}× / ${TELEGRAM_RETRY_BASE_MS/1000}·${TELEGRAM_RETRY_BASE_MS*2/1000}·${TELEGRAM_RETRY_BASE_MS*4/1000}s + jitter, timeout ${TELEGRAM_REQUEST_TIMEOUT_MS/1000}s)`
    : 'OFF';
  console.log(`[notifRouter] Inicializado — siteId: ${siteId} · Telegram: ${telegramMode}`);
}

// ── Canal 1: MQTT dashboard (DEC-REF-55 — tópico B-narrow + JSON) ───────────
// Tópico: ${owner}/${dId}/alarm/notif — segmento 3 FIJO literal (la variable
// viaja en el payload, esquiva `n/a` de cross). Payload JSON con shape fija
// (paridad con los publishers legacy webhooks.js).
function sendMqttNotif(alarm) {
  if (!_mqttClient || !alarm.userId || !alarm.deviceId) return;
  const topic = `${alarm.userId}/${alarm.deviceId}/alarm/notif`;
  const unit = alarm.unit ? ` ${alarm.unit}` : '';
  const isResolve = alarm.kind === 'resolve';
  const thr  = alarm.thresholdUsed != null ? ` | umbral: ${alarm.thresholdUsed}${unit}` : '';
  const message = isResolve
    ? `[RESUELTO] ${alarm.label} | ${_siteId}`
    : `[${alarm.severity.toUpperCase()}] ${alarm.label} | ${_siteId} | ${alarm.value}${unit}${thr}`;
  const payload = JSON.stringify({
    siteId:            _siteId,
    severity:          alarm.severity,
    ruleId:            alarm.ruleId,
    variable:          alarm.variable,
    message,
    time:              Date.now(),
    correlationParent: alarm.correlationParent || null,
    mode:              alarm.mode || 'direct',
    // SF-4 · DEC-REF-59/64 — kind extiende DEC-REF-55. El frontend
    // condiciona el color del toast por este campo.
    kind:              alarm.kind || 'fire',
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
    // SF-4 · DEC-REF-64 — kind también viaja al NOC.
    kind:              alarm.kind || 'fire',
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
      // SF-4 · DEC-REF-59/64 — persistir kind explícito. Sin esto, el
      // default del schema ('fire') se aplicaría a los resolves y quedarían
      // indistinguibles en Mongo.
      kind:            alarm.kind || 'fire',
    });
  } catch (err) {
    console.error('[notifRouter] Mongo save error:', err.message);
  }
}

// ── Canal 4: Telegram (feature flag por env) ─────────────────────────────────
// SF-4 · DEC-REF-64.b — rama separada para resolves (emoji verde + prefijo
// "Resuelto:"). Criterio Franco (D5): reversible — si en uso real resulta
// ruido, filtrar por severity (p.ej. solo critical).
function sendTelegram(alarm) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const isResolve = alarm.kind === 'resolve';
  const emoji = isResolve
    ? '✅'
    : (alarm.severity === 'critical' ? '🔴' :
       alarm.severity === 'warning'  ? '⚠️' : 'ℹ️');
  const prefix = isResolve ? 'Resuelto: ' : '';
  const unit   = alarm.unit ? ` ${alarm.unit}` : '';

  const lines = [
    `${emoji} ${prefix}${alarm.label} — ${_siteId}`,
    `Dispositivo: ${alarm.deviceName || alarm.deviceId || '(sin device)'} | Variable: ${alarm.variableLabel || alarm.variable}` +
      (isResolve ? '' : ` = ${alarm.value}${unit}`),
  ];

  if (!isResolve) {
    if (alarm.mode === 'direct') {
      lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (fijo)`);
    } else if (alarm.mode === 'calibrated') {
      lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (calibrado)`);
    } else if (alarm.mode === 'fallback') {
      lines.push(`Umbral: ${alarm.thresholdUsed}${unit} (respaldo — setpoint no disponible)`);
    }
    // mode='no-ref': omitir línea de umbral
  } else {
    // Resolves: registrar modo (resolve-by-edit vs resolve-by-condition)
    // para trazabilidad — útil cuando lleguen muchos en producción.
    lines.push(`Motivo: ${alarm.mode || 'resolve-by-condition'}`);
  }

  lines.push(`→ ${alarm.recommendation}`);

  const text   = lines.join('\n');
  const params = new URLSearchParams({ chat_id: TELEGRAM_CHAT_ID, text });
  const url    = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?${params}`;

  // DEC-REF-67 (#45/R22): la construcción del mensaje ocurre 1 vez;
  // los reintentos reutilizan la URL ya armada.
  attemptSendTelegram(url, 1, alarm.ruleId || '?', alarm.kind || 'fire');
}

// DEC-REF-67 (#45/R22) — envío con reintento acotado async no-bloqueante.
// Fire-and-forget preservado hacia ruleEngine: la cadena de evaluación no
// espera al canal. Simétrico fire+resolve.
function attemptSendTelegram(url, attempt, ruleId, kind) {
  const req = https.get(url, res => {
    // DEC-REF-64-A (iii) — Drenar el body es OBLIGATORIO con Node http
    // keepAlive: sockets sin drenar quedan zombies en el pool y el server
    // (Telegram) cierra idle connections → los siguientes requests fallan
    // con `err.message = ''` (patrón observado en R12/C5 antes del fix).
    res.resume();
    if (res.statusCode === 200) {
      if (attempt > 1) {
        console.log(`[notifRouter] Telegram OK tras retry (${kind} ${ruleId}, intento ${attempt}/${TELEGRAM_MAX_ATTEMPTS})`);
      }
      return;
    }
    // 429 (rate-limit) y 5xx (transient server) → vale la pena reintentar.
    // Otros 4xx (400 formato, 401/403 token/chat) → mensaje/config inválido:
    // reintento no ayuda, se abandona con log claro.
    const retryable = res.statusCode === 429 || res.statusCode >= 500;
    console.error(`[notifRouter] Telegram error: HTTP ${res.statusCode} (${kind} ${ruleId}, intento ${attempt}/${TELEGRAM_MAX_ATTEMPTS})`);
    if (retryable && attempt < TELEGRAM_MAX_ATTEMPTS) {
      scheduleTelegramRetry(url, attempt, ruleId, kind);
    }
  });

  // Timeout explícito de request — sin esto, ETIMEDOUT depende del kernel
  // TCP y puede tardar minutos, haciendo el retry inútil en la práctica.
  req.setTimeout(TELEGRAM_REQUEST_TIMEOUT_MS, () => {
    // Destroy con Error para que el handler 'error' de abajo reciba código.
    req.destroy(Object.assign(new Error('client-timeout'), { code: 'ETIMEDOUT' }));
  });

  req.on('error', err => {
    const code = err.code || err.message || 'unknown';
    console.error(`[notifRouter] Telegram request error (${kind} ${ruleId}, intento ${attempt}/${TELEGRAM_MAX_ATTEMPTS}): ${code}`);
    // Errores de red genéricos son todos retryables (ETIMEDOUT, ECONNRESET,
    // ENOTFOUND, EAI_AGAIN, socket hangup). Falla definitiva solo si
    // agotamos intentos.
    if (attempt < TELEGRAM_MAX_ATTEMPTS) {
      scheduleTelegramRetry(url, attempt, ruleId, kind);
    }
  });
}

function scheduleTelegramRetry(url, attempt, ruleId, kind) {
  const baseMs   = TELEGRAM_RETRY_BASE_MS * Math.pow(2, attempt - 1);  // 2s → 4s → 8s
  const jitterMs = Math.floor(Math.random() * TELEGRAM_RETRY_JITTER_MS);
  const delayMs  = baseMs + jitterMs;
  console.log(`[notifRouter] Telegram retry programado (${kind} ${ruleId}, próximo intento ${attempt + 1}/${TELEGRAM_MAX_ATTEMPTS}) en ${delayMs}ms`);
  setTimeout(() => attemptSendTelegram(url, attempt + 1, ruleId, kind), delayMs);
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
