/**
 * seed_p2_bootstrap.js — DEC-REF-93
 *
 * Alta de los dos usuarios semilla del entorno P2 + arbol de tenancy wanomi/arg.
 * NO tiene efecto sobre produccion: la guarda de destino aborta si el Mongo
 * efectivo no es el de P2 (puerto 27018, que produccion no publica).
 *
 * Corre DESDE EL HOST: seeds/ no esta montado dentro de node-p2.
 *   NODE_PATH=app/node_modules node seeds/seed_p2_bootstrap.js
 *
 * Passwords: se leen de /tmp/.p2_pw (dos lineas: U1, U2). Nunca inline.
 * Idempotente: re-correr no duplica ni pisa. Falla a mitad: aborta, no compensa.
 */

const fs = require('fs');
const { MongoClient } = require('mongodb');
const axios = require('axios');

// --- constantes de DEC-REF-93 ---------------------------------------------
const OPERATOR_CODE = 'wanomi';
const OPERATOR_NAME = 'Wanomi';
const ZONE_CODE     = 'arg';
const ZONE_NAME     = 'Argentina';

const U1 = { name: 'Superadmin P2', email: 'superadmin-p2@wanomi.test' };
const U2 = { name: 'Cellowner P2',  email: 'cellowner-p2@wanomi.test'  };

const P2_MONGO_PORT = '27018';
const P2_API        = 'http://127.0.0.1:3101/api';
const PW_FILE       = '/tmp/.p2_pw';

const die = (paso, msg) => {
  console.error(`\n[ABORT] paso ${paso}: ${msg}`);
  console.error('No se compensa lo ya escrito. El script es re-corrible.');
  process.exit(1);
};

// --- GUARDA DE DESTINO (primera operacion, antes de leer nada mas) ---------
// Deriva la URI de p2/app.env y reescribe host:puerto al publicado del host.
// Conserva el resto de la URI (authSource incluido) sin interpretarlo.
function resolveP2Uri() {
  let raw;
  try {
    raw = fs.readFileSync('p2/app.env', 'utf8')
      .split('\n').find(l => l.startsWith('MONGODB_URI='));
  } catch (e) { die('guarda', 'no se pudo leer p2/app.env — ¿corriendo desde la raiz del repo?'); }
  if (!raw) die('guarda', 'MONGODB_URI ausente en p2/app.env');

  const uri = raw.slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');
  // reescribe SOLO el segmento host:puerto (entre el ultimo '@' y el primer '/' que sigue)
  const out = uri.replace(/@([^/@]+)(\/|$)/, `@127.0.0.1:${P2_MONGO_PORT}$2`);

  if (!out.includes(`:${P2_MONGO_PORT}`)) {
    die('guarda', `la URI resultante NO apunta al puerto ${P2_MONGO_PORT} de P2. No se escribe un byte.`);
  }
  // check redundante y deliberado: produccion no publica 27018
  if (out.includes(':27017')) {
    die('guarda', 'la URI menciona 27017 (produccion). ABORTA.');
  }
  return out;
}

function readPasswords() {
  let lines;
  try { lines = fs.readFileSync(PW_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean); }
  catch (e) { die('pw', `no se pudo leer ${PW_FILE}. Crealo con dos lineas: pw de U1 y pw de U2.`); }
  if (lines.length < 2)      die('pw', `${PW_FILE} necesita dos lineas (U1 y U2)`);
  if (lines.some(p => p.length < 6)) die('pw', 'password menor a 6 chars — /register lo rechaza (users.js:90)');
  return { p1: lines[0], p2: lines[1] };
}

// --- helpers ---------------------------------------------------------------
async function ensureUser(db, api, user, password, label) {
  const existing = await db.collection('users').findOne({ email: user.email });
  if (existing) {
    console.log(`  = ${label} ya existe (${user.email}) — no se registra de nuevo`);
    return existing._id;
  }
  // lectura previa deliberada: /register responde 500 crudo en colision (BACKLOG-API-2)
  let r;
  try {
    r = await axios.post(`${api}/register`, { name: user.name, email: user.email, password });
  } catch (e) {
    die(label, `POST /register fallo — HTTP ${e.response ? e.response.status : '?'}`);
  }
  if (r.data.status !== 'success') die(label, `/register no devolvio success: ${JSON.stringify(r.data)}`);

  const created = await db.collection('users').findOne({ email: user.email });
  if (!created) die(label, '/register dijo success pero el usuario no esta en la base');
  console.log(`  + ${label} creado por producto (${user.email})`);
  return created._id;
}

async function setGrant(db, userId, grant, label) {
  // $set, NUNCA $push: re-correr deja un grant, no dos.
  const r = await db.collection('users').updateOne({ _id: userId }, { $set: { grants: [grant] } });
  if (r.matchedCount !== 1) die(label, 'updateOne no matcheo el usuario');
  console.log(`  + grant ${grant.role} asignado a ${label}`);
}

