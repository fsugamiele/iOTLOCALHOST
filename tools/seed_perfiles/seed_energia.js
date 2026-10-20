// spec_perfiles_controladora — perfiles del ATS ComAp InteliATS NT y del rectificador Eltek
// Smartpack S con lo que hay DOCUMENTADO en la biblioteca de campo (mapeo_modbus_drivers.md,
// matriz_drivers_connect.md). Sin umbrales: los manuales que tenemos no traen valores por
// defecto (ComAp: setpoints leíbles del equipo; Eltek: doc 350020.073 pendiente) y no se
// inventan. Aportan: identidad del modelo, requisitos de instalación y notas para el driver.
// Asigna el perfil a los equipos ATS / ELTEK que no tengan perfil (Qp6).
//
//   docker exec -i node node - < tools/seed_perfiles/seed_energia.js            → simulación
//   docker exec -i node node - --apply < tools/seed_perfiles/seed_energia.js    → aplica
const http = require('http');
try { require('/home/node/app/node_modules/dotenv').config({ path: '/home/node/app/.env' }); } catch (_) {}
let jwt; try { jwt = require('jsonwebtoken'); } catch (_) { jwt = require('/home/node/app/node_modules/jsonwebtoken'); }
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

const PERFILES = [
  { profileId: 'comap-inteliats-nt-pwr', profile: {
    deviceType: 'ATS', manufacturer: 'ComAp', model: 'InteliATS NT PWR',
    variants: ['InteliATS NT', 'IA-NT-PWR'],
    source: 'InteliATSNT PWR Reference Guide SW v2.0 (ComAp, jun 2010) — biblioteca de campo: GE- ComAp ATS.pdf',
    unavailable: [], limits: [], faultCodes: [],
    install: [
      'Modbus RTU por COM1 (RS232) o COM2 (RS485) con la tarjeta IL-NT-RS232-485; COM Mode = MODBUS.',
      'Velocidad 9600 / 19200 / 38400 / 57600 bps (ModbusComSpeed); dirección del controlador 1–32 (varios en la misma línea RS485).',
      'Registrar del controlador del sitio sus setpoints (Mains <V / >V / <f / >f trip, Batt Undervolt / Overvolt) y cargarlos como valores propios del equipo hasta que el driver los lea.',
    ],
    notes: 'Los umbrales de red y de batería son SETPOINTS leíbles del propio controlador (reg. 8305 Mains >V, 8307 Mains <V, 8310 Mains >f, 8312 Mains <f en % del nominal; 8387 / 9587 batería en V; 8303 Transfer Delay; 8302 Mains Return Delay). El manual no trae valores por defecto: no se cargan umbrales de fabricante. Mediciones vivas: exportar la descripción con LiteEdit (pendiente).',
  } },
  { profileId: 'eltek-smartpack-s', profile: {
    deviceType: 'ELTEK', manufacturer: 'Eltek', model: 'Smartpack S',
    variants: ['Smartpack S', 'Flatpack2 (rectificadores)'],
    source: 'Smartpack S Controller User\'s Guide PN 242100.410 — biblioteca de campo: controladora eltek flatpack.pdf',
    unavailable: [], limits: [], faultCodes: [],
    install: [
      'Modbus TCP por Ethernet, puerto 502 (confirmar en el firmware del sitio). IP por defecto 192.168.10.20 (configurable con Eltek Network Utility).',
      'Modbus RTU por RS232/RS485 figura como "pending" en este firmware: usar TCP.',
      'Corriente de carga por shunt (0–20 mV / 0–60 mV): registrar la relación del shunt del sitio.',
      'Registrar del controlador del sitio sus alarmas de tensión (baja / crítica / sobretensión), LVD y reconexión, y cargarlas como valores propios del equipo.',
    ],
    notes: 'El User\'s Guide solo trae ejemplos (sobretensión mayor 57,00 V con histéresis 0,10 V y 5 s; LVD 43,0 V / reconexión 48,0 V), no valores por defecto: no se cargan como umbrales de fabricante. Registros Modbus y defaults: documento 350020.073 (Functionality Description), pendiente. Los umbrales de la ficha ELTEK siguen PROVISORIOS.',
  } },
];

(async () => {
  const devs = ((await req('GET', '/api/device')).json || {}).data || [];
  for (const { profileId, profile } of PERFILES) {
    const prev = await req('GET', `/api/controllerprofiles/${profileId}`);
    console.log(`Perfil ${profileId}: ${prev.status === 200 ? 'existe → se reemplaza' : 'nuevo'} (${profile.deviceType})`);
    if (APPLY) {
      const put = await req('PUT', `/api/controllerprofiles/${profileId}`, { profile });
      console.log(`  PUT perfil → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
      if (put.status !== 200) continue;
    }
    for (const d of devs.filter((x) => x.deviceType === profile.deviceType)) {
      if (d.profileId) { console.log(`  ${d.name || d.dId}: ya tiene perfil «${d.profileId}»`); continue; }
      console.log(`  ${d.name || d.dId} [${d.dId}] → ${profileId}${APPLY ? '' : ' (no aplicado)'}`);
      if (APPLY) { const r = await req('PUT', '/api/device/profile', { dId: d.dId, profileId }); console.log(`    PUT → ${r.status}${r.status !== 200 ? ' ' + r.raw.slice(0, 200) : ''}`); }
    }
  }
  console.log(APPLY ? '\n── aplicado ──' : '\n(simulación; usar --apply)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
