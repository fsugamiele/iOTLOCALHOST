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
// reglas de los tres Maps de estado del motor. Enumera aquí los formatos
// cubiertos (fuente de verdad debe quedar visible en el fix, no diseminada):
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
//
// Nuevos formatos de key en el futuro (p.ej. resolve events SF-4) deben
// agregarse acá también o el reload los dejaría zombies.
function cleanupStateForRules(ruleIds, { cooldownState, windowState, crossState, siteCode }) {
  let deletedCount = 0;
  for (const ruleId of ruleIds) {
    if (cooldownState.delete(ruleId)) deletedCount++;
    if (cooldownState.delete(`${ruleId}:no-setpoint`)) deletedCount++;
    if (cooldownState.delete(`${ruleId}:no-setpoint:start`)) deletedCount++;
    if (cooldownState.delete(`${ruleId}:no-setpoint:escalated`)) deletedCount++;
    if (windowState.delete(ruleId)) deletedCount++;
    if (siteCode) {
      if (crossState.delete(`${siteCode}:${ruleId}:start`)) deletedCount++;
      if (crossState.delete(`${siteCode}:${ruleId}:fired`)) deletedCount++;
    }
  }
  return deletedCount;
}

module.exports = { hashRule, buildSnapshot, diffSnapshots, cleanupStateForRules };
