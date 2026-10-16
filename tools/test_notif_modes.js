'use strict';
// G2 (DEC-REF-147) — test permanente: cada `mode` que emite el código del edge tiene que
// pasar la validación de los DOS schemas reales de `notifications` (el inline del edge y el
// de la app), y los dos enums tienen que ser iguales. Es el test que habría frenado el bug
// de G1b (resolve-by-service rechazado por Mongo → alarma huérfana).
//
// Correr en el contenedor wanomi-edge (tiene edge-engine/ y app/ montados):
//   docker exec -i -w /home/edge/edge-engine wanomi-edge node - < tools/test_notif_modes.js
const fs = require('fs');
const path = require('path');
const APP  = process.env.APP_DIR  || '/home/edge/app';
const EDGE = process.env.EDGE_DIR || '/home/edge/edge-engine';
require(APP + '/node_modules/@babel/register')({
  presets: [[APP + '/node_modules/@babel/preset-env', { targets: { node: 'current' } }]],
  only: [(f) => f.startsWith(APP + '/api')], cwd: APP,
});
const Notification = require(APP + '/api/models/notifications.js').default;
const { NotificationRO } = require(EDGE + '/notificationRouter.js');

// 1 · Modos que emite el edge: literales `mode: '…'` y 'resolve-by-…'.
function sources(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f === 'node_modules' || f.startsWith('.')) continue;
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...sources(p));
    else if (f.endsWith('.js') && !/test/i.test(f)) out.push(p);
  }
  return out;
}
const emitted = new Map();   // mode → archivo donde aparece
const RX = [/\bmode\s*:\s*'([A-Za-z-]+)'/g, /'(resolve-by-[a-z-]+)'/g];
for (const f of sources(EDGE)) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const rx of RX) for (const m of txt.matchAll(rx)) if (!emitted.has(m[1])) emitted.set(m[1], path.relative(EDGE, f));
}

let ok = 0, fail = 0;
const t = (c, msg) => { c ? ok++ : fail++; console.log((c ? '✓ ' : '✗ ') + msg); };
const base = { userId: 'u', dId: 'D', deviceName: 'D', topic: 't', value: 1, variable: 'v', ruleId: 'r', siteId: 'S', severity: 'warning' };

// 2 · Cada modo emitido valida en los dos schemas.
for (const [mode, file] of [...emitted].sort()) {
  const eApp  = new Notification({ ...base, mode }).validateSync();
  const eEdge = new NotificationRO({ ...base, mode }).validateSync();
  t(!eApp && !eEdge, `${mode.padEnd(32)} (${file})${eApp ? ' · rechazado por app' : ''}${eEdge ? ' · rechazado por edge' : ''}`);
}

// 3 · Paridad de enums (están duplicados: app/api/models/notifications.js y notificationRouter.js).
const enumOf = (M, p) => [...(M.schema.path(p).enumValues || [])].sort().join(',');
for (const p of ['mode', 'kind', 'severity']) {
  t(enumOf(Notification, p) === enumOf(NotificationRO, p), `enum ${p} igual en app y edge`);
}

console.log(`\n${fail ? 'ROJO ✗' : 'VERDE ✓'} ${ok}/${ok + fail} · modos emitidos por el edge: ${emitted.size}`);
process.exit(fail ? 1 : 0);
