require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const Operator = require('../app/api/models/operator').default;
const Zone     = require('../app/api/models/zone').default;
const User     = require('../app/api/models/user').default;

// Igual que 28.3: URI explícita, sin fallback a /wanomi (base real es iotix).
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

// DEV-only — usuario de testing E2E para validación de aislamiento de grants (28.x.3).
// Password en claro a propósito: NO es cuenta productiva, vive en el seed para que el
// login del arnés de validación sea reproducible. Mismo método de hash que /register.
const SEED_EMAIL    = 'cellowner-nea@wanomi.test';
const SEED_NAME     = 'Cellowner NEA (test)';
const SEED_PASSWORD = 'cellownerNEA-dev-2026';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[seed-cellowner] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  // Pre-flight: Operator/Zone deben existir (sembrados en 28.3). Si no, el grant
  // apuntaría al vacío — abortar ANTES de tocar usuarios.
  const op = await Operator.findOne({ operatorCode: 'claro' });
  const zn = await Zone.findOne({ operatorCode: 'claro', zoneCode: 'nea' });
  if (!op) { console.error('[seed-cellowner] FATAL: Operator "claro" no existe. Correr seeds/tenancy_mvp.js primero.'); process.exit(1); }
  if (!zn) { console.error('[seed-cellowner] FATAL: Zone "claro/nea" no existe. Correr seeds/tenancy_mvp.js primero.'); process.exit(1); }
  console.log('[seed-cellowner] pre-flight OK — Operator claro + Zone claro/nea presentes');

  // Idempotencia (usuario): find primero, create solo si no existe — re-correr no
  // rota password ni duplica cuenta. Misma forma que 28.3 hizo con admin@wanomi.com.
  let user = await User.findOne({ email: SEED_EMAIL });
  if (!user) {
    user = await User.create({
      name:     SEED_NAME,
      email:    SEED_EMAIL,
      password: bcrypt.hashSync(SEED_PASSWORD, 10), // idéntico a /register (users.js:93)
      grants:   [],
    });
    console.log('[seed-cellowner] usuario', SEED_EMAIL, 'creado');
  } else {
    console.log('[seed-cellowner] usuario', SEED_EMAIL, 'ya existe — sin recrear');
  }

  // Idempotencia (grant): check defensivo de g.scope (puede ser undefined en
  // superadmin — lección 28.3). Push solo si no está. No usar $addToSet sobre
  // subdocs: la igualdad estructural no es confiable.
  const hasGrant = (user.grants || []).some(g =>
    g.role === 'cellowner' &&
    g.scope && g.scope.operatorCode === 'claro' && g.scope.zoneCode === 'nea'
  );
  if (!hasGrant) {
    user.grants.push({ role: 'cellowner', scope: { operatorCode: 'claro', zoneCode: 'nea' } });
    await user.save();
    console.log('[seed-cellowner] grant cellowner claro/nea agregado');
  } else {
    console.log('[seed-cellowner] grant cellowner claro/nea ya existe — sin cambios');
  }

  // Verificación post-condición (mismo patrón que 28.3).
  const verify = await User.findOne({ email: SEED_EMAIL }, { name: 1, email: 1, grants: 1 });
  console.log('[seed-cellowner] VERIFICACIÓN:');
  console.log('  Email :', verify.email);
  console.log('  Name  :', verify.name);
  console.log('  Grants:', JSON.stringify(verify.grants));

  await mongoose.disconnect();
  console.log('[seed-cellowner] listo.');
  console.log('[seed-cellowner] DEV LOGIN →', SEED_EMAIL, '/', SEED_PASSWORD);
}

seed().catch(err => { console.error(err); process.exit(1); });
