require('dotenv').config();
const mongoose = require('mongoose');

// DEC-REF-113 F4 (#84) — cascada de energía funcional: semántica de "activo"
// por fuente (activeWhen). La regla vieja solo aceptaba true/1/'on' y dejaba
// la cascada en "Inactivo" con datos reales (mains_voltage=220, enums).
//
//   - mains_voltage  → []  (la regla genérica número>0 la cubre)
//   - transfer_state → ['AUTO', 'MANUAL']  (el ATS tiene posición válida)
//   - gen_status     → ['RUNNING']  (el grupo está en marcha)
//
// Idempotente: solo escribe si el activeWhen difiere.
//
// Uso:
//   MONGODB_URI=... node seeds/migrate_cascade_f84.js --dry-run
//   MONGODB_URI=... node seeds/migrate_cascade_f84.js

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido (base iotix, authSource=admin).');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

const ACTIVE_WHEN = {
  mains_voltage: [],
  transfer_state: ['AUTO', 'MANUAL'],
  gen_status: ['RUNNING'],
};

(async () => {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const col = mongoose.connection.db.collection('templates');

  const cursor = col.find({ 'widgets.widget': 'powerCascade' });
  let touched = 0;
  while (await cursor.hasNext()) {
    const tpl = await cursor.next();
    let dirty = false;
    for (const w of tpl.widgets || []) {
      if (w.widget !== 'powerCascade') continue;
      for (const s of w.sources || []) {
        const want = ACTIVE_WHEN[s.variable];
        if (!want) continue;
        const cur = Array.isArray(s.activeWhen) ? s.activeWhen : null;
        if (cur && cur.join('|') === want.join('|')) continue;
        if (!DRY) s.activeWhen = want;
        dirty = true;
        console.log(`${DRY ? '[dry] ' : ''}${tpl.name} · ${s.variable} → activeWhen=[${want.join(', ')}]`);
      }
    }
    if (dirty && !DRY) {
      await col.updateOne({ _id: tpl._id }, { $set: { widgets: tpl.widgets } });
      touched++;
    }
  }
  console.log(`OK — templates actualizados: ${touched}${DRY ? ' (dry-run, sin escritura)' : ''}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
