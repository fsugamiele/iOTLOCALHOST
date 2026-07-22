require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');

// #52/C2 — Migración A (aditiva) — DEC-REF-75 §2.
// Backfill de `unit` (regex anclado, solo float) + asignación determinística
// del campo `widget` a los 42 legacy. Escribe por driver crudo (nunca por
// el modelo Mongoose) para evitar el efecto "strict:true silenciando keys
// sin declarar" (lección D3 #42) y no re-escribir defaults del sub-schema
// que hoy no están en Mongo.
//
// Idempotencia POR CAMPO: solo escribe unit si w.unit === undefined; solo
// escribe widget si w.widget === undefined. Correr el script dos veces no
// re-escribe. Widgets con shape rico (widget/unit ya presentes) quedan
// intactos.
//
// P5 = RAMA-5a (devices.js:56-70 hace JOIN en lectura, cero copia embebida)
// → NO se extiende a devices.
//
// Uso:
//   node seeds/migrate_widget_subschema.js --dry-run     (imprime tabla, no escribe)
//   node seeds/migrate_widget_subschema.js               (aplica; backup automático)
//   node seeds/migrate_widget_subschema.js --restore <backup.json>
//
// Precedentes estructurales: seeds/migrate_tenant4_userid.js (#33.1),
// seeds/migrate_tenant9_saverrules.js (#41-R3).

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

// Nombre de la colección — default 'templates'. Se sobreescribe con
// TARGET_COLLECTION=<name> para round-trip tests sobre colecciones scratch.
const COLLECTION = process.env.TARGET_COLLECTION || 'templates';

// ---------------------------------------------------------------------------
// Mapeo determinístico legacy → tipo (DEC-REF-75 §2, orden literal).
// ---------------------------------------------------------------------------
function mapWidgetType(w, unitExtracted) {
  const vt = w.variableType;
  const name = w.variable || '';
  if (vt === 'bool')        return 'booleanDwell';
  if (vt === 'categorical') return 'multiState';
  if (vt === 'int') {
    if (/^bitmap_/.test(name))                     return 'equipmentAlarms';
    if (/_count$|_failed$|_attempts$/.test(name))  return 'counter';
    return 'valueStatus';
  }
  if (vt === 'float') {
    if (/_level$/.test(name) && unitExtracted === '%') return 'tankLevel';
    if (/_hours$|_kwh$|^run_/.test(name))              return 'counter';
    return 'valueStatus';
  }
  return null;
}

// Backfill de `unit`: regex ANCLADO AL FINAL, solo si variableType === 'float'.
// Desvío deliberado respecto al del runtime (no anclado) — DEC-REF-75 §2.
// El anclaje evita capturar (42100) de los bitmaps como unidad.
function extractUnit(w) {
  if (w.variableType !== 'float') return '';
  const label = w.variableFullName || '';
  const m = label.match(/\(([^)]+)\)$/);
  return m ? m[1] : '';
}

// ---------------------------------------------------------------------------
// Restore: replaceOne por _id vía bulkWrite. PROHIBIDO deleteMany+insertMany.
// ---------------------------------------------------------------------------
async function restore(backupPath) {
  const abs = path.resolve(backupPath);
  if (!fs.existsSync(abs)) {
    console.error('[migrate-widgets][restore] FATAL: archivo no existe:', abs);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!data || !Array.isArray(data.entries)) {
    console.error('[migrate-widgets][restore] FATAL: backup malformado (esperado { entries: [...] }):', abs);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-widgets][restore] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
  console.log('[migrate-widgets][restore] backup origen:', abs, '(', data.entries.length, 'entradas )');

  const col = mongoose.connection.db.collection(COLLECTION);
  const ops = data.entries
    .filter(e => e.collection === 'templates')
    .map(e => {
      // Clonar y quitar _id del replacement: el filter usa ObjectId(e._id)
      // pero e.doc._id vino serializado como String (JSON no tiene ObjectId).
      // Con _id presente Mongo rechaza replaceOne por "immutable field _id
      // was altered" (tipos distintos). El filtro sigue identificando el doc.
      const replacement = { ...e.doc };
      delete replacement._id;
      return {
        replaceOne: {
          filter: { _id: new mongoose.Types.ObjectId(e._id) },
          replacement,
        }
      };
    });

  if (ops.length === 0) {
    console.warn('[migrate-widgets][restore] ⚠ 0 operaciones válidas en el backup');
    await mongoose.disconnect();
    return;
  }

  const res = await col.bulkWrite(ops, { ordered: true });
  console.log('[migrate-widgets][restore] bulkWrite result:',
              'matched=', res.matchedCount,
              'modified=', res.modifiedCount);

  await mongoose.disconnect();
  console.log('[migrate-widgets][restore] listo.');
}

