require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');

// #52/C4 — Migración B (destructiva sobre contenido) — DEC-REF-75-C.
// Limpia el paréntesis final de `variableFullName` en widgets cuyo `unit`
// ya fue capturado por C2. Post-C3/DEC-REF-75-C los consumidores ya leen
// widget.unit (LiveValue, DevicePanel, history.vue, HistoryChart).
//
// GUARDA DE IDEMPOTENCIA POR SUFIJO: solo escribe si el label termina EXACTO
// en `(<unit>)`. Segunda corrida = 0 cambios. Ya-corregidos por otra vía
// quedan intactos.
//
// Toca SOLO los 22 widgets con unit !== '' (verificado 22/22 en R-C4-b).
// Los 20 restantes (4 bitmap_*, 8 int, bool/categorical con paréntesis
// no-unidad como (PIR)/(corte/golpe)/(FFT), bool sin paréntesis) quedan
// intactos por construcción.
//
// Escribe por driver crudo (no por modelo), mismo criterio que C2.
//
// Backup PROPIO — REVIERTE SOLO C4. Para revertir C2 también, aplicar
// después el backup de C2.
//
// Uso:
//   node seeds/migrate_widget_labels.js --dry-run       (imprime tabla, no escribe)
//   node seeds/migrate_widget_labels.js                 (aplica; backup automático)
//   node seeds/migrate_widget_labels.js --restore <backup.json>

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

const COLLECTION = process.env.TARGET_COLLECTION || 'templates';

// ---------------------------------------------------------------------------
// Guarda de sufijo: solo limpia si el label termina exacto en `(<unit>)`.
// ---------------------------------------------------------------------------
function cleanLabel(w) {
  const label = w.variableFullName || '';
  const unit  = w.unit;
  if (!unit) return null;                        // sin unit → no aplica
  const tail = '(' + unit + ')';
  if (!label.endsWith(tail)) return null;        // ya limpio o mismatch → skip
  return label.slice(0, label.length - tail.length).trim();
}

