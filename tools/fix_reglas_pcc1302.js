// Manual de servicio PowerCommand 1.1/1.2 (PCC 1302) — Franco 2026-10-21 "ok, avanza":
//   1. cat-GE-12: el código 488 es TEMPERATURA DEL MÚLTIPLE DE ADMISIÓN ALTA (> 85 °C durante 90 s),
//      no filtro de aire → se renombra y se reescriben sus textos.
//   2. Reglas nuevas sobre el código de falla:
//      · cat-GE-1463 «Grupo no en automático» (crítica): con el control fuera de Auto el grupo NO
//        arranca con el corte de red.
//      · cat-GE-1131 «Modo derivación activo» (crítica): battle short, protecciones anuladas.
// Va por la API (PUT /api/rulepacks/cummins-pcc-v1, camino productivo).
// Límite: fault_code trae el código activo más reciente; si el PCC tuviera otra falla activa a la
// vez, 1463/1131 no se verían por esta vía (a validar con el mapa Modbus del PCC 1302).
//
//   docker exec -i node node - < tools/fix_reglas_pcc1302.js            → simulación
//   docker exec -i node node - --apply < tools/fix_reglas_pcc1302.js    → aplica
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
const SRC = 'Manual de servicio PowerCommand 1.1/1.2 (A040D969)';

const GE12 = {
  label: 'Temperatura de admisión alta',
  variableLabel: 'Código de falla',
  meaning: 'El controlador informa el código 488: la temperatura del múltiple de admisión superó 85 °C durante más de 90 s. El motor respira aire demasiado caliente: pierde potencia y se acerca a la sobretemperatura.',
  recommendation: 'Revisar la ventilación del recinto, el radiador / enfriador de aire de carga y la correa del ventilador.',
  steps: [
    'Verificar la temperatura ambiente y que las persianas del recinto abran.',
    'Inspeccionar el radiador y el enfriador de aire de carga: aletas sucias, dañadas u obstruidas.',
    'Revisar la correa y el mando del ventilador.',
    'Si persiste, verificar el sensor de temperatura de admisión y el umbral configurado.',
  ],
};

const NUEVAS = [
  {
    ruleId: 'cat-GE-1463', inferenceId: 'GE-1463', type: 'D', severity: 'critical',
    label: 'Grupo no en automático', variableLabel: 'Código de falla', unit: '',
    deviceType: 'cummins-pcc', variable: 'fault_code', condition: { op: 'eq', value: 1463 },
    graceSec: 60, resolveGraceSec: 0, cooldownSec: 300, reset_behavior: 'auto',
    meaning: 'El control del grupo no está en modo Automático (código 1463). Si se corta la red, el grupo NO va a arrancar: el sitio queda solo con baterías.',
    recommendation: 'Volver el control a Auto. Si alguien lo dejó en Manual o Apagado por un mantenimiento, confirmar con el técnico antes de cambiarlo.',
    steps: [
      'Consultar si hay un mantenimiento en curso en el sitio.',
      'Pedir al técnico (o en el próximo ingreso) que ponga el control en Auto (botón Auto Mode / llave Run-Off-Auto).',
      'Confirmar que la luz "Not in Auto" del HMI se apagó y que la alarma se cerró.',
    ],
    sourceNote: `${SRC} · sección 8.3.6.4 (código 1463: no en automático)`,
  },
  {
    ruleId: 'cat-GE-1131', inferenceId: 'GE-1131', type: 'D', severity: 'critical',
    label: 'Modo derivación activo (protecciones anuladas)', variableLabel: 'Código de falla', unit: '',
    deviceType: 'cummins-pcc', variable: 'fault_code', condition: { op: 'eq', value: 1131 },
    graceSec: 0, resolveGraceSec: 0, cooldownSec: 300, reset_behavior: 'auto',
    meaning: 'El grupo está en modo derivación (battle short, código 1131): las paradas por falla están anuladas, salvo sobrevelocidad, pérdida de velocidad, falla de excitación y paradas de emergencia. Una falla puede dañar el motor sin que el grupo se detenga.',
    recommendation: 'Supervisar el grupo mientras dure y desactivar el modo derivación apenas termine la emergencia que lo justificó.',
    steps: [
      'Confirmar quién activó el modo derivación y por qué.',
      'Vigilar presión de aceite, temperatura y velocidad mientras esté activo.',
      'Desactivarlo (submenú del modo en derivación → Inactivo) cuando ya no haga falta.',
      'Revisar las fallas que se anularon durante la derivación (historial de fallas, código 1416).',
    ],
    sourceNote: `${SRC} · sección 7.3.2.6 (modo de funcionamiento derivando los mecanismos normales de parada)`,
  },
];

(async () => {
  const pack = ((await req('GET', '/api/rulepacks/cummins-pcc-v1')).json || {}).data;
  if (!pack) throw new Error('no existe el pack cummins-pcc-v1');
  let rules = [...pack.rules];
  let cambios = 0;
  const i12 = rules.findIndex((r) => r.ruleId === 'cat-GE-12');
  if (i12 < 0) console.log('· cat-GE-12 no está en el pack');
  else if (rules[i12].label === GE12.label) console.log('✓ cat-GE-12 ya renombrada');
  else { console.log(`→ cat-GE-12: «${rules[i12].label}» → «${GE12.label}» (código 488 = temperatura de admisión)`); rules[i12] = { ...rules[i12], ...GE12 }; cambios++; }
  for (const n of NUEVAS) {
    if (rules.some((r) => r.ruleId === n.ruleId)) { console.log(`✓ ${n.ruleId} ya existe`); continue; }
    const { sourceNote, ...rule } = n;
    console.log(`→ nueva ${n.ruleId} «${n.label}» (${n.severity}, fault_code = ${n.condition.value}) — ${sourceNote}`);
    rules.push(rule); cambios++;
  }
  if (APPLY && cambios) {
    const body = { rulepack: { packId: pack.packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${pack.packId}`, body);
    console.log(`PUT pack → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  console.log(`\n── ${cambios} cambio(s) ${APPLY ? 'aplicados: el edge recarga solo' : '(simulación; usar --apply)'} ──`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
