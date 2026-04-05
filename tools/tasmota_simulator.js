/**
 * Tasmota Device Simulator
 *
 * Simulates a Tasmota device with a DHT11 sensor + 1 relay.
 * Publishes to the same topic format Tasmota uses so the Wanomi
 * Tasmota Bridge can receive and translate the data.
 *
 * Usage:
 *   node tools/tasmota_simulator.js
 *
 * Configuration — edit the constants below or set env vars:
 *   BROKER         e.g. mqtt://192.168.1.100:1883  (default: mqtt://localhost:1883)
 *   TASMOTA_NAME   device topic name               (default: tasmota_sim_01)
 *   MQTT_USER      EMQX username (= tasmotaName)   (default: tasmota_sim_01)
 *   MQTT_PASS      EMQX password shown at creation  (default: simulated123456)
 *   SENSOR_INTERVAL_MS  publish interval ms         (default: 5000)
 */

const mqtt = require("mqtt");

const BROKER         = process.env.BROKER              || "mqtt://localhost:1883";
const TASMOTA_NAME   = process.env.TASMOTA_NAME        || "tasmota_sim_01";
const MQTT_USER      = process.env.MQTT_USER           || TASMOTA_NAME;
const MQTT_PASS      = process.env.MQTT_PASS           || "simulated123456";
const INTERVAL_MS    = Number(process.env.SENSOR_INTERVAL_MS || 5000);

// Topic helpers
const T = (prefix, suffix) => `${prefix}/${TASMOTA_NAME}/${suffix}`;

const client = mqtt.connect(BROKER, {
  clientId: "tasmota_sim_" + Math.random().toString(16).slice(2, 8),
  username: MQTT_USER,
  password: MQTT_PASS,
  clean: true,
  reconnectPeriod: 3000,
});

let relayState = false;

client.on("connect", () => {
  console.log(`[Tasmota Sim] Connected to ${BROKER}`);
  console.log(`[Tasmota Sim] Device name: ${TASMOTA_NAME}`);

  // LWT — announce online
  client.publish(T("tele", "LWT"), "Online", { retain: true });

  // Subscribe to incoming commands
  client.subscribe(T("cmnd", "POWER"), err => {
    if (err) console.error("[Tasmota Sim] Subscribe error:", err.message);
    else console.log(`[Tasmota Sim] Subscribed to cmnd/${TASMOTA_NAME}/POWER`);
  });

  // Initial power state
  publishPower();

  // Periodic sensor data
  setInterval(publishSensor, INTERVAL_MS);
  console.log(`[Tasmota Sim] Publishing sensor data every ${INTERVAL_MS}ms`);
});

client.on("message", (topic, message) => {
  const msg = message.toString().toUpperCase().trim();
  console.log(`[Tasmota Sim] ← ${topic} : ${msg}`);

  if (topic === T("cmnd", "POWER")) {
    if (msg === "ON" || msg === "1") relayState = true;
    else if (msg === "OFF" || msg === "0") relayState = false;
    else if (msg === "TOGGLE") relayState = !relayState;
    publishPower();
  }
});

client.on("error",     err => console.error("[Tasmota Sim] MQTT error:", err.message));
client.on("reconnect", ()  => console.log("[Tasmota Sim] Reconnecting..."));
client.on("offline",   ()  => console.log("[Tasmota Sim] Offline"));

function publishSensor() {
  const temp = (18 + Math.random() * 14).toFixed(1);
  const hum  = (35 + Math.random() * 45).toFixed(1);
  const dew  = (temp - (100 - hum) / 5).toFixed(1);

  const payload = {
    Time: new Date().toISOString(),
    DHT11: {
      Temperature: parseFloat(temp),
      Humidity:    parseFloat(hum),
      DewPoint:    parseFloat(dew)
    },
    TempUnit: "C"
  };

  client.publish(T("tele", "SENSOR"), JSON.stringify(payload));
  console.log(`[Tasmota Sim] → tele/${TASMOTA_NAME}/SENSOR  T:${temp}°C  H:${hum}%`);
}

function publishPower() {
  const state = relayState ? "ON" : "OFF";
  client.publish(T("stat", "POWER"), state);
  console.log(`[Tasmota Sim] → stat/${TASMOTA_NAME}/POWER  ${state}`);
}
