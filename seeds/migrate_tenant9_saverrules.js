require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const User      = require('../app/api/models/user').default;
const Device    = require('../app/api/models/device').default;
const SaverRule = require('../app/api/models/emqx_saver_rule').default;

// #41-R3 (DEC-REF-52) — migrate saverrules.userId PERSONAL → SERVICE.
// Alcance CERRADO: solo docs cuyo dId pertenece a un device con userId=SERVICE.
// EMQX Rule Engine NO se toca acá: el create+relink lo hace reconcileSaverRules
// (emqxapi.js:257-320, recreate branch :296-315) al reiniciar el backend.
// ORDEN OBLIGATORIO: script → `docker restart node`. Un restart previo recrearía
// las 10 reglas EMQX con userId=PERSONAL, dejando el ciclo roto de nuevo.
//
// Precedente estructural: seeds/migrate_tenant4_userid.js (#33.1).

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

const PERSONAL_EMAIL = process.env.PERSONAL_EMAIL || 'fsugamielecinetiksrl@gmail.com';
const SERVICE_EMAIL  = 'operator-claro@wanomi.platform';

// ---------------------------------------------------------------------------
// Restore: `node seeds/migrate_tenant9_saverrules.js --restore <path.json>`
// Repone userId + emqxRuleId exactos del backup (reproduce el estado
// pre-migración: PERSONAL + emqxRuleId huérfanos).
// ---------------------------------------------------------------------------
async function restore(backupPath) {
  const abs = path.resolve(backupPath);
  if (!fs.existsSync(abs)) {
    console.error('[migrate-tenant9][restore] FATAL: archivo no existe:', abs);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!data || !Array.isArray(data.entries)) {
    console.error('[migrate-tenant9][restore] FATAL: backup malformado (esperado { entries: [...] }):', abs);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-tenant9][restore] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
  console.log('[migrate-tenant9][restore] backup origen:', abs, '(', data.entries.length, 'entradas )');

  let restored = 0, noop = 0;
  for (const entry of data.entries) {
    if (entry.collection !== 'saverrules') {
      console.warn('[migrate-tenant9][restore] ⚠ colección inesperada:', entry.collection, '— skip _id:', entry._id);
      continue;
    }
    // Idempotente: correr restore dos veces no rompe nada — updateOne devuelve
    // modifiedCount=0 la segunda vez.
    const res = await SaverRule.updateOne(
      { _id: new mongoose.Types.ObjectId(entry._id) },
      { $set: { userId: entry.userId, emqxRuleId: entry.emqxRuleId } }
    );
    const mod = res.modifiedCount != null ? res.modifiedCount : res.nModified;
    if (mod === 1) {
      console.log('  ✓ saverrules', entry._id, '→ userId=' + entry.userId + ' emqxRuleId=' + entry.emqxRuleId);
      restored++;
    } else {
      console.log('  -', entry._id, 'sin cambios (ya coincide o no encontrado)');
      noop++;
    }
  }

  console.log('[migrate-tenant9][restore] RESUMEN: restaurados', restored, '| sin cambios', noop);
  await mongoose.disconnect();
  console.log('[migrate-tenant9][restore] listo.');
}

