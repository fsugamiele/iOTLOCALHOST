require('dotenv').config();
const mongoose = require('mongoose');

// DEC-REF-108 F5 (#80) — agrega el widget siteMap (plano del sitio) al
// template SEC con los puntos canónicos de seguridad. Idempotente: no hace
// nada si ya existe un widget siteMap en el template.
//
// Uso:
//   MONGODB_URI=... node seeds/migrate_sitemap_f5.js --dry-run
//   MONGODB_URI=... node seeds/migrate_sitemap_f5.js

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido (base iotix, authSource=admin).');
  process.exit(1);
}
const DRY = process.argv.includes('--dry-run');

const SITEMAP_WIDGET = {
  variableFullName: 'Plano del sitio',
  widget: 'siteMap',
  icon: 'fa-map-marked-alt',
  class: 'primary',
  column: 'col-8',
  sources: [
    { key: 'door_front',           variable: 'door_front',           variableFullName: 'Puerta frontal',  role: 'door_front' },
    { key: 'door_rear',            variable: 'door_rear',            variableFullName: 'Puerta trasera',  role: 'door_rear' },
    { key: 'door_shelter',         variable: 'door_shelter',         variableFullName: 'Puerta shelter',  role: 'door_shelter' },
    { key: 'door_battery_cabinet', variable: 'door_battery_cabinet', variableFullName: 'Gabinete bat.',   role: 'door_battery_cabinet' },
    { key: 'pir_motion',           variable: 'pir_motion',           variableFullName: 'Movimiento',      role: 'pir' },
    { key: 'fence_vibration',      variable: 'fence_vibration',      variableFullName: 'Cerco',           role: 'fence' },
  ],
};

async function main() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const col = mongoose.connection.db.collection('templates');

  const targets = await col.find({ deviceType: 'SEC' }).toArray();
  let touched = 0;
  for (const t of targets) {
    if ((t.widgets || []).some(w => w && w.widget === 'siteMap')) {
      console.log(`  ${t.name}: ya tiene siteMap — skip`);
      continue;
    }
    // Solo agrega los puntos cuya variable existe en el template (la fuente
    // sin variable quedaría "esperando" para siempre).
    const vars = new Set((t.widgets || []).map(w => w && w.variable).filter(Boolean));
    const sources = SITEMAP_WIDGET.sources.filter(s => vars.has(s.variable));
    const widget = { ...SITEMAP_WIDGET, sources };
    console.log(`  ${t.name} + siteMap (${sources.length} puntos: ${sources.map(s => s.key).join(', ')})`);
    touched++;
    if (!DRY) await col.updateOne({ _id: t._id }, { $push: { widgets: widget } });
  }
  console.log(`\n${DRY ? '[DRY-RUN] ' : ''}templates tocados: ${touched}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
