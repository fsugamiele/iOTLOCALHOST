#!/usr/bin/env node
'use strict';
// Seed del pack "Grupo (GEN)" día-1 — diseño firmado `docsRefactor/Software/diseno_packs_alarmas.md`.
//
// deviceType GEN (ficha Wanomi WN-SITE-GEN / Sense). Reglas D de día-1 sobre
// variables reales de la ficha: fuel_level, autonomy_hours, battery_voltage.
// Umbrales: registros_consolidado_gef.md §4 (combustible <25/<10; batería
// <11,8/<11 — batería 12V de grupo electrógeno). Autonomía <6/<3 h = propuesta operativa del diseño (F5).
//
// Uso (contenedor node):
//   docker exec node sh -c 'cd /home/node/app && node -r dotenv/config _seed_gen/seed.js dotenv_config_path=/home/node/app/.env [--dry-run]'
//
// Autenticación: JWT firmado con JWT_SECRET (superadmin admin@wanomi.com),
// mismo patrón que seed_rulepacks_f3 (DEC-REF-87). RulePack sin tenancy; gate RBAC.

const http = require('http');
const jwt  = require('jsonwebtoken');

const API_HOST   = process.env.API_HOST || 'localhost';
const API_PORT   = parseInt(process.env.API_PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_ID   = process.env.ADMIN_ID || '6a32e105be5ca779169754af';
const DRY_RUN    = process.argv.includes('--dry-run');

// Auditoría 2026-10-14 — token y chequeo de env solo al ejecutar (el módulo se
// importa desde tools/sync_auditoria_p0/sync.js como fuente única de las reglas).
let TOKEN = null;

const base = (id, label, variableLabel, unit, inferenceId, severity, recommendation, variable, condition) => ({
  ruleId: id, label, variableLabel, unit, inferenceId,
  type: 'D', severity, recommendation, correlationParent: null,
  cooldownSec: 300, deviceType: 'GEN', variable, condition,
  fallbackToD: true, on_missing_ref: 'ignore', reset_behavior: 'auto',
});

const autonomyCross = (id, label, inferenceId, severity, limitRef, recommendation) => ({
  ruleId: id, label, variableLabel: 'Autonomía estimada', unit: 'h', inferenceId,
  type: 'cross', severity, recommendation, correlationParent: null,
  cooldownSec: 900, graceSec: 60, resolveGraceSec: 0,
  deviceType: 'GEN', variable: 'autonomy_hours', condition: null,
  crossExpr: { op: 'AND', children: [
    { deviceType: 'GEN', variable: 'genset_running', condition: { op: 'eq', value: 1 } },
    { deviceType: 'GEN', variable: 'autonomy_hours', condition: { op: 'lt', limitRef } },   // umbral de la FICHA (48/12 h)
  ] },
  fallbackToD: true, on_missing_ref: 'ignore', reset_behavior: 'auto',
});

const GEN_GRUPO_V1 = {
  packId: 'gen-grupo-v1',
  deviceType: 'GEN',
  version: 1,
  description: 'Salud del grupo (combustible, autonomía, batería de arranque) — diseño packs día-1',
  canary: false,
  rules: [
    base('gen-fuel-warn', 'Combustible bajo', 'Nivel de combustible', '%', 'GF1', 'warning',
      'Nivel de combustible por debajo de 25%. Coordinar recarga con el proveedor antes de que baje la autonomía.',
      'fuel_level', { op: 'lt', limitRef: 'warning', deadband: 2 }),   // umbral de la FICHA (cascada C2)
    base('gen-fuel-crit', 'Combustible crítico', 'Nivel de combustible', '%', 'GF2', 'critical',
      'Combustible crítico (<15%). Riesgo de sitio caído por tanque vacío. Despachar recarga urgente.',
      'fuel_level', { op: 'lt', limitRef: 'trip', deadband: 2 }),      // ficha: 15 % — decisión Franco 2026-10-14
    // Autonomía: 48/12 h (decisión Franco 2026-10-14) SOLO con el grupo EN MARCHA
    // (cross AND genset_running) — diseño vigente en producción. Sin la condición de
    // marcha, con 48 h de umbral y ~72 h de tanque lleno, avisaría con el grupo parado
    // apenas el tanque baja del 66 %.
    autonomyCross('gen-autonomy-warn', 'Autonomía baja', 'GA1', 'warning', 'warning',
      'Autonomía estimada por debajo de 48 h con el grupo en marcha. Programar recarga de combustible.'),
    autonomyCross('gen-autonomy-crit', 'Autonomía crítica', 'GA2', 'critical', 'trip',
      'Acción: despachar recarga de combustible ya: autonomía menor a 12 h con el grupo en marcha.'),
    base('gen-batt-warn', 'Batería de arranque baja', 'Tensión de batería', 'V', 'GB1', 'warning',
      'Batería de arranque baja (<11,8 V, sistema 12V). Verificar cargador y estado de batería; el grupo puede no arrancar en el próximo corte.',
      'battery_voltage', { op: 'lt', limitRef: 'warning', deadband: 0.4 }),
    base('gen-batt-crit', 'Batería de arranque crítica', 'Tensión de batería', 'V', 'GB2', 'critical',
      'Batería de arranque crítica (<11 V, sistema 12V). Reemplazar batería; alto riesgo de fallo de arranque.',
      'battery_voltage', { op: 'lt', limitRef: 'trip', deadband: 0.4 }),
  ],
};

function req(method, path, bodyObj) {
  if (!TOKEN) TOKEN = jwt.sign({ userData: { _id: ADMIN_ID, email: 'admin@wanomi.com' } }, JWT_SECRET, { expiresIn: '10m' });
  return new Promise((resolve, reject) => {
    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const opts = { host: API_HOST, port: API_PORT, method, path,
      headers: { token: TOKEN, 'Content-Type': 'application/json' } };
    if (body) opts.headers['Content-Length'] = body.length;
    const r = http.request(opts, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw }); });
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}

if (require.main === module) (async () => {
  if (!JWT_SECRET && !DRY_RUN) { console.error('ERROR: falta JWT_SECRET (env).'); process.exit(1); }
  try {
    if (DRY_RUN) { console.log(JSON.stringify({ rulepack: GEN_GRUPO_V1 }, null, 2)); process.exit(0); }
    const r = await req('PUT', `/api/rulepacks/${GEN_GRUPO_V1.packId}`, { rulepack: GEN_GRUPO_V1 });
    if (r.status === 200 && r.json && r.json.status === 'success') {
      console.log('=== SIEMBRA GEN APLICADA ===');
      console.log(JSON.stringify({ packId: r.json.packId, version: r.json.version, rules: r.json.rules, warnings: (r.json.warnings || []).length }));
      if ((r.json.warnings || []).length) console.warn('[warn]', r.json.warnings.join(' · '));
    } else { console.error(`[fail] status=${r.status} body=${r.raw.slice(0, 300)}`); process.exit(2); }
  } catch (e) { console.error('ERROR:', e.message || e); process.exit(1); }
})();

module.exports = { GEN_GRUPO_V1 };
