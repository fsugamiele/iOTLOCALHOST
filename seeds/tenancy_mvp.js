require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const mongoose = require('mongoose');
const Operator = require('../app/api/models/operator').default;
const Zone     = require('../app/api/models/zone').default;
const User     = require('../app/api/models/user').default;

// NO usar fallback a /wanomi — la base real es iotix. Requerir URI explícito.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

const WANOMI_EMAIL = 'admin@wanomi.com';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[seed-tenancy] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  await Operator.updateOne(
    { operatorCode: 'claro' },
    { $setOnInsert: { operatorCode: 'claro', displayName: 'Claro Argentina', createdTime: Date.now() } },
    { upsert: true }
  );
  console.log('[seed-tenancy] Operator claro OK');

  await Zone.updateOne(
    { operatorCode: 'claro', zoneCode: 'nea' },
    { $setOnInsert: { zoneCode: 'nea', displayName: 'NEA', operatorCode: 'claro', createdTime: Date.now() } },
    { upsert: true }
  );
  console.log('[seed-tenancy] Zone claro/nea OK');

  const wanomi = await User.findOne({ email: WANOMI_EMAIL });
  if (!wanomi) {
    console.error('[seed-tenancy] FATAL: cuenta', WANOMI_EMAIL, 'no encontrada. Crearla por el registro primero.');
    process.exit(1);
  }
  const hasSuperadmin = (wanomi.grants || []).some(g => g.role === 'superadmin');
  if (!hasSuperadmin) {
    wanomi.grants.push({ role: 'superadmin', scope: {} });
    await wanomi.save();
    console.log('[seed-tenancy] grant superadmin agregado a', WANOMI_EMAIL);
  } else {
    console.log('[seed-tenancy]', WANOMI_EMAIL, 'ya tiene grant superadmin — sin cambios');
  }

  const op = await Operator.findOne({ operatorCode: 'claro' });
  const zn = await Zone.findOne({ operatorCode: 'claro', zoneCode: 'nea' });
  const wn = await User.findOne({ email: WANOMI_EMAIL }, { name: 1, email: 1, grants: 1 });
  console.log('[seed-tenancy] VERIFICACIÓN:');
  console.log('  Operator:', op ? op.operatorCode + ' / ' + op.displayName : 'FALTA');
  console.log('  Zone:', zn ? zn.operatorCode + '/' + zn.zoneCode : 'FALTA');
  console.log('  Wanomi grants:', JSON.stringify(wn.grants));

  await mongoose.disconnect();
  console.log('[seed-tenancy] listo.');
}

seed().catch(err => { console.error(err); process.exit(1); });
