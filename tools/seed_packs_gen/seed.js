#!/usr/bin/env node
'use strict';
// Seed del pack "Grupo (GEN)" día-1 — diseño firmado `docsRefactor/Software/diseno_packs_alarmas.md`.
//
// deviceType GEN (ficha Wanomi WN-SITE-GEN / Sense). Reglas D de día-1 sobre
// variables reales de la ficha: fuel_level, autonomy_hours, battery_voltage.
// Umbrales: registros_consolidado_gef.md §4 (combustible <25/<10; batería
// <22/<20). Autonomía <6/<3 h = propuesta operativa del diseño (F5).
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

if (!JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (env).'); process.exit(1); }

const TOKEN = jwt.sign({ userData: { _id: ADMIN_ID, email: 'admin@wanomi.com' } }, JWT_SECRET, { expiresIn: '10m' });

const base = (id, label, variableLabel, unit, inferenceId, severity, recommendation, variable, condition) => ({
  ruleId: id, label, variableLabel, unit, inferenceId,
  type: 'D', severity, recommendation, correlationParent: null,
  cooldownSec: 300, deviceType: 'GEN', variable, condition,
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
      'fuel_level', { op: 'lt', value: 25 }),
    base('gen-fuel-crit', 'Combustible crítico', 'Nivel de combustible', '%', 'GF2', 'critical',
      'Combustible crítico (<10%). Riesgo de sitio caído por tanque vacío. Despachar recarga urgente.',
      'fuel_level', { op: 'lt', value: 10 }),
    base('gen-autonomy-warn', 'Autonomía baja', 'Autonomía estimada', 'h', 'GA1', 'warning',
      'Autonomía estimada por debajo de 6 h. Despachar recarga de combustible antes del agotamiento.',
      'autonomy_hours', { op: 'lt', value: 6 }),
    base('gen-autonomy-crit', 'Autonomía crítica', 'Autonomía estimada', 'h', 'GA2', 'critical',
      'Autonomía crítica (<3 h). El sitio corre riesgo de quedarse sin energía. Recarga urgente.',
      'autonomy_hours', { op: 'lt', value: 3 }),
    base('gen-batt-warn', 'Batería de arranque baja', 'Tensión de batería', 'V', 'GB1', 'warning',
      'Batería de arranque baja (<22 V). Verificar cargador y estado de batería; el grupo puede no arrancar en el próximo corte.',
      'battery_voltage', { op: 'lt', value: 22 }),
    base('gen-batt-crit', 'Batería de arranque crítica', 'Tensión de batería', 'V', 'GB2', 'critical',
      'Batería de arranque crítica (<20 V). Reemplazar batería; alto riesgo de fallo de arranque.',
      'battery_voltage', { op: 'lt', value: 20 }),
  ],
};

function req(method, path, bodyObj) {
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

(async () => {
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
