// spec_grafcet_g1.md · G1a (DEC-REF-145) — GRAFCET por instancia de regla.
//
// Cada instancia (DEC-REF-122: `ruleId:dId`, cross `ruleId:siteCode`) está SIEMPRE en una
// sola etapa. Los evaluadores de cada tipo solo entregan la RECEPTIVIDAD; acá vive todo
// el estado temporal (espera, histéresis, cierre, sin datos, alarma abierta).
//
// Receptividad `r` (la calcula ruleEngine por tipo):
//   'on'   → la condición se cumple
//   'band' → no se cumple, pero sigue dentro de la banda de histéresis (no alcanza para cerrar)
//   'off'  → no se cumple y cruzó la banda (alcanza para cerrar)
//   null   → no evaluable (dato malo, insuficiente, hoja requerida desconocida)
//
// Etapas: E1 Vigilando · E2 Observando · E3 Alarma · E4 Recuperándose · E5 Sin datos.
// (E0 Apagada = la instancia no existe: la borra drop() en el reload.)
//
// PURO: sin Mongo, sin MQTT, sin Date.now(). El reloj llega como argumento y las acciones
// (notificar, resolver, trazar, persistir) son callbacks inyectados → replay determinista.

const STEP_NAMES = { E1: 'Vigilando', E2: 'Observando', E3: 'Alarma', E4: 'Recuperándose', E5: 'Sin datos' };
const MAX_HOPS = 6;   // transiciones encadenadas en una misma evaluación (E5→E1→E2→E3 es la más larga)

