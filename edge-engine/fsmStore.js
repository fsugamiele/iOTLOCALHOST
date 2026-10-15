// spec_grafcet_g1.md · G1a (DEC-REF-145) — persistencia del GRAFCET de reglas.
//
//   rulefsm          una fila por instancia que NO está en reposo (Vigilando sin alarma
//                    no se guarda: es el estado por defecto). Sobrevive reinicios del edge
//                    → sin re-notificaciones y con cierre de lo que se despejó (M-05).
//   ruletransitions  la bitácora: un renglón por cambio de etapa. Vence a los 30 días (Q3).
//
// Escritura en lote (≤ FLUSH_MS), nunca en el camino caliente del mensaje. Si Mongo falla
// el motor sigue en memoria: se reintenta en el próximo flush; la bitácora puede perder
// renglones (contador `dropped`) pero nunca bloquea la evaluación (caso raro #15).

const mongoose = require('mongoose');
const { toRow } = require('./ruleFsm');

const TRACE_TTL_SEC = 30 * 24 * 3600;      // Q3 firmada: 30 días
const FLUSH_MS = parseInt(process.env.FSM_FLUSH_MS || '1000', 10);
const TRACE_MAX_QUEUE = 5000;              // tope de la cola si Mongo no responde

const RuleFsmRow = mongoose.models.RuleFsm || mongoose.model('RuleFsm',
  new mongoose.Schema({
    siteId:     { type: String, required: true },
    key:        { type: String, required: true },
    ruleId:     String,
    ruleType:   String,
    dId:        String,
    step:       String,
    since:      Number,
    alarmOpen:  Boolean,
    firedAt:    Number,
    graceStart: Number,
    closeStart: Number,
    lastR:      mongoose.Schema.Types.Mixed,
    lastCtx:    mongoose.Schema.Types.Mixed,
    updatedAt:  Number,
  }, { collection: 'rulefsm' }).index({ siteId: 1, key: 1 }, { unique: true })
);

const traceSchema = new mongoose.Schema({
  siteId:        String,
  key:           String,
  ruleId:        String,
  dId:           String,
  from:          String,
  to:            String,
  transition:    String,
  receptivity:   mongoose.Schema.Types.Mixed,
  value:         mongoose.Schema.Types.Mixed,
  thresholdUsed: mongoose.Schema.Types.Mixed,
  action:        String,
  ts:            Date,
}, { collection: 'ruletransitions' });
traceSchema.index({ ts: 1 }, { expireAfterSeconds: TRACE_TTL_SEC });   // caso raro #18: idempotente
traceSchema.index({ siteId: 1, ruleId: 1, ts: -1 });
const RuleTransition = mongoose.models.RuleTransition || mongoose.model('RuleTransition', traceSchema);

function createFsmStore(siteId) {
  const pendingRows = new Map();   // key → fila (o {deleted:true})
  let traceQueue = [];
  let dropped = 0;
  let timer = null;
  let flushing = false;

  // Reposo (Vigilando sin alarma) → se borra la fila; el resto se guarda.
  function save(inst) {
    if (inst.step === 'E1' && !inst.alarmOpen) pendingRows.set(inst.key, { deleted: true });
    else pendingRows.set(inst.key, toRow(inst));
  }
  function remove(key) { pendingRows.set(key, { deleted: true }); }

  function trace(t) {
    if (traceQueue.length >= TRACE_MAX_QUEUE) { traceQueue.shift(); dropped++; }
    traceQueue.push({ siteId, ...t, ts: new Date(t.ts) });
  }

  async function flush() {
    if (flushing) return 0;
    flushing = true;
    let n = 0;
    try {
      if (pendingRows.size) {
        const ops = [];
        for (const [key, row] of pendingRows) {
          ops.push(row.deleted
            ? { deleteOne: { filter: { siteId, key } } }
            : { updateOne: { filter: { siteId, key }, update: { $set: { ...row, siteId, updatedAt: Date.now() } }, upsert: true } });
        }
        const snapshot = new Map(pendingRows);
        try {
          await RuleFsmRow.bulkWrite(ops, { ordered: false });
          // Solo se limpia lo escrito si no cambió mientras tanto.
          for (const [key, row] of snapshot) if (pendingRows.get(key) === row) pendingRows.delete(key);
          n += ops.length;
        } catch (e) {
          console.error('[fsmStore] rulefsm flush error (se reintenta):', e.message);
        }
      }
      if (traceQueue.length) {
        const batch = traceQueue; traceQueue = [];
        try {
          await RuleTransition.insertMany(batch, { ordered: false });
          n += batch.length;
        } catch (e) {
          dropped += batch.length;
          console.error(`[fsmStore] bitácora: ${batch.length} renglón(es) no guardados (fsm_trace_dropped=${dropped}):`, e.message);
        }
      }
    } finally {
      flushing = false;
    }
    return n;
  }

  async function load() {
    return RuleFsmRow.find({ siteId }).lean();
  }

  function start() {
    if (!timer) timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  return { save, remove, trace, flush, load, start, stop, stats: () => ({ dropped, queued: traceQueue.length, pending: pendingRows.size }) };
}

module.exports = { createFsmStore, RuleFsmRow, RuleTransition, TRACE_TTL_SEC };
