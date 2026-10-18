// DEC-REF-68 (a) — env fuente única: `edge-engine/.env.edge` (git-ignored).
// Path absoluto vía `__dirname` → cero dependencia del CWD del proceso, tanto
// corriendo dentro del container docker como en corridas manuales de dev.
// El servicio compose adicionalmente inyecta `env_file:` (DEC-REF-68 pata b);
// dotenv NO pisa lo que ya está en `process.env`, así que ambos coexisten sin
// conflicto (compose gana si define el mismo key).
require('dotenv').config({ path: require('path').join(__dirname, '.env.edge') });
const mqtt     = require('mqtt');
const mongoose = require('mongoose');
const { loadPacks, hydrateSiteState, refreshRefParams } = require('./siteState');
const { processMessage, processStalenessTick, processSilenceTick, processWindowTick, processCombinedTick, reevaluateRules, fireAlarm, fireResolve } = require('./ruleEngine');
const { isCombined, leavesOf, measureOf, leafIds, instanceKey } = require('../app/api/services/combinedRule');
const ruleLog = require('./ruleLog');   // spec_editor_reglas_v2 (Qi3) — log legible del ciclo
const { createRuleFsm } = require('./ruleFsm');      // spec_grafcet_g1 · G1a (DEC-REF-145)
const { createFsmStore } = require('./fsmStore');
const notificationRouter      = require('./notificationRouter');
const { buildSnapshot, buildStateSnapshot, diffSnapshots, cleanupStateForRules } = require('./reloadState');
const { loadAutonomyConfigs, maybeComputeAutonomy, resetAutonomyRuntime, changedAutonomyDIds } = require('./autonomy');
const { normalizeValue, loadVariableTypes } = require('./valueNormalizer');  // auditoría 2026-10-14 (M-07/M-21)
const { maybeComputeEfficiency, resetEfficiencyRuntime } = require('./efficiency');
const { loadMSoftState, flushMSoftState, deleteMSoftState } = require('./msoftstate');  // motor M Ola M3 (persistencia)

const MSOFT_FLUSH_SEC = parseInt(process.env.MSOFT_FLUSH_SEC || '30', 10);
// motor M Ola M4 — cadencia del tick de staleness (silencio de comunicación §8-D3).
const EDGE_TICK_SEC = parseInt(process.env.EDGE_TICK_SEC || '30', 10);
// G1a — tick del GRAFCET: vence esperas y cierres aunque el equipo publique por excepción.
const FSM_TICK_SEC = parseInt(process.env.FSM_TICK_SEC || '5', 10);
// spec_grafcet_g1c (Qe1) — silencio de un equipo que cuenta como "Sin datos" (2 latidos de 300 s).
const FSM_SILENCE_SEC = parseInt(process.env.FSM_SILENCE_SEC || '600', 10);
const EDGE_STARTED_AT = Date.now();

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