// ---------------------------------------------------------------------------
// Plan: recorre los 42 widgets, calcula la tabla determinística.
// Devuelve { rows, writes } sin escribir nada.
// ---------------------------------------------------------------------------
async function buildPlan() {
  const col = mongoose.connection.db.collection(COLLECTION);
  const templates = await col.find({}).toArray();

  const rows = [];
  const writes = new Map();      // _id → { widgets: [array a persistir] }
  let totalWidgets = 0;
  let unitBackfills = 0, unitSkips = 0;
  let widgetBackfills = 0, widgetSkips = 0;

  for (const t of templates) {
    const newWidgets = [];
    for (let i = 0; i < (t.widgets || []).length; i++) {
      const w = t.widgets[i];
      totalWidgets++;
      const unitExtracted = extractUnit(w);
      const typeAssigned  = mapWidgetType(w, unitExtracted);

      const willWriteUnit   = (w.unit   === undefined);
      const willWriteWidget = (w.widget === undefined);

      if (willWriteUnit)   unitBackfills++;   else unitSkips++;
      if (willWriteWidget) widgetBackfills++; else widgetSkips++;

      // Idempotencia POR CAMPO: nunca sobreescribe si ya existe.
      const wOut = { ...w };
      if (willWriteUnit)   wOut.unit   = unitExtracted;
      if (willWriteWidget) wOut.widget = typeAssigned;
      newWidgets.push(wOut);

      rows.push({
        template:      t.name,
        variable:      w.variable,
        variableType:  w.variableType,
        label:         w.variableFullName,
        unitExtracted: willWriteUnit   ? unitExtracted : `(skip: keep=${JSON.stringify(w.unit)})`,
        widget:        willWriteWidget ? typeAssigned  : `(skip: keep=${JSON.stringify(w.widget)})`,
      });
    }
    // Guarda si HAY que escribir (al menos un cambio en el array)
    writes.set(String(t._id), {
      _id:    t._id,
      docPre: t,
      widgetsPost: newWidgets,
    });
  }

  return { templates, rows, writes, totalWidgets, unitBackfills, unitSkips, widgetBackfills, widgetSkips };
}

function printTable(rows) {
  const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
  const H1 = pad('template', 28);
  const H2 = pad('variable', 24);
  const H3 = pad('varType', 12);
  const H4 = pad('label', 34);
  const H5 = pad('unit', 22);
  const H6 = pad('widget', 20);
  console.log(H1, H2, H3, H4, H5, H6);
  console.log('-'.repeat(28), '-'.repeat(24), '-'.repeat(12), '-'.repeat(34), '-'.repeat(22), '-'.repeat(20));
  for (const r of rows) {
    console.log(pad(r.template, 28), pad(r.variable, 24), pad(r.variableType, 12),
                pad(r.label, 34), pad(r.unitExtracted, 22), pad(r.widget, 20));
  }
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------
async function dryRun() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-widgets][dry-run] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  const plan = await buildPlan();
  console.log('\n=== TABLA DETERMINÍSTICA (', plan.totalWidgets, 'widgets ) ===\n');
  printTable(plan.rows);

  console.log('\n=== RESUMEN ===');
  console.log('  widgets totales:  ', plan.totalWidgets);
  console.log('  unit backfills:   ', plan.unitBackfills,   '| skips (unit ya presente):  ', plan.unitSkips);
  console.log('  widget backfills: ', plan.widgetBackfills, '| skips (widget ya presente):', plan.widgetSkips);
  console.log('\n[migrate-widgets][dry-run] cero escrituras realizadas.');
  await mongoose.disconnect();
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------
function tsStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function apply() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-widgets][apply] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  const col = mongoose.connection.db.collection(COLLECTION);

  // 1. Backup ANTES del primer write, verificado por count
  const cntBefore = await col.countDocuments({});
  const allDocs = await col.find({}).toArray();
  if (allDocs.length !== cntBefore) {
    console.error('[migrate-widgets][apply] FATAL: count mismatch pre-backup', allDocs.length, 'vs', cntBefore);
    process.exit(1);
  }
  const backupPath = path.resolve(__dirname, '_dev', `backup_widgets_${tsStamp()}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    entries: allDocs.map(d => ({ collection: 'templates', _id: String(d._id), doc: d })),
  }, null, 2));
  console.log('[migrate-widgets][apply] backup:', backupPath, '(', allDocs.length, 'docs)');

  // 2. Plan y writes
  const plan = await buildPlan();
  console.log('\n=== TABLA DETERMINÍSTICA (', plan.totalWidgets, 'widgets ) ===\n');
  printTable(plan.rows);

  const ops = [];
  for (const { _id, widgetsPost } of plan.writes.values()) {
    ops.push({
      updateOne: {
        filter: { _id },
        update: { $set: { widgets: widgetsPost } },
      }
    });
  }
  if (ops.length === 0) {
    console.log('[migrate-widgets][apply] cero updates. nada que hacer.');
    await mongoose.disconnect();
    return;
  }
  const res = await col.bulkWrite(ops, { ordered: true });
  console.log('\n[migrate-widgets][apply] bulkWrite:',
              'matched=', res.matchedCount,
              'modified=', res.modifiedCount);

  await mongoose.disconnect();
  console.log('[migrate-widgets][apply] listo. restore con:');
  console.log('    node seeds/migrate_widget_subschema.js --restore ' + backupPath);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--restore') {
    if (!args[1]) { console.error('FATAL: --restore requiere ruta al backup'); process.exit(1); }
    await restore(args[1]);
    return;
  }
  if (args[0] === '--dry-run') { await dryRun(); return; }
  await apply();
})().catch(err => { console.error(err); process.exit(1); });
