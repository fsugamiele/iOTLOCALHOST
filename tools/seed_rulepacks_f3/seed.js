#!/usr/bin/env node
'use strict';
// Loader HTTP de la siembra F3 (DEC-REF-87).
//
// Uso desde el contenedor `node`:
//   docker exec node node /home/node/app/../tools/seed_rulepacks_f3/seed.js [--dry-run]
//
// O directo en el host si Node y las libs están instaladas fuera:
//   node tools/seed_rulepacks_f3/seed.js [--dry-run]
//
// Autenticación: JWT firmado con JWT_SECRET (mismo que la app), identidad
// admin@wanomi.com (superadmin). RulePack no tiene campo de tenancy y el
// gate es RBAC puro (DEC-REF-87 iv), no se suplanta ninguna cuenta.

const http = require('http');
const jwt  = require('jsonwebtoken');

const M = require('./manifest.js');

const API_HOST     = process.env.API_HOST     || 'localhost';
const API_PORT     = parseInt(process.env.API_PORT || '3001', 10);
const JWT_SECRET   = process.env.JWT_SECRET;
const ADMIN_ID     = process.env.ADMIN_ID     || '6a32e105be5ca779169754af';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL  || 'admin@wanomi.com';
const CUMMINS_PACK = 'cummins-pcc-v1';

const DRY_RUN = process.argv.includes('--dry-run');

if (!JWT_SECRET) {
  console.error('ERROR: falta JWT_SECRET (env). En el contenedor node ya está.');
  process.exit(1);
}

const TOKEN = jwt.sign(
  { userData: { _id: ADMIN_ID, email: ADMIN_EMAIL } },
  JWT_SECRET,
  { expiresIn: '10m' }
);

function req(method, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const body = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const opts = {
      host: API_HOST, port: API_PORT, method, path,
      headers: { 'token': TOKEN, 'Content-Type': 'application/json' },
    };
    if (body) opts.headers['Content-Length'] = body.length;
    const r = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null; try { json = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, json, raw });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// Combina las 5 reglas productivas del pack cummins-pcc-v1 con las 2 nuevas
// del manifiesto. Preserva version + description + canary del pack existente
// (evita bump accidental de version, aumenta 1 explícito).
async function buildCumminsPack() {
  const g = await req('GET', `/api/rulepacks/${CUMMINS_PACK}`);
  if (g.status !== 200 || !g.json || !g.json.data) {
    throw new Error(`GET ${CUMMINS_PACK} falló · status=${g.status} · body=${g.raw.slice(0,200)}`);
  }
  const cur = g.json.data;
  const existingIds = new Set((cur.rules || []).map(r => r.ruleId));
  const collision   = M.CUMMINS_PCC_V1_APPEND.find(r => existingIds.has(r.ruleId));
  if (collision) {
    throw new Error(`colisión ruleId '${collision.ruleId}' — ya existe en cummins-pcc-v1`);
  }
  // Preservamos las 5 productivas literales + agregamos las 2 nuevas.
  // NOTA sobre el shape que devuelve GET: los subdocumentos vienen con
  // defaults del schema aplicados (setpointSource:{scale:1}, window:{...:null},
  // etc.). Los reenviamos tal cual — el PUT es upsert full y el validador
  // acepta esos defaults.
  return {
    packId:      cur.packId,
    deviceType:  cur.deviceType,
    version:     (cur.version || 1) + 1,   // bump explícito
    description: cur.description || '',
    canary:      cur.canary || false,
    rules:       [...cur.rules, ...M.CUMMINS_PCC_V1_APPEND],
  };
}

async function putPack(pack) {
  const path = `/api/rulepacks/${pack.packId}`;
  if (DRY_RUN) {
    console.log(`\n=== DRY-RUN · PUT ${path} ===`);
    console.log(JSON.stringify({ rulepack: pack }, null, 2));
    return { status: 200, dryRun: true, rules: pack.rules.length };
  }
  const r = await req('PUT', path, { rulepack: pack });
  return r;
}

(async () => {
  try {
    const cumminsPack = await buildCumminsPack();
    const targets = [M.ATS_INTELIATS_V1, M.ELTEK_SMARTPACK_V1, cumminsPack];

    const summary = [];
    for (const p of targets) {
      const res = await putPack(p);
      if (res.dryRun) {
        summary.push({ packId: p.packId, rules: res.rules, status: 'DRY-RUN' });
      } else if (res.status === 200 && res.json && res.json.status === 'success') {
        summary.push({
          packId:  p.packId,
          version: res.json.version,
          rules:   res.json.rules,
          warnings: (res.json.warnings || []).length,
        });
        if (res.json.warnings && res.json.warnings.length) {
          console.warn(`[warn ${p.packId}]`, res.json.warnings.join(' · '));
        }
      } else {
        console.error(`[fail ${p.packId}] status=${res.status} body=${res.raw.slice(0,300)}`);
        process.exit(2);
      }
    }
    console.log(DRY_RUN ? '=== DRY-RUN SUMMARY ===' : '=== SIEMBRA APLICADA ===');
    for (const s of summary) console.log(JSON.stringify(s));
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message || e);
    process.exit(1);
  }
})();