// spec_grafcet_g1 · G1a (DEC-REF-145) — GRAFCET por instancia de regla. Las acciones de
// sus transiciones son fireAlarm/fireResolve (mismo payload de notificación que antes).
const fsmStore = createFsmStore(SITE_ID);
const fsm = createRuleFsm({
  onNotify: (inst, ctx, now, rule) => fireAlarm({
    rule, value: ctx && ctx.value !== undefined ? ctx.value : null,
    deviceId: (ctx && ctx.dId) || inst.dId, stateKey: inst.key,
    reason: ctx && ctx.reason, mode: ctx && ctx.mode,
    thresholdUsed: ctx && ctx.thresholdUsed !== undefined ? ctx.thresholdUsed : null,
    leaves: ctx && ctx.leaves,
    cooldownState, siteState, activeState,
  }),
  onResolve: (inst, ctx, now, rule) => fireResolve({
    rule, deviceId: (ctx && ctx.dId) || inst.dId, stateKey: inst.key,
    reason: (ctx && ctx.resolveReason) || 'threshold-cleared',
    // G1b — cierre por acción humana: resolve-by-ack / resolve-by-service (auditoría en la notificación).
    mode: (ctx && ctx.resolveMode) || (ctx && ctx.mode === 'M' ? 'M' : 'resolve-by-condition'),
    recommendation: ctx && ctx.resolveMode
      ? `${ctx.resolveMode === 'resolve-by-service' ? 'Service registrado' : 'Confirmada'}${ctx.closedBy ? ' por ' + ctx.closedBy : ''}: alarma cerrada.`
      : undefined,
    cooldownState, siteState, activeState,
  }),
  onTransition: (t) => { fsmStore.trace(t); ruleLog.logTransition(t, logRules.get(t.ruleId), siteState); },
  onPersist: (inst) => fsmStore.save(inst),
});
// Índice de reglas para el log legible (el callback del FSM vive fuera de main()).
let logRules = new Map();
const ruleIndex = (packs) => { const m = new Map(); for (const p of packs) for (const r of (p.rules || [])) m.set(r.ruleId, r); return m; };

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
  let stateSnapshot = buildStateSnapshot(packs);   // DEC-REF-128 — huella de estado por regla
  await hydrateSiteState(SITE_ID, siteState);
  // spec_cascada_ficha C3 — parámetros de instalación (device.refParams) como pseudo-vars.
  const nRef = await refreshRefParams(SITE_ID, siteState);
  console.log(`[edge-engine] Parámetros de instalación (refParams) cargados: ${nRef}`);
  // DEC-REF-115 (#85) — config de autonomía (ficha + override por equipo).
  let autonomyConfigs = await loadAutonomyConfigs(SITE_ID);
  // Auditoría 2026-10-14 (M-07/M-21) — tipos de variable desde la FICHA.
  let variableTypes = await loadVariableTypes(SITE_ID);
  await ruleLog.loadLabels(SITE_ID);
  // motor M Ola M3 — hidrata los acumuladores persistentes (accumulator/cumulativeSince).
  const nMsoft = await loadMSoftState(SITE_ID, mState);
  // G1a — hidratar el GRAFCET (cierra M-05: sin re-notificar lo abierto, y lo despejado
  // durante la caída se resuelve en la primera evaluación).
  let ruleById = ruleIndex(packs);
  logRules = ruleById;
  const fsmRows = await fsmStore.load();
  fsm.hydrate(fsmRows.filter(r => ruleById.has(r.ruleId)));
  for (const r of fsmRows) {
    if (ruleById.has(r.ruleId)) {
      if (r.alarmOpen) { activeState.set(r.key, r.firedAt || Date.now()); cooldownState.set(r.key, r.firedAt || Date.now()); }
      continue;
    }
    // Regla quitada mientras el edge estaba caído: cerrar lo abierto (no muere en silencio).
    if (r.alarmOpen) {
      activeState.set(r.key, r.firedAt || Date.now());
      fireResolve({
        rule: { ruleId: r.ruleId, inferenceId: null, label: r.ruleId, severity: 'info', variable: null },
        deviceId: r.dId || '', stateKey: r.key, reason: 'rule-removed', mode: 'resolve-by-edit',
        cooldownState, siteState, activeState,
      });
    }
    fsmStore.remove(r.key);
  }
  // G1b · caso raro #4 — confirmaciones hechas con el edge caído: alarmas manuales
  // abiertas sin confirmar cuyo fire ya tiene ackAt en Mongo → aplicar el ack.
  try {
    const pend = [...fsm.instances.values()].filter(i => i.alarmOpen && !i.acked && ruleById.has(i.ruleId) && ruleById.get(i.ruleId).reset_behavior === 'manual');
    for (const inst of pend) {
      const n = await mongoose.connection.db.collection('notifications').findOne(
        { ruleId: inst.ruleId, siteId: SITE_ID, ...(ruleById.get(inst.ruleId).type === 'cross' ? {} : { dId: inst.dId }),
          kind: { $ne: 'resolve' }, ackAt: { $ne: null }, time: { $gte: (inst.firedAt || 0) - 60000 } },
        { sort: { time: -1 }, projection: { acknowledgedBy: 1, dId: 1 } });
      if (n) {
        const r = fsm.command(ruleById.get(inst.ruleId), inst.key, 'ack', { dId: inst.dId, by: n.acknowledgedBy }, Date.now());
        console.log(`[edge-engine] G1b: confirmación pendiente aplicada a ${inst.key} → ${r}`);
      }
    }
  } catch (e) { console.error('[edge-engine] G1b reconciliación de confirmaciones:', e.message); }
  fsmStore.start();
  console.log(`[edge-engine] GRAFCET: ${fsm.instances.size} instancia(s) hidratada(s) · ${[...fsm.instances.values()].filter(i => i.alarmOpen).length} alarma(s) abierta(s)`);
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
      processStalenessTick({ packs, siteState, mState, fsm });
    } catch (e) {
      console.error('[edge-engine] staleness tick error:', e.message);
    }
  }, EDGE_TICK_SEC * 1000);

  // G1a — tick del GRAFCET (esperas y cierres vencidos con la última receptividad).
  setInterval(() => {
    try {
      processCombinedTick({ packs, siteState, mState, fsm });   // spec_reglas_compuestas — combinadas
      fsm.tick(ruleById, Date.now());
      processSilenceTick({ ruleById, siteState, fsm, silenceMs: FSM_SILENCE_SEC * 1000, startedAt: EDGE_STARTED_AT });
      processWindowTick({ ruleById, windowState, fsm });   // G1d — ventanas S que se vacían solas
    }
    catch (e) { console.error('[edge-engine] fsm tick error:', e.message); }
  }, FSM_TICK_SEC * 1000);

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
      const nextStateSnap = buildStateSnapshot(nextPacks);
      // DEC-REF-115 (#85) — el mismo canal SF-3 recarga la config de
      // autonomía (PUT /equipmentsheet y PUT /device/autonomy publican acá).
      const nextAutonomy = await loadAutonomyConfigs(SITE_ID);
      const nextVarTypes = await loadVariableTypes(SITE_ID);
      ruleLog.loadLabels(SITE_ID);
      // C3 — PUT /device/refparams publica reload: refrescar los parámetros de instalación.
      await refreshRefParams(SITE_ID, siteState);
      const diff      = diffSnapshots(ruleSnapshot, nextSnap);
      // DEC-REF-128 (A9) — limpiar estado (buffers/acumuladores) SOLO de reglas
      // removidas o cuya HUELLA DE ESTADO cambió. Editar umbral/severidad/texto NO
      // invalida el acc (la vida de aceite acumulada sobrevive la edición).
      const stateChanged = diff.changed.filter(id => stateSnapshot.get(id) !== nextStateSnap.get(id));
      const toClean   = [...diff.removed, ...stateChanged];
      // spec_grafcet_g1c — TODA edición (umbral, banda, tiempos, textos o huella) cierra la alarma
      // abierta por edición y vuelve la instancia a E1. El estado acumulado (acc, buffers M,
      // ventanas S) se sigue borrando SOLO si cambió la huella (DEC-REF-128).
      const edited    = [...diff.removed, ...diff.changed];
      const softEdited = diff.changed.filter(id => !stateChanged.includes(id));

      // SF-4 · DEC-REF-64.a — capturar defs VIEJAS de reglas que van a ser
      // limpiadas Y que están ACTIVAS. Las necesitamos para construir
      // fireResolve antes del swap; después del swap, `packs` cambió y ya
      // no tenemos la definición vieja de una regla eliminada.
      const oldRuleDefs = new Map();
      if (edited.length > 0) {
        for (const pack of packs) {
          for (const rule of (pack.rules || [])) {
            // DEC-REF-122 — def por ruleId (igual para todas las instancias). El
            // gate de "activa" ya no es por ruleId (activeState es por instancia);
            // lo resuelve resolvedRuleIds abajo.
            if (edited.includes(rule.ruleId)) {
              oldRuleDefs.set(rule.ruleId, rule);
            }
          }
        }
      }

      const { deletedCount, resolvedRuleIds } = cleanupStateForRules(toClean, {
        cooldownState, windowState, crossState, activeState, mState, siteCode: SITE_ID,
      });
      // G1c — ediciones sin cambio de huella: capturar sus alarmas abiertas y limpiar solo los
      // temporizadores (cooldown, cross start/fired); acc/ventanas se conservan.
      const soft = cleanupStateForRules(softEdited, { cooldownState, crossState, activeState, siteCode: SITE_ID });
      resolvedRuleIds.push(...soft.resolvedRuleIds);

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

      // G1a — las instancias del GRAFCET de esas reglas vuelven a cero (E0 → E1 al recargar).
      for (const inst of fsm.drop(edited)) fsmStore.remove(inst.key);

      // DEC-REF-128 (A9.2) — borrar la persistencia de acumuladores de reglas
      // ELIMINADAS (no editadas): una regla recreada con el mismo ruleId no debe
      // rehidratar un acc obsoleto. Fire-and-forget (no introduce await antes del swap).
      if (diff.removed.length) {
        deleteMSoftState(SITE_ID, diff.removed).catch(e => console.error('[msoftstate] delete error:', e.message));
      }

      // Swap sincrónico post-await — no hay await entre estas líneas.
      packs = nextPacks;
      ruleById = ruleIndex(nextPacks);
      logRules = ruleById;
      ruleSnapshot = nextSnap;
      stateSnapshot = nextStateSnap;
      // Auditoría 2026-10-14 (M-24) — resetear historial SOLO de los equipos cuya
      // config de autonomía cambió (antes: todos, en cada reload de cualquier pack).
      const autonomyChanged = changedAutonomyDIds(autonomyConfigs, nextAutonomy);
      autonomyConfigs = nextAutonomy;
      variableTypes = nextVarTypes;
      resetAutonomyRuntime(autonomyChanged);
      resetEfficiencyRuntime();
      // G1c — "repite el proceso" al instante con el último valor conocido (D, C, cross).
      const nRe = diff.changed.length
        ? reevaluateRules({ ruleIds: diff.changed, packs, siteState, cooldownState, windowState, activeState, mState, fsm })
        : 0;

      console.log(
        `[edge-engine] Reload OK — packs: ${nextPacks.map(p => p.packId).join(', ') || '(ninguno)'} · ` +
        `reglas nuevas: ${diff.added.length} [${diff.added.join(', ')}] · ` +
        `editadas: ${diff.changed.length} [${diff.changed.join(', ')}] · ` +
        `eliminadas: ${diff.removed.length} [${diff.removed.join(', ')}] · ` +
        `intactas: ${diff.unchanged.length} · keys estado borradas: ${deletedCount}` +
        (resolvedRuleIds.length ? ` · resolve-by-edit: ${resolvedRuleIds.length} [${resolvedRuleIds.map(r => r.stateKey).join(', ')}]` : '') +
        (nRe ? ` · reevaluadas al instante: ${nRe}` : '')
      );
    } catch (err) {
      console.error(
        `[edge-engine] Reload FAILED — motor conserva packs vigentes (${packs.length} pack(s), ${ruleSnapshot.size} regla(s)): ${err.message}`
      );
    }
  }

  // G1b (DEC-REF-146 · Qb1) — comando humano por el canal de recarga: {cmd:'ack'|'service', ruleId, dId, siteId, by}.
  function handleCommand(c) {
    if (c.siteId && c.siteId !== SITE_ID) return;            // es de otro sitio
    const rule = ruleById.get(c.ruleId);
    if (!rule) { console.warn(`[edge-engine] Comando ${c.cmd} ignorado: regla ${c.ruleId} no cargada`); return; }
    // spec_reglas_compuestas — una combinada con ancla es por equipo; sin ancla, por sitio.
    const comb = isCombined(rule);
    const key = instanceKey(rule, rule.ruleId, c.dId, SITE_ID);
    if (c.cmd === 'service') {
      // Acumulado a 0 (y persistido por el flush de msoftstate) — cierra M-10. En una combinada:
      // todas sus condiciones "vida útil" de ese equipo.
      const mks = comb
        ? leavesOf(rule.crossExpr).filter(l => measureOf(l) === 'metric' && l.metric === 'accumulator').map(l => `${rule.ruleId}#${leafIds(rule).get(l)}:${c.dId}`)
        : (rule.metric === 'accumulator' ? [`${rule.ruleId}:${c.dId}`] : []);
      if (!mks.length) { console.warn(`[edge-engine] service ignorado: ${rule.ruleId} no es acumulador`); return; }
      for (const mk of mks) {
        const st = mState.get(mk) || { acc: 0, lastValue: null, lastTs: null };
        st.acc = 0; st._persist = true; st.dirty = true; mState.set(mk, st);
      }
      flushMSoftState(SITE_ID, mState).catch(e => console.error('[msoftstate] flush error:', e.message));
    }
    const r = fsm.command(rule, key, c.cmd, { dId: c.dId, by: c.by || null }, Date.now());
    console.log(`[edge-engine] Comando ${c.cmd} ${key} por ${c.by || '?'} → ${r}`);
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
      // G1b · Qb1 — payload con `cmd` = comando humano (ack/service), NO recarga.
      let ctl = null;
      try { ctl = JSON.parse(raw.toString()); } catch (_) { ctl = null; }
      if (ctl && (ctl.cmd === 'ack' || ctl.cmd === 'service') && ctl.ruleId) {
        try { handleCommand(ctl); } catch (e) { console.error('[edge-engine] comando error:', e.message); }
        return;
      }
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

    const rawValue = payload.value;
    if (rawValue === undefined) return;

    const deviceState = siteState.get(dId);
    // Auditoría 2026-10-14 (M-07/M-21) — normalizar según el type de la FICHA.
    // Calidad mala (null, "", "ERR", NaN, bool en variable numérica): el equipo
    // cuenta como vivo (_lastSeen) pero el valor NO entra al estado ni al motor
    // → no dispara NI resuelve nada.
    const vtype = (variableTypes.get(deviceState._deviceType) || new Map()).get(variable) || null;
    const norm = normalizeValue(rawValue, vtype);
    if (!norm.ok) {
      deviceState._lastSeen = eventTs;
      console.warn(`[edge-engine] Valor descartado ${dId}/${variable}: ${norm.reason}`);
      return;
    }
    const value = norm.value;
    deviceState[variable] = value;
    // SF-6 · DEC-REF-65.b — timestamp por variable, aditivo al shape actual.
    // Las hojas equipo existentes siguen leyendo `deviceState[variable]` como
    // escalar (sin cambio). La hoja de suma (SF-6) consulta
    // `deviceState._lastUpdate[variable]` para verificar frescura antes de
    // sumar. Ventana calculada en typeCross.js:evaluateSum.
    if (!deviceState._lastUpdate) deviceState._lastUpdate = {};
    deviceState._lastUpdate[variable] = eventTs;
    // DEC-REF-129 (A7) — último mensaje del EQUIPO (cualquier variable): staleness
    // mide el silencio a nivel equipo, no por variable (typeM.evaluateStaleness).
    deviceState._lastSeen = eventTs;

    // DEC-REF-115 (#85) — si el mensaje es la variable de combustible (o la
    // de marcha) de un equipo con autonomía configurada, derivar y publicar
    // autonomy_hours (+ autonomy_source: 'measured'|'estimated').
    maybeComputeAutonomy({ client, configs: autonomyConfigs, dId, variable, value, eventTs });

    // spec_deteccion_sifoneo_eficiencia — consumo específico (L/kWh) para el baseline
    // de deficiencia. userId del cfg de autonomía si existe (gensets), si no el del topic.
    const effUserId = (autonomyConfigs.get(dId) || {}).userId || userId;
    maybeComputeEfficiency({ client, userId: effUserId, dId, variable, deviceState, eventTs });

    processMessage({ dId, variable, value, siteState, packs, cooldownState, windowState, activeState, mState, eventTs, fsm });
  });

  client.on('error', err => {
    console.error('[edge-engine] Error MQTT:', err.message);
  });

  process.on('SIGTERM', async () => {
    console.log('[edge-engine] SIGTERM — cerrando...');
    // DEC-REF-128 (A16) — flush final de acumuladores dirty antes de desconectar
    // (sin esto se perdía hasta MSOFT_FLUSH_SEC de acumulado por reinicio).
    try { const n = await flushMSoftState(SITE_ID, mState); if (n) console.log(`[edge-engine] flush final: ${n} acumulador(es)`); }
    catch (e) { console.error('[msoftstate] flush final error:', e.message); }
    // G1a — flush final del GRAFCET y la bitácora.
    try { fsmStore.stop(); await fsmStore.flush(); } catch (e) { console.error('[fsmStore] flush final error:', e.message); }
    client.end();
    await mongoose.disconnect();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('[edge-engine] Error de arranque:', err.message);
  process.exit(1);
});
