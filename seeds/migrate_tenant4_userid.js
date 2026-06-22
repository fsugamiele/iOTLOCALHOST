require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');
const User     = require('../app/api/models/user').default;
const Site     = require('../app/api/models/site').default;
const Device   = require('../app/api/models/device').default;

// 33.1 — migrate sites + devices Claro NEA: userId PERSONAL → SERVICE.
// Alcance CERRADO: sites + devices ÚNICAMENTE. emqxauthrules se difere al
// paso 4 (trío de ingesta) — NO se toca acá.
//
// Anclas confirmadas en PASO A:
//   A3: device.siteId (String) guarda el siteCode del site (NO ObjectId).
//       Ancla devices: { siteId: { $in: <siteCodes claro/nea> } }.
//   A4: filtro sites = { operatorCode: 'claro', zoneCode: 'nea' } (quirúrgico
//       al piloto — si mañana hay otra zona Claro, este migrate no la toca).
//   A4: PERSONAL_EMAIL lookup, SERVICE_EMAIL lookup (NO hardcodear ObjectIds).

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

const PERSONAL_EMAIL = process.env.PERSONAL_EMAIL || 'fsugamielecinetiksrl@gmail.com';
const SERVICE_EMAIL  = 'operator-claro@wanomi.platform';

const OPERATOR_CODE  = 'claro';
const ZONE_CODE      = 'nea';

// ---------------------------------------------------------------------------
// Modo restore: `node seeds/migrate_tenant4_userid.js --restore <path.json>`
// ---------------------------------------------------------------------------
async function restore(backupPath) {
  const abs = path.resolve(backupPath);
  if (!fs.existsSync(abs)) {
    console.error('[migrate-tenant4][restore] FATAL: archivo no existe:', abs);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!data || !Array.isArray(data.entries)) {
    console.error('[migrate-tenant4][restore] FATAL: backup malformado (esperado { entries: [...] }):', abs);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-tenant4][restore] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
  console.log('[migrate-tenant4][restore] backup origen:', abs, '(', data.entries.length, 'entradas )');

  const modelFor = { sites: Site, devices: Device };
  let restored = 0, noop = 0;

  for (const entry of data.entries) {
    const Model = modelFor[entry.collection];
    if (!Model) {
      console.warn('[migrate-tenant4][restore] ⚠ colección desconocida:', entry.collection, '— skip _id:', entry._id);
      continue;
    }
    // Idempotente: si el doc ya tiene el userId viejo (porque corrimos restore
    // dos veces), updateOne devuelve modifiedCount=0 y no rompe nada.
    const res = await Model.updateOne(
      { _id: new mongoose.Types.ObjectId(entry._id) },
      { $set: { userId: entry.userId } }
    );
    const mod = res.modifiedCount != null ? res.modifiedCount : res.nModified;
    if (mod === 1) {
      console.log('  ✓', entry.collection, entry._id, '→ userId restaurado a', entry.userId);
      restored++;
    } else {
      console.log('  -', entry.collection, entry._id, 'sin cambios (ya tenía userId=' + entry.userId + ' o no encontrado)');
      noop++;
    }
  }

  console.log('[migrate-tenant4][restore] RESUMEN: restaurados', restored, '| sin cambios', noop);
  await mongoose.disconnect();
  console.log('[migrate-tenant4][restore] listo.');
}

