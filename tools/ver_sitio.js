// Diagnóstico de la página de UN sitio: equipos por tab (dominio), widgets de su plantilla y la
// disposición guardada de cada tab por usuario (panellayouts site-<sitio>-<tab>).
//   docker exec -i node node - <siteCode> < tools/ver_sitio.js > ver_sitio.txt
// Solo lectura.
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const SITE = process.argv.slice(2).find((a) => /^[A-Za-z0-9_\-]{2,40}$/.test(a));
if (!SITE) { console.error('Uso: docker exec -i node node - <siteCode> < tools/ver_sitio.js'); process.exit(1); }
const J = (x) => JSON.stringify(x);
const TZ = 'America/Argentina/Buenos_Aires';
const H = (d) => (d ? new Date(d).toLocaleString('es-AR', { hour12: false, timeZone: TZ }) : '—');
const GRID_COLS = { lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 };
// Misma validación que app/api/routes/panellayouts.js (dashboards site-*).
function problemaLayout(lay) {
  if (!Array.isArray(lay)) return 'no es una lista';
  if (lay.length > 200) return `${lay.length} ítems (máximo 200)`;
  for (const it of lay) {
    if (!it || typeof it.i !== 'string' || !it.i || it.i.length > 120) return `id inválido: ${J(it && it.i)}`;
    for (const k of ['x', 'y', 'w', 'h']) if (!Number.isFinite(it[k])) return `${it.i}: ${k} no es número (${J(it[k])})`;
    if (it.x < 0 || it.x > 11 || it.y < 0 || it.w < 1 || it.w > 12 || it.h < 1 || it.h > 60) return `${it.i}: fuera de rango ${J({ x: it.x, y: it.y, w: it.w, h: it.h })}`;
  }
  return null;
}

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const site = await db.collection('sites').findOne({ siteCode: SITE }, { projection: { siteCode: 1, nombre: 1 } });
  console.log(`Sitio ${SITE}: ${site ? 'existe' + (site.nombre ? ' (' + site.nombre + ')' : '') : 'NO EXISTE en sites'}`);

  // 1 · Equipos → plantilla → tipo → dominio (tab) → widgets (mismo armado que GET /site/:code/full)
  const devs = await db.collection('devices').find({ siteId: SITE }).project({ dId: 1, name: 1, templateId: 1, userId: 1, createdTime: 1, _id: 0 }).toArray();
  const tplIds = [...new Set(devs.map((d) => d.templateId).filter(Boolean))];
  const oids = tplIds.filter((t) => mongoose.Types.ObjectId.isValid(t)).map((t) => new mongoose.Types.ObjectId(t));
  const tpls = await db.collection('templates').find({ _id: { $in: oids } }).project({ name: 1, deviceType: 1, widgets: 1 }).toArray();
  const tplBy = new Map(tpls.map((t) => [String(t._id), t]));
  const types = [...new Set(tpls.map((t) => t.deviceType).filter(Boolean))];
  const sheets = await db.collection('equipmentsheets').find({ deviceType: { $in: types } }).project({ deviceType: 1, domain: 1, _id: 0 }).toArray();
  const domBy = new Map(sheets.map((s) => [s.deviceType, s.domain || '']));
  const idsPorTab = {};
  console.log(`\nEquipos del sitio (${devs.length}):`);
  devs.forEach((d) => {
    const t = tplBy.get(String(d.templateId));
    const dom = (t && t.deviceType && domBy.get(t.deviceType)) || 'general';
    const ws = (t && t.widgets) || [];
    (idsPorTab[dom] = idsPorTab[dom] || []).push(...ws.map((w, j) => ({ i: `${d.dId}::${j}`, advanced: !!w.advanced })));
    console.log(`  ${d.dId} «${d.name}» · plantilla ${t ? `«${t.name}»` : `NO ENCONTRADA (${J(d.templateId)})`} · tipo ${J(t && t.deviceType)} · ficha ${t && t.deviceType ? (domBy.has(t.deviceType) ? 'sí' : 'NO') : '—'} · tab «${dom}» · ${ws.length} widgets${ws.length ? ': ' + ws.map((w) => w.widget + (w.advanced ? '(técnico)' : '')).join(', ') : ''} · creado ${H(d.createdTime)}`);
  });

  // 2 · Disposición guardada por usuario y tab
  const docs = await db.collection('panellayouts').find({ dashboard: { $regex: `^site-${SITE.replace(/[-]/g, '\\-')}-` } }).toArray();
  console.log(`\nDisposiciones guardadas (${docs.length}):`);
  for (const d of docs) {
    const tab = d.dashboard.slice(`site-${SITE}-`.length);
    const esperados = (idsPorTab[tab] || []).map((x) => x.i);
    console.log(`  ${d.dashboard} · usuario ${d.userId} · actualizado ${H(d.updatedAt)}`);
    const bps = { 'layout (plano)': d.layout, ...((d.settings && d.settings.responsiveLayouts) || {}) };
    Object.entries(bps).forEach(([bp, lay]) => {
      const ids = new Set((lay || []).map((x) => x && x.i));
      const faltan = tab === 'datos' ? [] : esperados.filter((i) => !ids.has(i));
      const sobran = tab === 'datos' ? [] : [...ids].filter((i) => !esperados.includes(i));
      const prob = problemaLayout(lay);
      console.log(`    ${bp}${GRID_COLS[bp] ? ` (${GRID_COLS[bp]} col)` : ''}: ${(lay || []).length} ítems${faltan.length ? ` · FALTAN ${faltan.length} (no se dibujaban): ${faltan.join(', ')}` : ''}${sobran.length ? ` · sobran ${sobran.length}: ${sobran.join(', ')}` : ''}${prob ? ` · EL SERVIDOR LO RECHAZARÍA: ${prob}` : ''}`);
    });
    const otras = Object.keys(d.settings || {}).filter((k) => k !== 'responsiveLayouts');
    if (otras.length) console.log(`    otras claves en settings: ${otras.join(', ')}`);
  }
  if (!docs.length) console.log('  ninguna: todas las tabs usan la disposición por defecto');
  process.exit(0);
})().catch((err) => { console.error('ERROR', err && err.message); process.exit(1); });
