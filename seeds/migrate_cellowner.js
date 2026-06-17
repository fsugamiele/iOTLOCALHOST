require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const mongoose = require('mongoose');
const Site = require('../app/api/models/site').default;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix).');
  process.exit(1);
}

// Mapeo cellOwner (string libre) → árbol de tenancy. MVP 1-1-1.
// "Claro" es el OPERADOR (no la zona — el nombre cellOwner era engañoso, ver #28).
// zoneCode no existe en el dato viejo: se aporta aquí (NEA, por ubicación geográfica).
const CELLOWNER_MAP = {
  'Claro': { operatorCode: 'claro', zoneCode: 'nea' },
};

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log('[migrate-cellowner] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  const sites = await Site.find({});
  console.log('[migrate-cellowner]', sites.length, 'sites encontrados');

  let migrated = 0, skipped = 0, unmapped = 0;
  for (const site of sites) {
    if (site.operatorCode) {
      console.log('  -', site.siteCode, 'ya migrado (operatorCode:', site.operatorCode + ') — skip');
      skipped++;
      continue;
    }
    const mapping = CELLOWNER_MAP[site.cellOwner];
    if (!mapping) {
      console.log('  - ⚠', site.siteCode, 'cellOwner sin mapeo:', JSON.stringify(site.cellOwner), '— NO migrado');
      unmapped++;
      continue;
    }
    site.operatorCode = mapping.operatorCode;
    site.zoneCode = mapping.zoneCode;
    await site.save();
    console.log('  - ✓', site.siteCode, ':', site.cellOwner, '→ operator:' + mapping.operatorCode, 'zone:' + mapping.zoneCode);
    migrated++;
  }

  console.log('[migrate-cellowner] RESUMEN: migrados', migrated, '| ya migrados', skipped, '| sin mapeo', unmapped);

  const cr = await Site.findOne({ siteCode: 'CR00061' }, { siteCode:1, cellOwner:1, operatorCode:1, zoneCode:1, _id:0 });
  console.log('[migrate-cellowner] VERIFICACIÓN CR00061:', JSON.stringify(cr));

  await mongoose.disconnect();
  console.log('[migrate-cellowner] listo.');
}

migrate().catch(err => { console.error(err); process.exit(1); });