// ---------------------------------------------------------------------------
// Restore: replaceOne por _id vía bulkWrite. Prohibido deleteMany+insertMany.
// Clon del doc con _id removido del replacement (fix del restore de C2).
// ---------------------------------------------------------------------------
async function restore(backupPath) {
  const abs = path.resolve(backupPath);
  if (!fs.existsSync(abs)) {
    console.error('[migrate-labels][restore] FATAL: archivo no existe:', abs);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!data || !Array.isArray(data.entries)) {
    console.error('[migrate-labels][restore] FATAL: backup malformado:', abs);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-labels][restore] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
  console.log('[migrate-labels][restore] backup origen:', abs, '(', data.entries.length, 'entradas )');
  console.log('[migrate-labels][restore] ⚠ este restore revierte SOLO C4 (labels). C2 (unit + widget) queda intacto.');

  const col = mongoose.connection.db.collection(COLLECTION);
  const ops = data.entries
    .filter(e => e.collection === 'templates')
    .map(e => {
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
    console.warn('[migrate-labels][restore] ⚠ 0 operaciones válidas en el backup');
    await mongoose.disconnect();
    return;
  }

  const res = await col.bulkWrite(ops, { ordered: true });
  console.log('[migrate-labels][restore] bulkWrite result:',
              'matched=', res.matchedCount,
              'modified=', res.modifiedCount);

  await mongoose.disconnect();
  console.log('[migrate-labels][restore] listo.');
}

// ---------------------------------------------------------------------------
// Plan: recorre widgets, calcula filas afectadas + skips.
// ---------------------------------------------------------------------------
async function buildPlan() {
  const col = mongoose.connection.db.collection(COLLECTION);
  const templates = await col.find({}).toArray();

  const rows = [];
  const writes = new Map();     // _id → widgets nuevos
  let totalWidgets = 0;
  let toClean = 0, skipNoUnit = 0, skipNoTail = 0;

  for (const t of templates) {
    const newWidgets = [];
    let anyChange = false;
    for (const w of (t.widgets || [])) {
      totalWidgets++;
      const cleaned = cleanLabel(w);
      const wOut = { ...w };
      let action = '';
      if (cleaned == null) {
        if (!w.unit) { skipNoUnit++; action = '(skip: unit vacía)'; }
        else         { skipNoTail++; action = '(skip: label no termina en (' + w.unit + '))'; }
      } else {
        toClean++;
        wOut.variableFullName = cleaned;
        anyChange = true;
        action = 'CLEAN → ' + JSON.stringify(cleaned);
      }
      newWidgets.push(wOut);
      rows.push({
        template: t.name,
        variable: w.variable,
        labelBefore: w.variableFullName || '',
        unit: w.unit || '',
        action,
      });
    }
    if (anyChange) writes.set(String(t._id), { _id: t._id, widgetsPost: newWidgets });
  }

  return { templates, rows, writes, totalWidgets, toClean, skipNoUnit, skipNoTail };
}

function printTable(rows) {
  const pad = (s, n) => String(s == null ? '' : s).padEnd(n).slice(0, n);
  console.log(pad('template', 28), pad('variable', 24), pad('labelBefore', 34), pad('unit', 8), 'action');
  console.log('-'.repeat(28), '-'.repeat(24), '-'.repeat(34), '-'.repeat(8), '-'.repeat(50));
  for (const r of rows) {
    console.log(pad(r.template, 28), pad(r.variable, 24), pad(r.labelBefore, 34), pad(r.unit, 8), r.action);
  }
}

// ---------------------------------------------------------------------------
// Dry run
// ---------------------------------------------------------------------------
async function dryRun() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-labels][dry-run] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  const plan = await buildPlan();
  console.log('\n=== TABLA (', plan.totalWidgets, 'widgets totales ) ===\n');
  printTable(plan.rows);

  console.log('\n=== RESUMEN ===');
  console.log('  widgets totales      :', plan.totalWidgets);
  console.log('  a limpiar            :', plan.toClean, '(esperado 22)');
  console.log('  skip (unit vacía)    :', plan.skipNoUnit, '(esperado 20)');
  console.log('  skip (label mismatch):', plan.skipNoTail, '(esperado 0 en 1ª corrida; = a-limpiar en 2ª)');
  console.log('  templates a escribir :', plan.writes.size);
  console.log('\n[migrate-labels][dry-run] cero escrituras realizadas.');
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
  console.log('[migrate-labels][apply] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  const col = mongoose.connection.db.collection(COLLECTION);

  const cntBefore = await col.countDocuments({});
  const allDocs = await col.find({}).toArray();
  if (allDocs.length !== cntBefore) {
    console.error('[migrate-labels][apply] FATAL: count mismatch pre-backup', allDocs.length, 'vs', cntBefore);
    process.exit(1);
  }
  const backupPath = path.resolve(__dirname, '_dev', `backup_labels_${tsStamp()}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    scope: 'C4 (labels only) — restore reverts labels; C2 (unit+widget) untouched',
    entries: allDocs.map(d => ({ collection: 'templates', _id: String(d._id), doc: d })),
  }, null, 2));
  console.log('[migrate-labels][apply] backup:', backupPath, '(', allDocs.length, 'docs)');
  console.log('[migrate-labels][apply] ⚠ este backup revierte SOLO C4. Para revertir C2 también, aplicar el backup de C2 después.');

  const plan = await buildPlan();
  console.log('\n=== TABLA (', plan.totalWidgets, 'widgets totales ) ===\n');
  printTable(plan.rows);

  if (plan.writes.size === 0) {
    console.log('[migrate-labels][apply] cero cambios detectados. Nada que escribir.');
    await mongoose.disconnect();
    return;
  }

  const ops = [];
  for (const { _id, widgetsPost } of plan.writes.values()) {
    ops.push({
      updateOne: {
        filter: { _id },
        update: { $set: { widgets: widgetsPost } },
      }
    });
  }
  const res = await col.bulkWrite(ops, { ordered: true });
  console.log('\n[migrate-labels][apply] bulkWrite:',
              'matched=', res.matchedCount,
              'modified=', res.modifiedCount);

  await mongoose.disconnect();
  console.log('[migrate-labels][apply] listo. restore con:');
  console.log('    node seeds/migrate_widget_labels.js --restore ' + backupPath);
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