// --- main ------------------------------------------------------------------
(async () => {
  const uri = resolveP2Uri();
  const { p1, p2 } = readPasswords();
  console.log(`\n[GUARDA] destino verificado: puerto ${P2_MONGO_PORT} (P2). Procedo.\n`);

  const client = new MongoClient(uri, { useUnifiedTopology: true });
  await client.connect().catch(e => die('conexion', e.message));
  const db = client.db();

  try {
    // 1 · Operator — UNICA escritura directa. No existe endpoint (BACKLOG-TENANT-11)
    const op = await db.collection('operators').findOne({ operatorCode: OPERATOR_CODE });
    if (op) console.log(`  = Operator ${OPERATOR_CODE} ya existe`);
    else {
      await db.collection('operators').insertOne({
        operatorCode: OPERATOR_CODE, displayName: OPERATOR_NAME, createdTime: Date.now()
      });
      console.log(`  + Operator ${OPERATOR_CODE} sembrado (sin endpoint de alta)`);
    }

    // 2-3 · Usuario 1 (superadmin) — grant SIN scope (scope.js:52 retorna {} antes de mirarlo)
    const id1 = await ensureUser(db, P2_API, U1, p1, 'U1');
    await setGrant(db, id1, { role: 'superadmin' }, 'U1');

    // 4 · Login U1
    let login;
    try { login = await axios.post(`${P2_API}/login`, { email: U1.email, password: p1 }); }
    catch (e) { die('login', `HTTP ${e.response ? e.response.status : '?'} — ¿password de U1 correcto?`); }
    const token = login.data.token;
    if (!token) die('login', 'login sin token en el body');
    const H = { headers: { token } };   // cabecera 'token', NO Bearer
    console.log('  + login U1 OK');

    // 5 · Zone POR PRODUCTO — el endpoint existe (zones.js:26), no se siembra
    const z = await db.collection('zones').findOne({ operatorCode: OPERATOR_CODE, zoneCode: ZONE_CODE });
    if (z) console.log(`  = Zone ${OPERATOR_CODE}/${ZONE_CODE} ya existe`);
    else {
      let rz;
      try {
        rz = await axios.post(`${P2_API}/zone`, {
          newZone: { zoneCode: ZONE_CODE, displayName: ZONE_NAME, operatorCode: OPERATOR_CODE }
        }, H);
      } catch (e) { die('zone', `POST /zone HTTP ${e.response ? e.response.status : '?'} — 403 = grant no cubre`); }
      if (rz.status !== 200) die('zone', `POST /zone devolvio ${rz.status}, se exige 200`);
      console.log(`  + Zone ${ZONE_CODE} creada por HTTP 200 (no INSERT)`);
    }

    // 6-7 · Usuario 2 (cellowner) — con scope, para que la tenancy sea ejercitable
    const id2 = await ensureUser(db, P2_API, U2, p2, 'U2');
    await setGrant(db, id2,
      { role: 'cellowner', scope: { operatorCode: OPERATOR_CODE, zoneCode: ZONE_CODE } }, 'U2');

    // 8 · VERIFICACION — GET /me, unico endpoint con cuerpo no vacio en base cero
    console.log('\n--- verificacion (criterio de aceptacion, DEC-REF-93) ---');
    const check = async (u, pw, expect) => {
      const l = await axios.post(`${P2_API}/login`, { email: u.email, password: pw });
      const me = await axios.get(`${P2_API}/me`, { headers: { token: l.data.token } });
      const g = (me.data.data.grants || [])[0];
      const ok = g && g.role === expect.role &&
        (!expect.scope || (g.scope && g.scope.operatorCode === expect.scope.operatorCode
                                   && g.scope.zoneCode === expect.scope.zoneCode));
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${u.email} -> ${JSON.stringify(g)}`);
      return ok;
    };
    const ok1 = await check(U1, p1, { role: 'superadmin' });
    const ok2 = await check(U2, p2, { role: 'cellowner', scope: { operatorCode: OPERATOR_CODE, zoneCode: ZONE_CODE } });

    const counts = {};
    for (const c of ['operators','zones','users','sites','devices'])
      counts[c] = await db.collection(c).countDocuments();
    console.log('  conteos:', JSON.stringify(counts));

    const okCounts = counts.operators === 1 && counts.zones === 1 && counts.users === 2
                  && counts.sites === 0 && counts.devices === 0;
    console.log(`  ${okCounts ? 'OK  ' : 'FAIL'} conteos esperados (1/1/2/0/0)`);
    console.log(`\n>>> ${(ok1 && ok2 && okCounts) ? 'SEED VERDE' : 'SEED ROJO — revisar arriba'}`);
  } finally {
    await client.close();
  }
})();
