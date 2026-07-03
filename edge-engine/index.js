require('dotenv').config();
const mqtt     = require('mqtt');
const mongoose = require('mongoose');
const { loadPacks }      = require('./siteState');
const { processMessage }      = require('./ruleEngine');
const notificationRouter      = require('./notificationRouter');

const MQTT_HOST  = process.env.MQTT_HOST   || 'mqtt://localhost:1883';
const MQTT_USER  = process.env.MQTT_USER;
const MQTT_PASS  = process.env.MQTT_PASS;
const MONGO_URI  = process.env.MONGODB_URI || 'mongodb://localhost:27017/wanomi';
const SITE_ID    = process.env.SITE_ID     || 'CR00061';
const MQTT_TOPIC = '+/+/+/sdata';   // {userId}/{dId}/{variable}/sdata

const siteState    = new Map();
const cooldownState = new Map();
const windowState   = new Map();
const crossState    = new Map();

async function start() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
  });
  console.log(`[edge-engine] Mongo conectado — ${MONGO_URI}`);

  const { packs } = await loadPacks(SITE_ID, siteState);
  console.log(`[edge-engine] Packs cargados: ${packs.map(p => p.packId).join(', ') || '(ninguno)'}`);
  console.log(`[edge-engine] Dispositivos en estado: ${siteState.size}`);

  const client = mqtt.connect(MQTT_HOST, { username: MQTT_USER, password: MQTT_PASS });

  client.on('connect', () => {
    notificationRouter.init({ mqttClient: client, siteId: SITE_ID });
    client.subscribe(MQTT_TOPIC, err => {
      if (err) {
        console.error('[edge-engine] Error suscripción MQTT:', err.message);
        process.exit(1);
      }
      console.log(`[edge-engine] Suscrito a ${MQTT_TOPIC}`);
    });
  });

  client.on('message', (topic, raw) => {
    const eventTs = Date.now();
    const parts = topic.split('/');
    if (parts.length < 4) return;
    const dId      = parts[1];   // {userId}/{dId}/{variable}/sdata
    const variable = parts[2];

    if (!siteState.has(dId)) return;

    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      console.warn(`[edge-engine] Payload no-JSON en ${topic} — ignorado`);
      return;
    }

    const value = payload.value;
    if (value === undefined) return;

    const deviceState = siteState.get(dId);
    deviceState[variable] = value;

    processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, crossState, eventTs });
  });

  client.on('error', err => {
    console.error('[edge-engine] Error MQTT:', err.message);
  });

  process.on('SIGTERM', async () => {
    console.log('[edge-engine] SIGTERM — cerrando...');
    client.end();
    await mongoose.disconnect();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('[edge-engine] Error de arranque:', err.message);
  process.exit(1);
});
