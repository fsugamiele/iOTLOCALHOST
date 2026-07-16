// DEC-REF-68 (a) — env fuente única: `edge-engine/.env.edge` (git-ignored).
// Path absoluto vía `__dirname` → cero dependencia del CWD del proceso, tanto
// corriendo dentro del container docker como en corridas manuales de dev.
// El servicio compose adicionalmente inyecta `env_file:` (DEC-REF-68 pata b);
// dotenv NO pisa lo que ya está en `process.env`, así que ambos coexisten sin
// conflicto (compose gana si define el mismo key).
require('dotenv').config({ path: require('path').join(__dirname, '.env.edge') });
const mqtt     = require('mqtt');
const mongoose = require('mongoose');
const { loadPacks, hydrateSiteState } = require('./siteState');
const { processMessage, fireResolve } = require('./ruleEngine');
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
// SF-4 · DEC-REF-64.a — activeState: Map<ruleId, timestamp del fire vigente>.
// Se popula en fireAlarm y se limpia en fireResolve o al detectar la
// transición activa→inactiva. Vive en el mismo closure que los otros Maps;
// viaja como argumento a processMessage.
const activeState  = new Map();

// DEC-REF-68 (c) — handlers globales de errores no manejados.
// Sin esto, un rechazo async no capturado tumba el proceso EN SILENCIO
// (Node <15 solo warning; Node ≥15 exit sin trace útil). Estos handlers
// convierten "muerte muda" en "muerte registrada + relanzada por el
// guardián docker (restart:always del compose de PROD)".
process.on('unhandledRejection', (reason) => {
  console.error('[edge-engine] unhandledRejection:', reason && (reason.stack || reason.message || reason));
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[edge-engine] uncaughtException:', err && (err.stack || err.message || err));
  process.exit(1);
});

async function start() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    useFindAndModify: false,
    // DEC-REF-68 (c) — fast-fail 5s en connect inicial. Default ~30s hace
    // pesado el ciclo morir-revivir cuando Mongo aún no está listo (reboot
    // del host, reinicio por política — `depends_on: service_healthy` NO
    // cubre esos caminos).
    serverSelectionTimeoutMS: 5000,
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

      // SF-4 · DEC-REF-64.a — capturar defs VIEJAS de reglas que van a ser
      // limpiadas Y que están ACTIVAS. Las necesitamos para construir
      // fireResolve antes del swap; después del swap, `packs` cambió y ya
      // no tenemos la definición vieja de una regla eliminada.
      const oldRuleDefs = new Map();
      if (toClean.length > 0) {
        for (const pack of packs) {
          for (const rule of (pack.rules || [])) {
            if (toClean.includes(rule.ruleId) && activeState.has(rule.ruleId)) {
              oldRuleDefs.set(rule.ruleId, rule);
            }
          }
        }
      }

      const { deletedCount, resolvedRuleIds } = cleanupStateForRules(toClean, {
        cooldownState, windowState, crossState, activeState, siteCode: SITE_ID,
      });

      // SF-4 · DEC-REF-64.a — emitir resolve-by-edit por cada regla que
      // estaba ACTIVA cuando el reload la editó o eliminó.
      // "Ninguna alarma abierta muere en silencio" (principio del punto a).
      // Emitir SI/O antes del swap: activeState y `packs` vigentes.
      for (const ruleId of resolvedRuleIds) {
        const oldRule = oldRuleDefs.get(ruleId);
        if (!oldRule) continue;
        const deviceId = findDeviceIdByType(siteState, oldRule.deviceType, SITE_ID) || '';
        fireResolve({
          rule: oldRule,
          deviceId,
          reason: 'rule-edited-or-removed',
          mode: 'resolve-by-edit',
          cooldownState, siteState, activeState,
        });
      }

      // Swap sincrónico post-await — no hay await entre estas dos líneas.
      packs = nextPacks;
      ruleSnapshot = nextSnap;

      console.log(
        `[edge-engine] Reload OK — packs: ${nextPacks.map(p => p.packId).join(', ') || '(ninguno)'} · ` +
        `reglas nuevas: ${diff.added.length} [${diff.added.join(', ')}] · ` +
        `editadas: ${diff.changed.length} [${diff.changed.join(', ')}] · ` +
        `eliminadas: ${diff.removed.length} [${diff.removed.join(', ')}] · ` +
        `intactas: ${diff.unchanged.length} · keys estado borradas: ${deletedCount}` +
        (resolvedRuleIds.length ? ` · resolve-by-edit: ${resolvedRuleIds.length} [${resolvedRuleIds.join(', ')}]` : '')
      );
    } catch (err) {
      console.error(
        `[edge-engine] Reload FAILED — motor conserva packs vigentes (${packs.length} pack(s), ${ruleSnapshot.size} regla(s)): ${err.message}`
      );
    }
  }

  // SF-4 · DEC-REF-64.a helper — busca el primer dId cuyo device state tenga
  // el deviceType requerido en el siteCode del edge. Usado por resolve-by-edit
  // para poner un deviceId semánticamente correcto en el alarm object (necesario
  // para que sendMqttNotif publique al canal ${owner}/${dId}/alarm/notif del
  // browser — DEC-REF-55).
  function findDeviceIdByType(state, deviceType, siteCode) {
    for (const [dId, devState] of state) {
      if (devState && devState._deviceType === deviceType && devState._siteCode === siteCode) return dId;
    }
    return null;
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
    // SF-6 · DEC-REF-65.b — timestamp por variable, aditivo al shape actual.
    // Las hojas equipo existentes siguen leyendo `deviceState[variable]` como
    // escalar (sin cambio). La hoja de suma (SF-6) consulta
    // `deviceState._lastUpdate[variable]` para verificar frescura antes de
    // sumar. Ventana calculada en typeCross.js:evaluateSum.
    if (!deviceState._lastUpdate) deviceState._lastUpdate = {};
    deviceState._lastUpdate[variable] = eventTs;

    processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, crossState, activeState, eventTs });
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
