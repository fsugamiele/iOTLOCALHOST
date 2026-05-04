const colors = require("colors");

import Device from "../../models/device.js";
import Template from "../../models/template.js";

// ── Cache ──────────────────────────────────────────────────────────────────
// Avoids a DB round-trip on every incoming MQTT message.
const CACHE_TTL = 60000; // 1 minute
const nameCache = new Map(); // tasmotaName → { data, ts }
const dIdCache  = new Map(); // dId          → { data, ts }  (null = not tasmota)

async function getDeviceByTasmotaName(tasmotaName) {
  const hit = nameCache.get(tasmotaName);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit.data;

  const device = await Device.findOne({ tasmotaName, firmwareType: "tasmota" });
  if (!device) { nameCache.set(tasmotaName, { data: null, ts: Date.now() }); return null; }

  const template = await Template.findOne({ _id: device.templateId });
  const data = template ? { device, template } : null;
  nameCache.set(tasmotaName, { data, ts: Date.now() });
  return data;
}

async function getDeviceByDId(dId) {
  const hit = dIdCache.get(dId);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit.data;

  const device = await Device.findOne({ dId, firmwareType: "tasmota" });
  if (!device) { dIdCache.set(dId, { data: null, ts: Date.now() }); return null; }

  const template = await Template.findOne({ _id: device.templateId });
  const data = template ? { device, template } : null;
  dIdCache.set(dId, { data, ts: Date.now() });
  return data;
}

// ── Path helper ────────────────────────────────────────────────────────────
// getByPath({DHT11:{Temperature:25}}, "DHT11.Temperature") → 25
function getByPath(obj, path) {
  return path.split(".").reduce((o, k) => (o != null && o[k] !== undefined ? o[k] : null), obj);
}

// ── Handlers ───────────────────────────────────────────────────────────────

// tele/{name}/SENSOR  → platform sdata per widget
async function handleSensor(client, tasmotaName, payloadStr) {
  try {
    const result = await getDeviceByTasmotaName(tasmotaName);
    if (!result) return;

    let payload;
    try { payload = JSON.parse(payloadStr); } catch (_) { return; }

    const { device, template } = result;
    for (const widget of template.widgets) {
      if (!widget.tasmotaPath || widget.variableType !== "input") continue;
      if (widget.tasmotaPath === "POWER") continue; // handled by handlePower

      const value = getByPath(payload, widget.tasmotaPath.trim());
      if (value === null || value === undefined) continue;

      const topic = `${device.userId}/${device.dId}/${widget.variable}/sdata`;
      client.publish(topic, JSON.stringify({ value: Number(value), save: 1 }));
    }
  } catch (err) {
    console.log("[Tasmota Bridge] handleSensor error:".red, err.message);
  }
}

// stat/{name}/POWER  → platform sdata for relay-state widgets
async function handlePower(client, tasmotaName, payloadStr) {
  try {
    const result = await getDeviceByTasmotaName(tasmotaName);
    if (!result) return;

    const value = payloadStr.trim().toUpperCase() === "ON" ? 1 : 0;
    const { device, template } = result;

    for (const widget of template.widgets) {
      if (!widget.tasmotaPath || widget.tasmotaPath !== "POWER") continue;
      if (widget.variableType !== "input") continue;

      const topic = `${device.userId}/${device.dId}/${widget.variable}/sdata`;
      client.publish(topic, JSON.stringify({ value, save: 1 }));
    }
  } catch (err) {
    console.log("[Tasmota Bridge] handlePower error:".red, err.message);
  }
}

// {userId}/{dId}/{variable}/actdata  → cmnd/{tasmotaName}/{tasmotaPath}
async function handleActdata(client, topic, payloadStr) {
  try {
    const parts = topic.split("/");
    if (parts.length !== 4) return;
    const [, dId, variable] = parts;

    const result = await getDeviceByDId(dId);
    if (!result) return; // not a tasmota device — ignore

    let payload;
    try { payload = JSON.parse(payloadStr); } catch (_) { return; }

    const { device, template } = result;
    const widget = template.widgets.find(w => w.variable === variable);
    if (!widget || !widget.tasmotaPath) return;

    const cmd = payload.value == 1 ? "ON" : "OFF";
    const cmdTopic = `cmnd/${device.tasmotaName}/${widget.tasmotaPath}`;
    client.publish(cmdTopic, cmd);
    console.log(`[Tasmota Bridge] → ${cmdTopic} : ${cmd}`.cyan);
  } catch (err) {
    console.log("[Tasmota Bridge] handleActdata error:".red, err.message);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function startTasmotaBridge(client) {
  // Remove stale message handlers (safe: no other code adds message listeners)
  client.removeAllListeners("message");

  client.subscribe("tele/+/SENSOR");
  client.subscribe("stat/+/POWER");
  client.subscribe("+/+/+/actdata");

  client.on("message", (topic, message) => {
    const msg = message.toString();
    const parts = topic.split("/");

    if (topic.startsWith("tele/") && topic.endsWith("/SENSOR")) {
      handleSensor(client, parts[1], msg);
    } else if (topic.startsWith("stat/") && topic.endsWith("/POWER")) {
      handlePower(client, parts[1], msg);
    } else if (topic.endsWith("/actdata")) {
      handleActdata(client, topic, msg);
    }
  });

  console.log("[Tasmota Bridge] Active — listening for Tasmota/ESPHome devices".green);
}

global.startTasmotaBridge = startTasmotaBridge;
