// SF-3 hot-reload — huellas de reglas, diff entre snapshots y limpieza D3.
// DEC-REF-58 (marco) + DEC-REF-61.d (SHA-256 por regla) + DEC-REF-61.e (política D3).
//
// Snapshot: Map<ruleId, hash>. La huella se calcula sobre el JSON.stringify de
// la definición íntegra tal como viene del pack (SIN filtrar campos): cualquier
// cambio semántico — condition, threshold, severity, crossExpr, cooldownSec,
// graceSec — cambia la huella. Falsos positivos posibles (reordenamiento de
// keys en un pack re-guardado por otro cliente) son aceptables: peor caso
// limpian estado de una regla intacta, resultado equivalente a acabar de crear
// la regla — el motor sigue correcto, solo pierde la protección de cooldown
// una vez.

const crypto = require('crypto');

// hashRule(rule) — huella determinística. JSON.stringify no garantiza orden
// de keys, pero Node/V8 lo emiten en orden de inserción — estable para el
// mismo objeto en la misma máquina. Un pack releído de Mongo entre dos
// reloads produce el mismo shape porque mongoose usa el mismo schema.
function hashRule(rule) {
  return crypto.createHash('sha256').update(JSON.stringify(rule)).digest('hex');
}

// buildSnapshot(packs) — Map<ruleId, hash>. ruleId es único ACROSS packs
// (garantía asumida — si dos packs comparten ruleId, el segundo sobreescribe;
// el motor tampoco tiene forma de distinguirlos porque ruleEngine.js:12-13
// itera todos los packs por mensaje sin scope de packId).
function buildSnapshot(packs) {
  const snap = new Map();
  for (const pack of packs) {
    for (const rule of (pack.rules || [])) {
      snap.set(rule.ruleId, hashRule(rule));
    }
  }
  return snap;
}

// DEC-REF-128 (A9) — huella de ESTADO: SOLO los campos que definen CÓMO se computa
// el buffer/acumulador. Si cambian, el estado viejo no aplica → se limpia el mState.
// Un cambio de condition(umbral)/severity/textos/cooldown/grace NO toca esta huella
// → el `acc` acumulado (vida de aceite, consumo desde recarga) sobrevive la edición.
const STATE_FIELDS = ['type', 'deviceType', 'variable', 'metric', 'mWindow', 'mParams', 'inputs', 'crossExpr', 'window', 'setpointSource'];
function stateFingerprint(rule) {
  const o = {};
  for (const f of STATE_FIELDS) o[f] = rule[f] === undefined ? null : rule[f];
  return crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
}
function buildStateSnapshot(packs) {
  const snap = new Map();
  for (const pack of packs) {
    for (const rule of (pack.rules || [])) {
      snap.set(rule.ruleId, stateFingerprint(rule));
    }
  }
  return snap;
}

// diffSnapshots(oldSnap, newSnap) — categoriza ruleIds según D3 (DEC-REF-58):
//   removed  → estaba en viejo, ausente en nuevo   → limpiar keys
//   changed  → mismo ruleId, hash distinto         → limpiar keys
//   unchanged→ mismo ruleId, mismo hash            → preservar
//   added    → ausente en viejo, presente en nuevo → sin acción (entra de cero)
// Retorna arrays de ruleId (sin el hash — el caller no lo necesita).
function diffSnapshots(oldSnap, newSnap) {
  const removed = [];
  const changed = [];
  const unchanged = [];
  const added = [];

  for (const [ruleId, oldHash] of oldSnap) {
    if (!newSnap.has(ruleId)) {
      removed.push(ruleId);
    } else if (newSnap.get(ruleId) !== oldHash) {
      changed.push(ruleId);
    } else {
      unchanged.push(ruleId);
    }
  }
  for (const ruleId of newSnap.keys()) {
    if (!oldSnap.has(ruleId)) added.push(ruleId);
  }

  return { removed, changed, unchanged, added };
}

