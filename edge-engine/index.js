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
const { processMessage, processStalenessTick, fireResolve } = require('./ruleEngine');
const notificationRouter      = require('./notificationRouter');
const { buildSnapshot, diffSnapshots, cleanupStateForRules } = require('./reloadState');
const { loadAutonomyConfigs, maybeComputeAutonomy, resetAutonomyRuntime } = require('./autonomy');
const { maybeComputeEfficiency, resetEfficiencyRuntime } = require('./efficiency');
const { loadMSoftState, flushMSoftState } = require('./msoftstate');  // motor M Ola M3 (persistencia)

const MSOFT_FLUSH_SEC = parseInt(process.env.MSOFT_FLUSH_SEC || '30', 10);
// motor M Ola M4 — cadencia del tick de staleness (silencio de comunicación §8-D3).
const EDGE_TICK_SEC = parseInt(process.env.EDGE_TICK_SEC || '30', 10);

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
// spec_motor_m.md — mState: buffer/serie por regla:device para el tipo M
// (soft sensors). Espejo de windowState; viaja a processMessage y se limpia
// en el reload igual que el resto del estado.
const mState        = new Map();
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
  // DEC-REF-115 (#85) — config de autonomía (ficha + override por equipo).
  let autonomyConfigs = await loadAutonomyConfigs(SITE_ID);
  // motor M Ola M3 — hidrata los acumuladores persistentes (accumulator/cumulativeSince).
  const nMsoft = await loadMSoftState(SITE_ID, mState);
  console.log(`[edge-engine] Packs cargados: ${packs.map(p => p.packId).join(', ') || '(ninguno)'}`);
  console.log(`[edge-engine] Dispositivos en estado: ${siteState.size}`);
  console.log(`[edge-engine] Autonomía configurada en ${autonomyConfigs.size} equipo(s): ${[...autonomyConfigs.keys()].join(', ') || '(ninguno)'}`);
  console.log(`[edge-engine] Acumuladores M3 hidratados desde Mongo: ${nMsoft}`);

  // Flush periódico de los acumuladores M3 dirty (throttle — no en cada mensaje).
  setInterval(() => {
    flushMSoftState(SITE_ID, mState).catch(e => console.error('[msoftstate] flush error:', e.message));
  }, MSOFT_FLUSH_SEC * 1000);

  // motor M Ola M4 — tick de staleness (§8-D3): evalúa el silencio de comunicación
  // que NO llega por mensaje. `packs` es `let` (lo pisa reloadPacks) → el arrow lee
  // siempre la versión vigente.
  setInterval(() => {
    try {
      processStalenessTick({ packs, siteState, cooldownState, activeState, mState });
    } catch (e) {
      console.error('[edge-engine] staleness tick error:', e.message);
    }
  }, EDGE_TICK_SEC * 1000);

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
      // DEC-REF-115 (#85) — el mismo canal SF-3 recarga la config de
      // autonomía (PUT /equipmentsheet y PUT /device/autonomy publican acá).
      const nextAutonomy = await loadAutonomyConfigs(SITE_ID);
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
            // DEC-REF-122 — def por ruleId (igual para todas las instancias). El
            // gate de "activa" ya no es por ruleId (activeState es por instancia);
            // lo resuelve resolvedRuleIds abajo.
            if (toClean.includes(rule.ruleId)) {
              oldRuleDefs.set(rule.ruleId, rule);
            }
          }
        }
      }

      const { deletedCount, resolvedRuleIds } = cleanupStateForRules(toClean, {
        cooldownState, windowState, crossState, activeState, mState, siteCode: SITE_ID,
      });

      // SF-4 · DEC-REF-64.a + DEC-REF-122 — resolve-by-edit POR INSTANCIA: una
      // regla activa en varios equipos emite UN resolve por equipo (antes uno
      // solo, con el dId del primero). `resolvedRuleIds` = {ruleId, stateKey,
      // suffix}; fireResolve borra el flag por stateKey. "Ninguna alarma abierta
      // muere en silencio". Emitir antes del swap: activeState y `packs` vigentes.
      for (const { ruleId, stateKey, suffix } of resolvedRuleIds) {
        const oldRule = oldRuleDefs.get(ruleId);
        if (!oldRule) continue;
        // D/S/M: suffix ES el dId (equipo concreto). cross: suffix = siteCode →
        // anclar la notificación a un device representativo del tipo.
        const deviceId = (oldRule.type === 'cross' || !suffix)
          ? (findDeviceIdByType(siteState, oldRule.deviceType, SITE_ID) || '')
          : suffix;
        fireResolve({
          rule: oldRule,
          deviceId,
          stateKey,
          reason: 'rule-edited-or-removed',
          mode: 'resolve-by-edit',
          cooldownState, siteState, activeState,
        });
      }

      // Swap sincrónico post-await — no hay await entre estas líneas.
      packs = nextPacks;
      ruleSnapshot = nextSnap;
      autonomyConfigs = nextAutonomy;
      // La config de autonomía pudo cambiar: historiales y debounce viejos
      // quedan obsoletos (v2 híbrida — DEC-REF-115).
      resetAutonomyRuntime();
      resetEfficiencyRuntime();

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
    const userId   = parts[0];   // {userId}/{dId}/{variable}/sdata
    const dId      = parts[1];
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

    // DEC-REF-115 (#85) — si el mensaje es la variable de combustible (o la
    // de marcha) de un equipo con autonomía configurada, derivar y publicar
    // autonomy_hours (+ autonomy_source: 'measured'|'estimated').
    maybeComputeAutonomy({ client, configs: autonomyConfigs, dId, variable, value, eventTs });

    // spec_deteccion_sifoneo_eficiencia — consumo específico (L/kWh) para el baseline
    // de deficiencia. userId del cfg de autonomía si existe (gensets), si no el del topic.
    const effUserId = (autonomyConfigs.get(dId) || {}).userId || userId;
    maybeComputeEfficiency({ client, userId: effUserId, dId, variable, deviceState, eventTs });

    processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, crossState, activeState, mState, eventTs });
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
