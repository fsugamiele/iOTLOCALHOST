require('@babel/register')({ presets: ['@babel/preset-env'], extensions: ['.js'] });
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const User     = require('../app/api/models/user').default;

// Patrón 28.3 / 28.x: URI explícita, sin fallback a /wanomi. Base real es iotix.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('FATAL: MONGODB_URI no definido. Pasalo explícito (base iotix), no confíes en fallback.');
  process.exit(1);
}

// SERVICE ACCOUNT del operador Claro (33.1).
// Es el "tenant 4" — dueño de los sites y devices del piloto Claro NEA tras la
// migración. NO es una persona, NO debe poder loguearse jamás.
//
// "Sin login usable" se garantiza así:
//   1. Generamos un secreto de alta entropía (64 bytes random hex = 128 chars,
//      ~512 bits). bcrypt.hash() lo procesa pero solo guarda el hash en DB.
//   2. El plano NUNCA se imprime, NUNCA se persiste, NUNCA sale del closure.
//      Se descarta apenas tomamos el hash.
//   3. /login (users.js:44) autentica ÚNICAMENTE con bcrypt.compareSync — no
//      hay otro path. Sin conocer el plano (que ya no existe en el universo)
//      es matemáticamente imposible autenticarse.
//   4. El schema User no tiene flag active/disabled (verificado A1) — no
//      podemos sumar defensa en profundidad sin migrar el schema. La entropía
//      del password es la única (y suficiente) barrera.
//
// Grants: []  — sin permisos. El usuario solo existe para ser dueño de docs
// (userId en sites/devices); no necesita ni debe tener grants.

const SVC_EMAIL = 'operator-claro@wanomi.platform';
const SVC_NAME  = 'Operator Claro (Service Account)';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[seed-operator-claro] conectado a', MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

  // Idempotencia: si ya existe, no recrear ni rotar password. Misma forma que
  // tenancy_cellowner.js (find primero, create solo si falta).
  const existing = await User.findOne({ email: SVC_EMAIL });
  if (existing) {
    console.log('[seed-operator-claro] usuario', SVC_EMAIL, 'ya existe (_id:', existing._id.toString() + ') — sin recrear');
    console.log('[seed-operator-claro] grants:', JSON.stringify(existing.grants || []));
    await mongoose.disconnect();
    return;
  }

  // Password no-login: 64 bytes random → hex (128 chars) → bcrypt → descartar.
  // El plano vive solo en este scope, no se loguea ni se persiste.
  const unloggable = crypto.randomBytes(64).toString('hex');
  const passwordHash = bcrypt.hashSync(unloggable, 10);
  // Tras esta línea, el plano queda fuera de cualquier referencia accesible.

  const user = await User.create({
    name:     SVC_NAME,
    email:    SVC_EMAIL,
    password: passwordHash,
    grants:   [],
  });

  console.log('[seed-operator-claro] usuario', SVC_EMAIL, 'creado (_id:', user._id.toString() + ')');
  console.log('[seed-operator-claro] password hash bcrypt, plano descartado en runtime — sin login posible');

  // Verificación post-condición.
  const verify = await User.findOne({ email: SVC_EMAIL }, { name: 1, email: 1, grants: 1 });
  console.log('[seed-operator-claro] VERIFICACIÓN:');
  console.log('  _id   :', verify._id.toString());
  console.log('  Email :', verify.email);
  console.log('  Name  :', verify.name);
  console.log('  Grants:', JSON.stringify(verify.grants));

  await mongoose.disconnect();
  console.log('[seed-operator-claro] listo.');
}

seed().catch(err => { console.error(err); process.exit(1); });
