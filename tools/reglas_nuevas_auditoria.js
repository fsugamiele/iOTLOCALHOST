// Auditoría de umbrales vs fabricante — reglas nuevas firmadas por Franco 2026-10-22:
//   P5 · gen-escape-desbalance «Desbalance de escape entre bancos» (aviso): |banco A − banco B| > 40 °C
//        con el motor en marcha durante 2 min → inyector tapado o goteando (Wanomi Sense, spec §5/§6).
//   P8 · cummins-refrigerante-frio «Refrigerante frío (grupo detenido)» (aviso): refrigerante < 21 °C
//        con el motor detenido durante 1 min → calefactor de bloque caído, el grupo arrancaría frío.
//        Valor: aviso de refrigerante frío del PowerCommand (< 70 °F = 21 °C, 1 min de confirmación).
// Agrega las reglas si no existen. Va por la API (PUT /api/rulepacks/:packId).
//   docker exec -i node node - < tools/reglas_nuevas_auditoria.js            → simulación
//   docker exec -i node node - --apply < tools/reglas_nuevas_auditoria.js    → aplica
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

const NUEVAS = {
  'gen-grupo-v1': [{
    ruleId: 'gen-escape-desbalance', inferenceId: 'GEN-ESC-1', type: 'cross', severity: 'warning',
    label: 'Desbalance de escape entre bancos', unit: '°C', deviceType: 'GEN', variable: 'exhaust_temp_a',
    crossExpr: { op: 'AND', children: [
      { deviceType: 'GEN', variable: 'exhaust_temp_a', measure: 'metric', metric: 'divergence',
        inputs: [{ deviceType: 'GEN', variable: 'exhaust_temp_a' }, { deviceType: 'GEN', variable: 'exhaust_temp_b' }],
        condition: { op: 'gt', value: 40 } },
      { deviceType: 'GEN', variable: 'genset_running', condition: { op: 'eq', value: 1 } },
    ] },
    graceSec: 120, resolveGraceSec: 120, cooldownSec: 300, reset_behavior: 'auto',
    meaning: 'Con el motor en marcha, la temperatura de escape de un banco difiere más de 40 °C de la del otro. Un banco más frío suele ser un inyector tapado (ese banco quema menos); uno más caliente, un inyector que gotea.',
    recommendation: 'Programar la revisión de inyectores del banco que se aparta antes de que aumente el consumo o se dañe el motor.',
    steps: [
      'Ver en el detalle cuál banco está más frío o más caliente.',
      'Comparar con la vibración de encendido y el consumo del Sense.',
      'Pedir la revisión / calibración de inyectores de ese banco.',
    ],
  }],
  'cummins-pcc-v1': [{
    ruleId: 'cummins-refrigerante-frio', inferenceId: 'CUM-LCT-1', type: 'cross', severity: 'warning',
    label: 'Refrigerante frío (grupo detenido)', unit: '°C', deviceType: 'cummins-pcc', variable: 'coolant_temp',
    crossExpr: { op: 'AND', children: [
      { deviceType: 'cummins-pcc', variable: 'coolant_temp', condition: { op: 'lt', value: 21 } },
      { deviceType: 'cummins-pcc', variable: 'rpm', condition: { op: 'lt', value: 300 } },
    ] },
    graceSec: 60, resolveGraceSec: 120, cooldownSec: 300, reset_behavior: 'auto',
    meaning: 'Con el grupo detenido, el refrigerante está por debajo de 21 °C (aviso de refrigerante frío del PowerCommand). El calefactor de bloque no está calentando: si se corta la red, el grupo arrancaría frío, con más esfuerzo y desgaste.',
    recommendation: 'Revisar el calefactor de bloque (alimentación, térmica, termostato) en el próximo ingreso al sitio.',
    steps: [
      'Verificar que el calefactor de bloque tenga alimentación (térmica / interruptor).',
      'Comprobar el termostato y la resistencia del calefactor.',
      'Confirmar que la temperatura del refrigerante vuelve a subir.',
    ],
  }],
};

(async () => {
  let n = 0;
  for (const [packId, reglas] of Object.entries(NUEVAS)) {
    const pack = ((await req('GET', `/api/rulepacks/${packId}`)).json || {}).data;
    if (!pack) { console.log(`· no existe el pack ${packId}`); continue; }
    const add = reglas.filter((r) => !pack.rules.some((x) => x.ruleId === r.ruleId));
    for (const r of reglas) console.log(add.includes(r) ? `→ nueva ${r.ruleId} «${r.label}» en ${packId}${APPLY ? '' : ' (no aplicada)'}` : `✓ ${r.ruleId} ya existe`);
    if (!APPLY || !add.length) continue;
    n += add.length;
    const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules: [...pack.rules, ...add] } };
    const put = await req('PUT', `/api/rulepacks/${packId}`, body);
    console.log(`   PUT ${packId} → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  console.log(APPLY ? `\n── ${n} regla(s) agregadas: el edge recarga solo ──` : '\n(simulación; usar --apply)');
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
