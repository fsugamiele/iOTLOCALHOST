'use strict';
// seed_fichas — crea el catálogo de fichas de equipo de Wanomi por la API
// (POST /equipmentsheet, validación Mongoose = path productivo). Idempotente:
// GET previo y saltea las que ya existen. No borra ni edita (las fichas no
// tienen PUT — DEC-REF-97). Fuente de las variables: cruce template ↔
// sensor-engine del simulador (DEC-REF-91/108/109, adenda bitácora #81-c).
//
// Auth sin password: firma un JWT con JWT_SECRET para el _id del superadmin
// (el middleware relee grants de DB → RBAC pasa). Patrón seed F3.
//
// Uso:
//   ADMIN_ID=<_id de un usuario superadmin> \
//   node tools/seed_fichas/seed.js
//   # ADMIN_ID por defecto = admin@wanomi.com en dev; obtenerlo con:
//   #   db.users.findOne({email:"admin@wanomi.com"},{_id:1})
//   # API_HOST/API_PORT overridean el destino (default localhost:3001).
const fs = require('fs');
const http = require('http');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const jwt = require(path.join(REPO, 'app/node_modules/jsonwebtoken'));

const env = fs.readFileSync(path.join(REPO, 'app/.env'), 'utf8');
const JWT_SECRET = (env.match(/^JWT_SECRET=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');
const ADMIN_ID = process.env.ADMIN_ID || '6a32e105be5ca779169754af';   // dev: admin@wanomi.com
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);

const token = jwt.sign({ userData: { _id: ADMIN_ID, email: 'admin@wanomi.com' } }, JWT_SECRET, { expiresIn: '10m' });

const V = (name, label, type, unit, deadband, limits) => {
  const v = { name, label, type };
  if (unit) v.unit = unit;
  if (deadband != null) v.deadband = deadband;
  if (limits) v.limits = limits;
  return v;
};

const FICHAS = [
  { deviceType: 'cummins-pcc', manufacturer: 'Cummins', model: 'PowerCommand (PCC)', origin: 'third_party', domain: 'grupo', variables: [
    // limits con evidencia: LOP ~25 psi (sensor-engine); fuel/temp de
    // registros_consolidado_gef.md §4 (manual InteliGen/Cummins NFPA110).
    V('oil_pressure', 'Presión aceite', 'float', 'psi', 1, [{ kind: 'trip', op: 'lt', value: 25, unit: 'psi', source: 'Cummins PCC — LOP setpoint' }]),
    V('coolant_temp', 'Temperatura refrigerante', 'float', '°C', 0.5, [
      { kind: 'warning', op: 'gt', value: 95, unit: '°C', source: 'registros_consolidado_gef.md §4 (HET/NFPA b5)' },
      { kind: 'trip', op: 'gt', value: 105, unit: '°C', source: 'registros_consolidado_gef.md §4 (HET/NFPA b5)' }]),
    V('rpm', 'RPM motor', 'int', '', 25),
    V('run_hours', 'Horas de marcha', 'float', 'h', 0.1),
    V('battery_voltage', 'Tensión batería arranque', 'float', 'V', 0.3),
    V('fuel_level', 'Nivel combustible', 'float', '%', 1, [
      { kind: 'warning', op: 'lt', value: 25, unit: '%', source: 'registros_consolidado_gef.md §4 (NFPA b0)' },
      { kind: 'trip', op: 'lt', value: 10, unit: '%', source: 'registros_consolidado_gef.md §4 (NFPA b0)' }]),
    V('fault_code', 'Código de falla', 'int', '', null),
    V('bitmap_42100', 'Status word (42100)', 'int', '', null),
    V('bitmap_42101', 'Alarm word 1 (42101)', 'int', '', null),
    V('bitmap_42102', 'Alarm word 2 (42102)', 'int', '', null),
    V('bitmap_42110', 'Event word (42110)', 'int', '', null),
    V('coolant_temp_setpoint', 'Setpoint temp. refrigerante', 'float', '°C', null),
    V('oil_pressure_setpoint', 'Setpoint presión aceite', 'float', 'psi', null),
    // spec_autonomy_extendido / _deteccion_sifoneo_eficiencia — caudalímetro + carga.
    V('fuel_rate', 'Caudal de combustible', 'float', 'L/h', 0.2),
    V('genset_power_kw', 'Potencia del grupo', 'float', 'kW', 0.3),
  ], autonomy: { fuelVariable: 'fuel_level', tankCapacity: 250, consumptionLph: 3.46, flowVariable: 'fuel_rate', flowScale: 1, runningVariable: 'rpm' } },
  { deviceType: 'ATS', manufacturer: 'ComAp', model: 'InteliATS²', origin: 'third_party', domain: 'energia', variables: [
    V('transfer_state', 'Estado de transferencia', 'categorical', '', null),
    V('mains_voltage', 'Tensión red', 'float', 'V', 2),
    V('mains_freq', 'Frecuencia red', 'float', 'Hz', 0.1),
    V('gen_voltage', 'Tensión generador', 'float', 'V', 2),
    V('gen_freq', 'Frecuencia generador', 'float', 'Hz', 0.1),
    V('load_kw', 'Carga activa', 'float', 'kW', 0.5),
    V('gen_status', 'Estado del generador', 'categorical', '', null),
  ] },
  { deviceType: 'ELTEK', manufacturer: 'Eltek', model: 'Smartpack S', origin: 'third_party', domain: 'energia', variables: [
    V('dc_bus_voltage', 'Tensión DC bus', 'float', 'V', 0.3),
    V('dc_load_current', 'Corriente carga', 'float', 'A', 1),
    V('temperature', 'Temperatura sistema', 'float', '°C', 0.5, [
      { kind: 'trip', op: 'gt', value: 60, unit: '°C', source: 'Eltek Smartpack S — rango operativo (mapeo_modbus_drivers.md)' }]),
  ] },
  { deviceType: 'SEC', manufacturer: 'Wanomi', model: 'WN-SITE-SEC (Sense)', origin: 'own', domain: 'seguridad', variables: [
    V('door_shelter', 'Puerta shelter', 'bool', '', null),
    V('door_front', 'Puerta frente', 'bool', '', null),
    V('door_rear', 'Puerta trasera', 'bool', '', null),
    V('door_battery_cabinet', 'Gabinete de baterías', 'bool', '', null),
    V('pir_motion', 'Movimiento interior (PIR)', 'bool', '', null),
    V('fence_vibration', 'Vibración cerco (corte/golpe)', 'bool', '', null),
    V('copper_field_anomaly', 'Movimiento de cobre', 'bool', '', null),
    V('ground_continuity', 'Continuidad de tierra', 'bool', '', null),
    V('battery_beacons_count', 'Baterías presentes (BLE beacons)', 'int', 'uni', null),
    V('shelter_temp', 'Temperatura shelter', 'float', '°C', 0.5),
  ] },
  { deviceType: 'GEN', manufacturer: 'Genérico', model: 'Generador genérico', origin: 'third_party', domain: 'grupo', variables: [
    V('fuel_level', 'Nivel combustible', 'float', '%', 1, [
      { kind: 'warning', op: 'lt', value: 25, unit: '%', source: 'registros_consolidado_gef.md §4 (NFPA b0)' },
      { kind: 'trip', op: 'lt', value: 10, unit: '%', source: 'registros_consolidado_gef.md §4 (NFPA b0)' }]),
    V('genset_running', 'Motor en marcha', 'bool', '', null),
    V('exhaust_temp', 'Temperatura escape', 'float', '°C', 0.5),
    V('vibration_signature', 'Firma de vibración', 'categorical', '', null),
    V('crank_current', 'Corriente de arranque', 'float', 'A', 0),
    V('alternator_voltage', 'Tensión alternador', 'float', 'V', null),
    V('battery_voltage', 'Tensión arranque batería', 'float', 'V', 0.3),
    V('crank_attempts_failed', 'Arranques fallidos', 'int', '', null),
    V('mains_voltage', 'Tensión red eléctrica', 'float', 'V', 2),
    // spec_autonomy_extendido / _deteccion_sifoneo_eficiencia — caudalímetro + carga.
    V('fuel_rate', 'Caudal de combustible', 'float', 'L/h', 0.2),
    V('genset_power_kw', 'Potencia del grupo', 'float', 'kW', 0.3),
  ], autonomy: { fuelVariable: 'fuel_level', tankCapacity: 250, consumptionLph: 3.46, flowVariable: 'fuel_rate', flowScale: 1, runningVariable: 'genset_running' } },
];

function call(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { token };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ host: API_HOST, port: API_PORT, path: '/api' + p, method, headers }, (res) => {
      let d = ''; res.on('data', (c) => d += c); res.on('end', () => resolve({ code: res.statusCode, body: d }));
    });
    req.on('error', (e) => resolve({ code: 'ERR', body: e.message }));
    if (data) req.write(data); req.end();
  });
}

(async () => {
  const existing = await call('GET', '/equipmentsheet');
  let have = [];
  try { have = (JSON.parse(existing.body).data || []).map((f) => f.deviceType); } catch (e) {}
  for (const f of FICHAS) {
    if (have.includes(f.deviceType)) { console.log(`skip   ${f.deviceType} (ya existe)`); continue; }
    const r = await call('POST', '/equipmentsheet', { newEquipmentSheet: f });
    console.log(`${r.code === 200 ? 'create' : 'FAIL  '} ${f.deviceType} (${f.variables.length} vars) ${r.code === 200 ? '' : r.body.slice(0, 140)}`);
  }
})();
