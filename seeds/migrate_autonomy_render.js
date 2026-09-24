require('dotenv').config();
const mongoose = require('mongoose');

// DEC-REF-114 (#85) — la autonomía deja de ser un TIPO legacy (projectedAutonomy,
// inalcanzable desde la UI) y pasa a ser una REPRESENTACIÓN de la familia
// numérica: widget='numeric' + render='autonomy'. Misma variable, mismos
// umbrales; solo cambia la forma de declararla. Idempotente.
//
// Uso:
//   MONGODB_URI=... node seeds/migrate_autonomy_render.js --dry-run
//   MONGODB_URI=... node seeds/migrate_autonomy_render.js

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido (base iotix, authSource=admin).');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

(async () => {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const col = mongoose.connection.db.collection('templates');

  const cursor = col.find({ 'widgets.widget': 'projectedAutonomy' });
  let touched = 0;
  while (await cursor.hasNext()) {
    const tpl = await cursor.next();
    let dirty = false;
    for (const w of tpl.widgets || []) {
      if (w.widget !== 'projectedAutonomy') continue;
      console.log(`${DRY ? '[dry] ' : ''}${tpl.name} · ${w.variable} → numeric/render=autonomy`);
      if (!DRY) {
        w.widget = 'numeric';
        w.render = 'autonomy';
      }
      dirty = true;
    }
    if (dirty && !DRY) {
      await col.updateOne({ _id: tpl._id }, { $set: { widgets: tpl.widgets } });
      touched++;
    }
  }
  console.log(`OK — templates actualizados: ${touched}${DRY ? ' (dry-run, sin escritura)' : ''}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