function createRuleFsm({ onNotify, onResolve, onTransition, onPersist } = {}) {
  const instances = new Map();
  let currentRule = null;   // regla de la evaluación en curso (la reciben las acciones)

  function newInstance(key, rule, ctx, now) {
    return {
      key, ruleId: rule.ruleId, ruleType: rule.type, dId: (ctx && ctx.dId) || null,
      step: 'E1', since: now, alarmOpen: false, firedAt: null,
      graceStart: null, closeStart: null,
      lastR: undefined, lastCtx: null,
    };
  }

  // Una transición: cambia de etapa, ejecuta la acción asociada y la registra.
  function go(inst, to, transition, r, ctx, now, action) {
    const from = inst.step;
    inst.step = to;
    inst.since = now;
    if (action === 'notify') {
      inst.alarmOpen = true;
      inst.firedAt = now;
      if (onNotify) onNotify(inst, ctx, now, currentRule);
    } else if (action === 'resolve') {
      inst.alarmOpen = false;
      inst.firedAt = null;
      if (onResolve) onResolve(inst, ctx, now, currentRule);
    }
    if (onTransition) {
      onTransition({
        key: inst.key, ruleId: inst.ruleId, dId: (ctx && ctx.dId) || inst.dId,
        from, to, transition, receptivity: r === undefined ? null : r,
        value: ctx && ctx.value !== undefined ? ctx.value : null,
        thresholdUsed: ctx && ctx.thresholdUsed !== undefined ? ctx.thresholdUsed : null,
        action: action || null, ts: now,
      });
    }
  }

  // Un paso del GRAFCET con la receptividad vigente. Devuelve true si cambió de etapa.
  function stepOnce(inst, rule, r, ctx, now) {
    const graceMs = Math.max(0, Number(rule.graceSec) || 0) * 1000;
    const closeMs = Math.max(0, Number(rule.resolveGraceSec) || 0) * 1000;
    switch (inst.step) {
      case 'E1':
        if (r === null) { go(inst, 'E5', 'T15', r, ctx, now); return true; }
        if (r === 'on') { inst.graceStart = now; go(inst, 'E2', 'T12', r, ctx, now); return true; }
        return false;
      case 'E2':
        if (r === null) { inst.graceStart = null; go(inst, 'E5', 'T25', r, ctx, now); return true; }
        if (r !== 'on') { inst.graceStart = null; go(inst, 'E1', 'T21', r, ctx, now); return true; }
        if (now - inst.graceStart >= graceMs) { inst.graceStart = null; go(inst, 'E3', 'T23', r, ctx, now, 'notify'); return true; }
        return false;
      case 'E3':
        if (r === null) { go(inst, 'E5', 'T35', r, ctx, now); return true; }
        if (r === 'off') { inst.closeStart = now; go(inst, 'E4', 'T34', r, ctx, now); return true; }
        return false;   // 'on' o 'band' (histéresis): sigue en alarma
      case 'E4':
        if (r === null) { inst.closeStart = null; go(inst, 'E5', 'T45', r, ctx, now); return true; }
        if (r !== 'off') { inst.closeStart = null; go(inst, 'E3', 'T43', r, ctx, now); return true; }   // sin re-notificar
        if (now - inst.closeStart >= closeMs) { inst.closeStart = null; go(inst, 'E1', 'T41', r, ctx, now, 'resolve'); return true; }
        return false;
      case 'E5':
        if (r === null) return false;
        // Q1 — con alarma abierta vuelve a Alarma (y se reevalúa); sin alarma, a Vigilando.
        if (inst.alarmOpen) go(inst, 'E3', 'T53', r, ctx, now);
        else go(inst, 'E1', 'T51', r, ctx, now);
        return true;
      default:
        inst.step = 'E1';
        return true;
    }
  }

  // evaluate — entrada única desde el motor (mensaje o tick).
  function evaluate(rule, key, r, ctx, nowIn) {
    let inst = instances.get(key);
    if (!inst) { inst = newInstance(key, rule, ctx, nowIn); instances.set(key, inst); }
    // Caso raro #17 — el reloj de la instancia no retrocede (mensaje atrasado).
    const now = Math.max(Number(nowIn) || 0, inst.since || 0);
    inst.ruleType = rule.type;
    if (ctx && ctx.dId) inst.dId = ctx.dId;
    inst.lastR = r;
    if (ctx) inst.lastCtx = ctx;
    let changed = false;
    currentRule = rule;
    for (let i = 0; i < MAX_HOPS; i++) {
      if (!stepOnce(inst, rule, r, ctx, now)) break;
      changed = true;
    }
    if (changed && onPersist) onPersist(inst);
    return inst;
  }

  // tick — vence temporizaciones (espera / cierre) con la ÚLTIMA receptividad conocida.
  // No inventa datos: solo instancias en E2/E4 con receptividad no nula.
  // ruleById: Map<ruleId, rule> vigente.
  function tick(ruleById, now) {
    let n = 0;
    for (const inst of instances.values()) {
      if (inst.step !== 'E2' && inst.step !== 'E4') continue;
      if (inst.lastR === null || inst.lastR === undefined) continue;
      const rule = ruleById.get(inst.ruleId);
      if (!rule) continue;
      const before = inst.step;
      evaluate(rule, inst.key, inst.lastR, inst.lastCtx, now);
      if (inst.step !== before) n++;
    }
    return n;
  }

  // hydrate — instancias persistidas (rulefsm) al arrancar el edge.
  function hydrate(rows) {
    for (const r of rows || []) {
      instances.set(r.key, {
        key: r.key, ruleId: r.ruleId, ruleType: r.ruleType || null, dId: r.dId || null,
        step: r.step || 'E1', since: Number(r.since) || 0,
        alarmOpen: !!r.alarmOpen, firedAt: r.firedAt != null ? Number(r.firedAt) : null,
        graceStart: r.graceStart != null ? Number(r.graceStart) : null,
        closeStart: r.closeStart != null ? Number(r.closeStart) : null,
        lastR: r.lastR === undefined ? undefined : r.lastR,
        lastCtx: r.lastCtx || null,
      });
    }
    return instances.size;
  }

  // drop — borra las instancias de las reglas dadas (reload: quitada, apagada, cambió su
  // huella de estado). El resolve de las abiertas lo emite el caller ANTES (resolve-by-edit).
  function drop(ruleIds) {
    const set = new Set(ruleIds || []);
    const removed = [];
    for (const [key, inst] of instances) {
      if (set.has(inst.ruleId)) { instances.delete(key); removed.push(inst); }
    }
    return removed;
  }

  return { evaluate, tick, hydrate, drop, get: (k) => instances.get(k), instances };
}

// Vista persistible de una instancia (lo que guarda fsmStore).
function toRow(inst) {
  return {
    key: inst.key, ruleId: inst.ruleId, ruleType: inst.ruleType, dId: inst.dId,
    step: inst.step, since: inst.since, alarmOpen: inst.alarmOpen, firedAt: inst.firedAt,
    graceStart: inst.graceStart, closeStart: inst.closeStart,
    lastR: inst.lastR === undefined ? null : inst.lastR, lastCtx: inst.lastCtx || null,
  };
}

module.exports = { createRuleFsm, toRow, STEP_NAMES };