// cleanupStateForRules(ruleIds, ...) — borra TODAS las keys asociadas a esas
// reglas de los Maps de estado del motor. Enumera aquí los formatos cubiertos
// (fuente de verdad debe quedar visible en el fix, no diseminada):
//
//   cooldownState:
//     `${ruleId}`                            → fireAlarm    (ruleEngine.js:148)
//     `${ruleId}:no-setpoint`                → EDGE-2 INFO  (ruleEngine.js:50-52)
//     `${ruleId}:no-setpoint:start`          → EDGE-2 start (ruleEngine.js:56)
//     `${ruleId}:no-setpoint:escalated`      → EDGE-2 esc.  (ruleEngine.js:89)
//   windowState:
//     `${ruleId}`                            → typeS        (typeS.js:19)
//   crossState:
//     `${siteCode}:${ruleId}:start`          → typeCross    (typeCross.js:90)
//     `${siteCode}:${ruleId}:fired`          → typeCross    (typeCross.js:91)
//   activeState (SF-4 · DEC-REF-64.a):
//     `${ruleId}`                            → fire vigente (ruleEngine.js:148/fireAlarm)
//
// **Nota arquitectónica SF-4**: para preservar `reloadState.js` como módulo
// puro (sin dep de notify/fireResolve), NO borramos `activeState` acá.
// Retornamos `resolvedRuleIds` con las reglas que estaban ACTIVAS al momento
// del reload; el caller (index.js/reloadPacks) emite `fireResolve` por cada
// una — que borra el flag al finalizar. Efecto: mismo resultado, cero
// acoplamiento del módulo puro con los canales de notificación.
//
// Nuevos formatos de key en el futuro deben agregarse acá o el reload los
// dejaría zombies.
// DEC-REF-122 — el estado se clava por INSTANCIA (`${ruleId}:${dId}` o
// `${ruleId}:${siteCode}`), y las sub-keys cuelgan de ahí (`:no-setpoint*`,
// `:resolveStart`). La limpieza es por PREFIJO `${ruleId}:` (más la key exacta
// `ruleId` legacy), lo que cubre TODAS las instancias y sub-keys de una vez —
// incluido el `:resolveStart` que antes quedaba zombie (A10). El `:` separador
// evita colisión entre ruleIds donde uno es prefijo de otro (p.ej. `gen-fuel`
// vs `gen-fuel-crit`): `gen-fuel-crit:dev` NO empieza con `gen-fuel:`.
// crossState usa prefijo propio `${siteCode}:${ruleId}:` → se limpia aparte.
// activeState NO se borra acá (lo hace el fireResolve del caller); se CAPTURAN
// las instancias activas para el resolve-by-edit (una por equipo/sitio).
function cleanupStateForRules(ruleIds, { cooldownState, windowState, crossState, activeState, mState, siteCode }) {
  let deletedCount = 0;
  const ruleIdSet = new Set(ruleIds);
  const matchRuleId = (k) => {
    for (const ruleId of ruleIdSet) {
      if (k === ruleId || k.startsWith(`${ruleId}:`)) return ruleId;
    }
    return null;
  };
  const purge = (map) => {
    if (!map) return;
    for (const k of [...map.keys()]) {
      if (matchRuleId(k)) { map.delete(k); deletedCount++; }
    }
  };
  purge(cooldownState);   // cooldown + :resolveStart + :no-setpoint*
  purge(windowState);     // typeS (por dId)
  purge(mState);          // typeM (ya era por dId)
  if (crossState && siteCode) {
    for (const ruleId of ruleIdSet) {
      for (const sfx of ['start', 'fired', 'resolveStart']) {
        if (crossState.delete(`${siteCode}:${ruleId}:${sfx}`)) deletedCount++;
      }
    }
  }
  // Capturar instancias ACTIVAS (sin borrar — el fireResolve del caller borra el flag).
  const resolvedRuleIds = [];
  if (activeState) {
    for (const k of activeState.keys()) {
      const ruleId = matchRuleId(k);
      if (ruleId) {
        resolvedRuleIds.push({ ruleId, stateKey: k, suffix: k === ruleId ? null : k.slice(ruleId.length + 1) });
      }
    }
  }
  return { deletedCount, resolvedRuleIds };
}

module.exports = { hashRule, buildSnapshot, stateFingerprint, buildStateSnapshot, diffSnapshots, cleanupStateForRules };
