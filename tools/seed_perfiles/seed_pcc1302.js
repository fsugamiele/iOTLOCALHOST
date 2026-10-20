// spec_perfiles_controladora (firmada por Franco 2026-10-20) — primer perfil real:
// Cummins PowerCommand 1.1/1.2 · PCC 1302 · HMI211 (manual A040D969, Edición 1, 1-2011).
// Va por la API (camino productivo, DEC-PROC-5):
//   1. PUT /api/controllerprofiles/cummins-pcc1302 (límites citados + 90 códigos de falla).
//   2. Qp6 — asigna el perfil a los equipos 'cummins-pcc' que no tengan perfil.
//   3. Qp3 — reglas de aceite A0/A1 con espera de 10 s (el controlador para a los 10 s).
//
//   docker exec -i node node - < tools/seed_perfiles/seed_pcc1302.js            → simulación
//   docker exec -i node node - --apply < tools/seed_perfiles/seed_pcc1302.js    → aplica
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
const FAULT_CODES = require(process.env.PCC1302_CODES || '/home/node/app/api/data/controller_profiles/cummins-pcc1302_fault_codes.json');
const e = process.env;
const APPLY = process.argv.includes('--apply');
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});

const SRC = 'Manual de servicio PowerCommand 1.1/1.2 (A040D969)';
const PROFILE = {
  deviceType: 'cummins-pcc',
  manufacturer: 'Cummins',
  model: 'PowerCommand 1.1 / 1.2 · PCC 1302',
  variants: ['HMI211', 'HMI220', 'PowerCommand 1.1', 'PowerCommand 1.1R', 'PowerCommand 1.2'],
  source: `${SRC}, Edición 1, 1-2011`,
  unavailable: [],   // "La presión de aceite no está disponible en todos los modelos": se marca por equipo, no por perfil
  limits: [
    // Qp2 — parada por baja presión de aceite: 180 kPa (26 psig) > 10 s, motores CON ECM.
    // Motores sin ECM: ajustable 62–689,5 kPa → el instalador lo copia del menú del HMI211
    // como límite propio del equipo (PUT /api/device/profile limitOverrides).
    { variable: 'oil_pressure', kind: 'trip', op: 'lt', value: 180, unit: 'kPa', source: `${SRC} · código 415 (motores con ECM): < 26 psig (180 kPa) durante 10 s → parada` },
    // Qp3 — el aviso anticipa la parada del controlador: parada + 10 %.
    { variable: 'oil_pressure', kind: 'warning', op: 'lt', value: 198, unit: 'kPa', source: 'spec_perfiles_controladora Qp3 (Franco 2026-10-20): parada del controlador (180 kPa) + 10 %' },
  ],
  faultCodes: FAULT_CODES,
  install: [
    'Activar "Wake-in-Auto" con InPower o puentear TB15-1 con TB15-5: el PCC 1302 entra en modo inactivo a los 5 min en Apagado o Auto y deja de responder por Modbus (sección 7.3.2.5).',
    'Modbus por TB15: dirección, 2400/4800/9600/19200 bps, paridad par por defecto (sección 8.3.9).',
    'Confirmar tensión nominal de batería (12 o 24 V) y cargarla en el equipo (refParams.battery_nominal_v).',
    'Motor sin ECM: copiar del menú del HMI211 el umbral de parada por baja presión de aceite (LOP Shutdown) como límite propio del equipo.',
  ],
  notes: 'Umbrales del manual = rangos ajustables salvo los fijos de la lógica de los códigos (146: 107,2 °C · 415: 180 kPa · 488: 85 °C/90 s · 1447: 85 %/10 s · 1471: 110 %/60 s · 1472: 150 % · 1992: 115 %).',
};

(async () => {
  // 1 · Perfil
  const prev = await req('GET', '/api/controllerprofiles/cummins-pcc1302');
  console.log(`Perfil cummins-pcc1302: ${prev.status === 200 ? 'existe → se reemplaza' : 'nuevo'} · ${PROFILE.limits.length} límites · ${FAULT_CODES.length} códigos de falla`);
  if (APPLY) {
    const put = await req('PUT', '/api/controllerprofiles/cummins-pcc1302', { profile: PROFILE });
    console.log(`  PUT perfil → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    if (put.status !== 200) process.exit(1);
  }
  // 2 · Asignación (Qp6)
  const devs = ((await req('GET', '/api/device')).json || {}).data || [];
  const cummins = devs.filter((d) => d.deviceType === 'cummins-pcc');
  for (const d of cummins) {
    if (d.profileId) { console.log(`  ${d.name || d.dId}: ya tiene perfil «${d.profileId}»`); continue; }
    console.log(`  ${d.name || d.dId} [${d.dId}] → perfil cummins-pcc1302${APPLY ? '' : ' (no aplicado)'}`);
    if (APPLY) { const r = await req('PUT', '/api/device/profile', { dId: d.dId, profileId: 'cummins-pcc1302' }); console.log(`    PUT → ${r.status}${r.status !== 200 ? ' ' + r.raw.slice(0, 200) : ''}`); }
  }
  if (!cummins.length) console.log('  (no hay equipos cummins-pcc)');
  // 3 · Qp3 — espera de 10 s en las reglas de aceite
  const pack = ((await req('GET', '/api/rulepacks/cummins-pcc-v1')).json || {}).data;
  if (pack) {
    let cambio = false;
    const rules = pack.rules.map((r) => {
      if (!['cummins-A0-oil-pressure-low', 'cummins-A1-oil-pressure'].includes(r.ruleId)) return r;
      if (r.graceSec === 10) { console.log(`  ${r.ruleId}: espera ya en 10 s`); return r; }
      console.log(`  ${r.ruleId}: espera ${r.graceSec} s → 10 s${APPLY ? '' : ' (no aplicado)'}`);
      cambio = true; return { ...r, graceSec: 10 };
    });
    if (APPLY && cambio) {
      const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
      const put = await req('PUT', `/api/rulepacks/${pack.packId}`, body);
      console.log(`  PUT pack → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 200) : ''}`);
    }
  }
  console.log(APPLY ? '\n── aplicado: el edge recarga solo ──' : '\n(simulación; usar --apply)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