// ---------------------------------------------------------------------------
// Migrate
// ---------------------------------------------------------------------------
async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-tenant9] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  // --- Pre-flight ---
  const personal = await User.findOne({ email: PERSONAL_EMAIL }, { _id: 1, email: 1 });
  if (!personal) {
    console.error('[migrate-tenant9] FATAL: usuario PERSONAL', PERSONAL_EMAIL, 'no existe.');
    process.exit(1);
  }
  const service = await User.findOne({ email: SERVICE_EMAIL }, { _id: 1, email: 1 });
  if (!service) {
    console.error('[migrate-tenant9] FATAL: usuario SERVICE', SERVICE_EMAIL, 'no existe. Correr seeds/seed_operator_claro.js primero.');
    process.exit(1);
  }
  const PERSONAL_ID = personal._id.toString();
  const SERVICE_ID  = service._id.toString();
  if (PERSONAL_ID === SERVICE_ID) {
    console.error('[migrate-tenant9] FATAL: PERSONAL_ID == SERVICE_ID — ¿estás resolviendo el mismo usuario?');
    process.exit(1);
  }
  console.log('[migrate-tenant9] pre-flight OK');
  console.log('  PERSONAL:', PERSONAL_EMAIL, '→', PERSONAL_ID);
  console.log('  SERVICE :', SERVICE_EMAIL, '→', SERVICE_ID);

  // --- Scope ---
  // Universo: todas las saverrules (10 esperadas).
  // Elegibles: docs cuyo dId pertenezca a un device con userId=SERVICE
  //   (post-migración, el gate del saver-webhook exigirá Device.find({dId, userId:SERVICE})).
  // Skip idempotente: docs ya bajo SERVICE que apunten a devices SERVICE.
  // Out of scope: docs cuyo dId no coincide con ningún device SERVICE — se listan y NO se tocan.
  const allRules = await SaverRule.find(
    {}, { _id: 1, dId: 1, userId: 1, emqxRuleId: 1, status: 1 }
  ).lean();
  console.log('[migrate-tenant9] saverrules total en Mongo:', allRules.length);

  const serviceDids = new Set(
    (await Device.find({ userId: SERVICE_ID }, { dId: 1 }).lean()).map(d => d.dId)
  );
  console.log('[migrate-tenant9] devices bajo SERVICE:', serviceDids.size);

  const inScope = [];
  const outOfScope = [];
  let alreadyService = 0;
  for (const r of allRules) {
    if (!serviceDids.has(r.dId)) {
      outOfScope.push(r);
      continue;
    }
    if (String(r.userId) === PERSONAL_ID) inScope.push(r);
    else if (String(r.userId) === SERVICE_ID) alreadyService++;
    else outOfScope.push(r); // userId ajeno inesperado
  }

  console.log('[migrate-tenant9] scope:');
  console.log('  candidatos a migrar (PERSONAL, dId ∈ SERVICE):', inScope.length);
  for (const r of inScope) console.log('   → dId=' + r.dId + '  _id=' + r._id);
  console.log('  ya bajo SERVICE (idempotente, no-op):', alreadyService);
  console.log('  fuera de scope (dId no coincide con device SERVICE, o userId ajeno):', outOfScope.length);
  for (const r of outOfScope) console.log('   ! dId=' + r.dId + '  userId=' + r.userId + '  emqxRuleId=' + r.emqxRuleId + '  (NO se toca)');

  if (inScope.length === 0) {
    console.log('[migrate-tenant9] no-op — predicado vacío.');
    await mongoose.disconnect();
    return;
  }

  // --- Backup ANTES de mutar ---
  // Estructura: { ts, personal_id, service_id, note, entries: [{collection, _id, userId, dId, emqxRuleId, status}] }
  // emqxRuleId se captura tal cual (hoy huérfano en EMQX — R2-B4).
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const backupDir = path.resolve(__dirname, '_dev');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log('[migrate-tenant9] creado dir', backupDir);
  }
  const backupPath = path.join(backupDir, `backup_tenant9_${ts}.json`);
  const backup = {
    ts: new Date().toISOString(),
    personal_id: PERSONAL_ID,
    service_id:  SERVICE_ID,
    note: 'saverrules PERSONAL → SERVICE. emqxRuleId capturado tal cual (huérfano en EMQX pre-migración).',
    entries: inScope.map(r => ({
      collection: 'saverrules',
      _id: r._id.toString(),
      userId: r.userId,
      dId: r.dId,
      emqxRuleId: r.emqxRuleId,
      status: r.status,
    })),
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log('[migrate-tenant9] backup guardado en', backupPath, '(', backup.entries.length, 'entradas )');

  // --- Sweep ---
  // Filtro explícito: $in sobre los _id snapshoteados Y userId=PERSONAL_ID
  // como guard rail por si algo cambió entre lecturas.
  const ids = inScope.map(r => r._id);
  const before = await SaverRule.countDocuments({ _id: { $in: ids }, userId: PERSONAL_ID });
  const res = ids.length === 0 ? { modifiedCount: 0 } : await SaverRule.updateMany(
    { _id: { $in: ids }, userId: PERSONAL_ID },
    { $set: { userId: SERVICE_ID } }
  );
  const modified = res.modifiedCount != null ? res.modifiedCount : res.nModified;
  const after = await SaverRule.countDocuments({ _id: { $in: ids }, userId: SERVICE_ID });
  console.log('[migrate-tenant9] saverrules: bajo PERSONAL antes=' + before + ', modificadas=' + modified + ', bajo SERVICE después=' + after);
  for (const r of inScope) console.log('  ✓ saverrules _id=' + r._id.toString() + ' (dId=' + r.dId + ')');

  console.log('[migrate-tenant9] RESUMEN: migradas=' + modified);
  console.log('[migrate-tenant9] SIGUIENTE PASO OBLIGATORIO: docker restart node');
  console.log('[migrate-tenant9]   → dispara initEmqxResources → reconcileSaverRules (emqxapi.js:257).');
  console.log('[migrate-tenant9]   → recreate branch (:296-315) construye 10 reglas EMQX con userId=SERVICE (topic SQL + payload_tmpl).');
  console.log('[migrate-tenant9]   → relink automático de saverrules.emqxRuleId a los ids nuevos (:313).');
  console.log('[migrate-tenant9] undo: node seeds/migrate_tenant9_saverrules.js --restore ' + backupPath);

  await mongoose.disconnect();
  console.log('[migrate-tenant9] listo.');
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const restoreIdx = args.indexOf('--restore');
if (restoreIdx !== -1) {
  const backupPath = args[restoreIdx + 1];
  if (!backupPath) {
    console.error('FATAL: --restore requiere ruta al backup. Ej: --restore seeds/_dev/backup_tenant9_2026-07-05_12-00-00.json');
    process.exit(1);
  }
  restore(backupPath).catch(err => { console.error(err); process.exit(1); });
} else {
  migrate().catch(err => { console.error(err); process.exit(1); });
}
