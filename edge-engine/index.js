require('dotenv').config();
const mqtt     = require('mqtt');
const mongoose = require('mongoose');
const { loadPacks, hydrateSiteState } = require('./siteState');
const { processMessage }      = require('./ruleEngine');
const notificationRouter      = require('./notificationRouter');
const { buildSnapshot, diffSnapshots, cleanupStateForRules } = require('./reloadState');

const MQTT_HOST  = process.env.MQTT_HOST   || 'mqtt://localhost:1883';
const MQTT_USER  = process.env.MQTT_USER;
const MQTT_PASS  = process.env.MQTT_PASS;
const MONGO_URI  = process.env.MONGODB_URI || 'mongodb://localhost:27017/wanomi';
const SITE_ID    = process.env.SITE_ID     || 'CR00061';
const MQTT_TOPIC  = '+/+/+/sdata';   // {userId}/{dId}/{variable}/sdata

// SF-3 (DEC-REF-58 + DEC-REF-61). Dos canales de reload:
//   RELOAD_TOPIC_SITE — dirigido a este edge (reservado para reload manual
//                       futuro desde SF-5 "recargar solo este edge").
//   RELOAD_TOPIC_ALL  — broadcast a todos los edges. Es el que usa el
//                       backend en el auto-publish post-write porque el
//                       writer no sabe qué sites usan qué pack (packs
//                       son globales por deviceType). El `+` del ACL
//                       `wanomi/edge/+/reload` cubre ambos.
const RELOAD_TOPIC_SITE = `wanomi/edge/${SITE_ID}/reload`;
const RELOAD_TOPIC_ALL  = `wanomi/edge/all/reload`;

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

  let packs = await loadPacks(SITE_ID);
  let ruleSnapshot = buildSnapshot(packs);
  await hydrateSiteState(SITE_ID, siteState);
  console.log(`[edge-engine] Packs cargados: ${packs.map(p => p.packId).join(', ') || '(ninguno)'}`);
  console.log(`[edge-engine] Dispositivos en estado: ${siteState.size}`);

  // reloadPacks — handler del canal de control SF-3 (DEC-REF-58 + DEC-REF-61).
  // Payload ignorado (DEC-REF-61.c "recargar todo"). Errores no dejan al motor
  // sin reglas: si loadPacks falla, se conservan `packs` y `ruleSnapshot`
  // vigentes. El swap es la ÚLTIMA operación sincrónica de la rama success,
  // después del último await — no puede intercalar mensajes de datos entre el
  // diff y la asignación (hallazgo R4/B3.10).
  async function reloadPacks() {
    try {
      const nextPacks = await loadPacks(SITE_ID);
      const nextSnap  = buildSnapshot(nextPacks);
      const diff      = diffSnapshots(ruleSnapshot, nextSnap);
      const toClean   = [...diff.removed, ...diff.changed];
      const deletedKeys = cleanupStateForRules(toClean, {
        cooldownState, windowState, crossState, siteCode: SITE_ID,
      });

      // Swap sincrónico post-await — no hay await entre estas dos líneas.
      packs = nextPacks;
      ruleSnapshot = nextSnap;

      console.log(
        `[edge-engine] Reload OK — packs: ${nextPacks.map(p => p.packId).join(', ') || '(ninguno)'} · ` +
        `reglas nuevas: ${diff.added.length} [${diff.added.join(', ')}] · ` +
        `editadas: ${diff.changed.length} [${diff.changed.join(', ')}] · ` +
        `eliminadas: ${diff.removed.length} [${diff.removed.join(', ')}] · ` +
        `intactas: ${diff.unchanged.length} · keys estado borradas: ${deletedKeys}`
      );
    } catch (err) {
      console.error(
        `[edge-engine] Reload FAILED — motor conserva packs vigentes (${packs.length} pack(s), ${ruleSnapshot.size} regla(s)): ${err.message}`
      );
    }
  }

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
    // Subscribes de control SF-3 (site-específico + broadcast).
    client.subscribe([RELOAD_TOPIC_SITE, RELOAD_TOPIC_ALL], err => {
      if (err) {
        console.error(`[edge-engine] Error suscripción reload:`, err.message);
        return;  // no exit — motor sigue vivo aunque el canal de control falle
      }
      console.log(`[edge-engine] Suscrito a ${RELOAD_TOPIC_SITE} + ${RELOAD_TOPIC_ALL} (canal de reload SF-3)`);
    });
  });

  client.on('message', (topic, raw) => {
    // Canal de control: reload. Payload ignorado (DEC-REF-61.c).
    if (topic === RELOAD_TOPIC_SITE || topic === RELOAD_TOPIC_ALL) {
      console.log(`[edge-engine] Reload solicitado por ${topic}`);
      reloadPacks();  // fire-and-forget — el handler tiene su propio try/catch
      return;
    }

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
