// Persistencia de acumuladores del motor M (Ola M3) — spec_motor_m.md D2.
// "Producto, no demo" (Franco #88): los acumuladores (accumulator / cumulativeSince)
// NO viven solo en memoria — un reinicio del edge no puede perder la vida de aceite
// acumulada ni el consumo desde la recarga. Se persisten por (siteId, ruleId, dId).
//
// El estado caliente vive en `mState` (marcado `_persist:true`); este módulo lo
// HIDRATA al arrancar y FLUSHEA los `dirty` en un tick (throttle), no en cada mensaje.

const mongoose = require('mongoose');

const MSoftState = mongoose.models.MSoftState || mongoose.model('MSoftState',
  new mongoose.Schema({
    siteId:    { type: String, index: true },
    ruleId:    { type: String },
    dId:       { type: String },
    acc:       { type: Number, default: 0 },
    lastValue: { type: Number },
    updatedAt: { type: Number },
  }, { collection: 'msoftstate' })
);

function splitKey(key) {
  const i = key.lastIndexOf(':');   // key = `${ruleId}:${dId}` (ni ruleId ni dId llevan ':')
  return [key.slice(0, i), key.slice(i + 1)];
}

// Hidrata en mState los acumuladores persistentes del site. Devuelve cuántos cargó.
async function loadMSoftState(siteId, mState) {
  const rows = await MSoftState.find({ siteId }).lean();
  for (const r of rows) {
    mState.set(`${r.ruleId}:${r.dId}`, { acc: r.acc || 0, lastValue: r.lastValue, _persist: true, dirty: false });
  }
  return rows.length;
}

// Flushea a Mongo los `_persist` con `dirty` (upsert). Devuelve cuántos escribió.
async function flushMSoftState(siteId, mState) {
  const ops = [];
  for (const [key, st] of mState) {
    if (st && st._persist && st.dirty) {
      const [ruleId, dId] = splitKey(key);
      ops.push({
        updateOne: {
          filter: { siteId, ruleId, dId },
          update: { $set: { acc: st.acc, lastValue: st.lastValue, updatedAt: Date.now() } },
          upsert: true,
        },
      });
      st.dirty = false;
    }
  }
  if (ops.length) await MSoftState.bulkWrite(ops);
  return ops.length;
}

// DEC-REF-128 (A9.2) — borra la persistencia de acumuladores de reglas ELIMINADAS
// (no editadas): evita que una regla recreada con el mismo ruleId rehidrate un acc
// obsoleto. Se llama desde el reload solo con los ruleIds removidos del pack.
async function deleteMSoftState(siteId, ruleIds) {
  if (!ruleIds || !ruleIds.length) return 0;
  const r = await MSoftState.deleteMany({ siteId, ruleId: { $in: ruleIds } });
  return (r && (r.deletedCount != null ? r.deletedCount : r.n)) || 0;
}

module.exports = { MSoftState, loadMSoftState, flushMSoftState, deleteMSoftState };