// ---------------------------------------------------------------------------
// Modo normal: migrate
// ---------------------------------------------------------------------------
async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-tenant4] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  // --- Pre-flight: ambos usuarios deben existir ---
  const personal = await User.findOne({ email: PERSONAL_EMAIL }, { _id: 1, email: 1 });
  if (!personal) {
    console.error('[migrate-tenant4] FATAL: usuario PERSONAL', PERSONAL_EMAIL, 'no existe.');
    process.exit(1);
  }
  const service = await User.findOne({ email: SERVICE_EMAIL }, { _id: 1, email: 1 });
  if (!service) {
    console.error('[migrate-tenant4] FATAL: usuario SERVICE', SERVICE_EMAIL, 'no existe. Correr seeds/seed_operator_claro.js primero.');
    process.exit(1);
  }
  const PERSONAL_ID = personal._id.toString();
  const SERVICE_ID  = service._id.toString();
  if (PERSONAL_ID === SERVICE_ID) {
    console.error('[migrate-tenant4] FATAL: PERSONAL_ID == SERVICE_ID — ¿estás resolviendo el mismo usuario?');
    process.exit(1);
  }
  console.log('[migrate-tenant4] pre-flight OK');
  console.log('  PERSONAL:', PERSONAL_EMAIL, '→', PERSONAL_ID);
  console.log('  SERVICE :', SERVICE_EMAIL, '→', SERVICE_ID);

  // --- Resolver candidatos (resumible tras corrida parcial) ---
  // TODOS los sites claro/nea, SIN filtrar por dueño: los siteCodes siguen
  // resolviendo aunque una corrida previa ya haya migrado los sites. Si solo
  // filtráramos por PERSONAL acá, una corrida parcial (sites migrados, devices
  // no) perdería la lista de siteCodes y dejaría devices huérfanos sin tocar.
  const allClaroSites = await Site.find(
    { operatorCode: OPERATOR_CODE, zoneCode: ZONE_CODE },
    { _id: 1, siteCode: 1, userId: 1 }
  ).lean();
  const allSiteCodes = allClaroSites.map(s => s.siteCode);

  // Sites que TODAVÍA están bajo PERSONAL → a migrar. String(s.userId) por si
  // alguna vez aparece un ObjectId mezclado (hoy 100% string, defensivo).
  const sitesToMigrate = allClaroSites.filter(s => String(s.userId) === PERSONAL_ID);
  const siteIds = sitesToMigrate.map(s => s._id);

  // Devices anclados a TODOS los siteCodes claro/nea (no solo los pendientes),
  // todavía bajo PERSONAL — detecta huérfanos de corridas parciales.
  const devicesToMigrate = allSiteCodes.length === 0 ? [] : await Device.find(
    { siteId: { $in: allSiteCodes }, userId: PERSONAL_ID },
    { _id: 1, dId: 1, siteId: 1, userId: 1 }
  ).lean();
  const deviceIds = devicesToMigrate.map(d => d._id);

  console.log('[migrate-tenant4] universo claro/nea:', allClaroSites.length, 'sites →', allSiteCodes.join(', ') || '(ninguno)');
  console.log('[migrate-tenant4] candidatos a migrar:');
  console.log('  sites  :', sitesToMigrate.length, '→', sitesToMigrate.map(s => s.siteCode).join(', ') || '(ninguno)');
  console.log('  devices:', devicesToMigrate.length, '→', devicesToMigrate.map(d => d.dId).join(', ') || '(ninguno)');

  // Idempotencia: si el predicado ya está vacío, no hay nada que hacer.
  // Importante: devicesToMigrate se resolvió contra allSiteCodes (no contra
  // los pendientes), así que detecta huérfanos. Si llegamos acá con todo en 0,
  // es no-op real.
  if (sitesToMigrate.length === 0 && devicesToMigrate.length === 0) {
    // Chequeo informativo: cuántos sites/devices del universo claro/nea ya
    // están bajo SERVICE. Deriva siteCodes de allSiteCodes (no re-query por
    // SERVICE_ID) — el universo es estable, lo que cambia es a quién pertenece.
    const sitesAtService = allClaroSites.filter(s => String(s.userId) === SERVICE_ID).length;
    const devsAtService = allSiteCodes.length === 0 ? 0 : await Device.countDocuments({
      siteId: { $in: allSiteCodes },
      userId: SERVICE_ID,
    });
    console.log('[migrate-tenant4] no-op — predicado vacío.');
    console.log('  sites bajo SERVICE:', sitesAtService, '/', allClaroSites.length);
    console.log('  devices bajo SERVICE:', devsAtService);
    await mongoose.disconnect();
    return;
  }

  // --- Backup ANTES de mutar ---
  // Estructura: { ts, predicate, personal_id, service_id, entries: [{collection, _id, userId}] }
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const backupDir = path.resolve(__dirname, '_dev');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log('[migrate-tenant4] creado dir', backupDir);
  }
  const backupPath = path.join(backupDir, `backup_tenant4_${ts}.json`);
  const backup = {
    ts: new Date().toISOString(),
    predicate: { operatorCode: OPERATOR_CODE, zoneCode: ZONE_CODE },
    personal_id: PERSONAL_ID,
    service_id:  SERVICE_ID,
    entries: [
      ...sitesToMigrate.map(s   => ({ collection: 'sites',   _id: s._id.toString(), userId: s.userId,   siteCode: s.siteCode })),
      ...devicesToMigrate.map(d => ({ collection: 'devices', _id: d._id.toString(), userId: d.userId,   dId: d.dId, siteId: d.siteId })),
    ],
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log('[migrate-tenant4] backup guardado en', backupPath, '(', backup.entries.length, 'entradas )');

  // --- Sweep: sites primero, luego devices ---
  // Filtros explícitos con $in sobre los _id capturados (NO re-evaluamos el
  // predicado — usamos la lista que ya snapshotteamos) Y userId=PERSONAL_ID
  // como guard rail por si algo cambió entre lecturas.
  const sitesBefore = await Site.countDocuments({ _id: { $in: siteIds }, userId: PERSONAL_ID });
  const sitesRes = siteIds.length === 0 ? { modifiedCount: 0 } : await Site.updateMany(
    { _id: { $in: siteIds }, userId: PERSONAL_ID },
    { $set: { userId: SERVICE_ID } }
  );
  const sitesModified = sitesRes.modifiedCount != null ? sitesRes.modifiedCount : sitesRes.nModified;
  const sitesAfter  = await Site.countDocuments({ _id: { $in: siteIds }, userId: SERVICE_ID });
  console.log('[migrate-tenant4] sites: bajo PERSONAL antes=' + sitesBefore + ', modificados=' + sitesModified + ', bajo SERVICE después=' + sitesAfter);
  for (const s of sitesToMigrate) console.log('  ✓ site _id=' + s._id.toString() + ' (siteCode=' + s.siteCode + ')');

  const devsBefore = await Device.countDocuments({ _id: { $in: deviceIds }, userId: PERSONAL_ID });
  const devsRes = deviceIds.length === 0 ? { modifiedCount: 0 } : await Device.updateMany(
    { _id: { $in: deviceIds }, userId: PERSONAL_ID },
    { $set: { userId: SERVICE_ID } }
  );
  const devsModified = devsRes.modifiedCount != null ? devsRes.modifiedCount : devsRes.nModified;
  const devsAfter = await Device.countDocuments({ _id: { $in: deviceIds }, userId: SERVICE_ID });
  console.log('[migrate-tenant4] devices: bajo PERSONAL antes=' + devsBefore + ', modificados=' + devsModified + ', bajo SERVICE después=' + devsAfter);
  for (const d of devicesToMigrate) console.log('  ✓ device _id=' + d._id.toString() + ' (dId=' + d.dId + ', siteId=' + d.siteId + ')');

  console.log('[migrate-tenant4] RESUMEN: sites migrados=' + sitesModified + ' | devices migrados=' + devsModified);
  console.log('[migrate-tenant4] undo: node seeds/migrate_tenant4_userid.js --restore ' + backupPath);

  await mongoose.disconnect();
  console.log('[migrate-tenant4] listo.');
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const restoreIdx = args.indexOf('--restore');
if (restoreIdx !== -1) {
  const backupPath = args[restoreIdx + 1];
  if (!backupPath) {
    console.error('FATAL: --restore requiere ruta al backup. Ej: --restore seeds/_dev/backup_tenant4_2026-06-22_12-00-00.json');
    process.exit(1);
  }
  restore(backupPath).catch(err => { console.error(err); process.exit(1); });
} else {
  migrate().catch(err => { console.error(err); process.exit(1); });
}
