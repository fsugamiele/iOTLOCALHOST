'use strict';
// sync_auditoria_p0 — lleva una base EXISTENTE (producción) a los valores decididos
// en la auditoría 2026-10-14, por la API (path productivo + validación, DEC-PROC-5).
// Fuente única de los valores: tools/seed_fichas/fichas.js (fichas),
// seeds/cummins_pcc_v1.js, tools/seed_packs_gen/seed.js y
// tools/seed_rulepacks_f3/manifest.js (reglas). Este script NO define umbrales
// propios: solo copia de esas fuentes. Es la cascada Ficha → Template → Regla
// aplicada una vez, a mano, hasta que exista la cascada automática
// (docsRefactor/Software/spec_cascada_ficha.md).
//
// Idempotente. Por defecto DRY-RUN (muestra el diff y no escribe).
//
// Uso (desde la raíz del repo, con la API corriendo):
//   NODE_PATH=app/node_modules ADMIN_ID=<_id superadmin> node tools/sync_auditoria_p0/sync.js            # dry-run
//   NODE_PATH=app/node_modules ADMIN_ID=<_id superadmin> node tools/sync_auditoria_p0/sync.js --apply    # escribe
//   API_HOST/API_PORT overridean el destino (default localhost:3001). JWT_SECRET: env o app/.env.
//
// Qué hace:
//   1. FICHAS   — GET + merge por variable (la canónica gana en label/type/unit/
//                 deadband/factoryRange/limits; variables extra de la base se conservan;
//                 autonomy: lo de la base gana — tanque/consumo pueden estar afinados —
//                 y la canónica completa lo que falte) → PUT. Si no existe → POST.
//   2. PACKS    — por ruleId: en reglas existentes lleva SOLO los campos del umbral
//                 (condition/crossExpr/unit/label/recommendation) y conserva tiempos,
//                 severidad y enabled de la base; distinto tipo = conflicto, no se toca;
//                 agrega las que falten (GA1/GA2). Reglas de la base que no están en el seed
//                 (cat-GE-*, DC-0x, …) NO se tocan → PUT.
//   3. TEMPLATES— para cada widget cuya variable está en la ficha del deviceType:
//                 unit, factoryRange, deadband y thresholds derivados de limits
//                 (lt warning→warningLow, lt trip→criticalLow, gt warning→warningHigh,
//                 gt trip→criticalHigh). También `sources[].unit` de widgets multi-fuente.

const fs = require('fs');
const http = require('http');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const ADMIN_ID = process.env.ADMIN_ID || '6a32e105be5ca779169754af';   // dev: admin@wanomi.com

const { FICHAS } = require(path.join(REPO, 'tools/seed_fichas/fichas.js'));
const { pack: CUMMINS } = require(path.join(REPO, 'seeds/cummins_pcc_v1.js'));
const { GEN_GRUPO_V1 } = require(path.join(REPO, 'tools/seed_packs_gen/seed.js'));
const { ELTEK_SMARTPACK_V1 } = require(path.join(REPO, 'tools/seed_rulepacks_f3/manifest.js'));

// Reglas que esta sincronización lleva a la base (por pack). Solo las tocadas por
// la auditoría — el resto de cada pack queda como está en la base.
const RULE_SYNC = [
  { pack: CUMMINS,      ruleIds: ['cummins-A0-oil-pressure-low', 'cummins-A1-oil-pressure', 'cummins-G2-fuel-critical', 'cummins-GA1-autonomy-warn', 'cummins-GA2-autonomy-crit'] },
  { pack: GEN_GRUPO_V1, ruleIds: ['gen-fuel-warn', 'gen-fuel-crit', 'gen-autonomy-warn', 'gen-autonomy-crit', 'gen-batt-warn', 'gen-batt-crit'] },
  { pack: ELTEK_SMARTPACK_V1, ruleIds: ['cat-eltek-A1', 'cat-eltek-A2'] },
];

function jwtToken() {
  const jwt = require('jsonwebtoken');
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    const env = fs.readFileSync(path.join(REPO, 'app/.env'), 'utf8');
    const m = env.match(/^JWT_SECRET=(.*)$/m);
    if (!m) throw new Error('JWT_SECRET no encontrado (env ni app/.env)');
    secret = m[1].trim().replace(/^["']|["']$/g, '');
  }
  return jwt.sign({ userData: { _id: ADMIN_ID, email: 'admin@wanomi.com' } }, secret, { expiresIn: '15m' });
}

let TOKEN;
function call(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { token: TOKEN };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = http.request({ host: API_HOST, port: API_PORT, path: '/api' + p, method, headers }, (res) => {
      let d = ''; res.on('data', (c) => d += c);
      res.on('end', () => { let json = null; try { json = JSON.parse(d); } catch (_) {} resolve({ code: res.statusCode, json, raw: d }); });
    });
    req.on('error', (e) => resolve({ code: 'ERR', json: null, raw: e.message }));
    if (data) req.write(data); req.end();
  });
}

const j = (o) => JSON.stringify(o);
const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === '_id' || k === '__v' ? undefined : v)));
let changes = 0, failures = 0, conflicts = 0;
function report(scope, what, before, after) {
  if (j(before) === j(after)) return false;
  changes++;
  console.log(`  ~ ${scope} ${what}\n      antes:   ${j(before)}\n      después: ${j(after)}`);
  return true;
}

// ── 1. FICHAS ────────────────────────────────────────────────────────────
async function syncFichas() {
  console.log('\n== 1. Fichas de equipo ==');
  for (const canon of FICHAS) {
    const r = await call('GET', `/equipmentsheet/${encodeURIComponent(canon.deviceType)}`);
    if (r.code === 404) {
      changes++;
      console.log(`  + ${canon.deviceType}: no existe → POST`);
      if (APPLY) { const w = await call('POST', '/equipmentsheet', { newEquipmentSheet: canon }); log(w, `POST ${canon.deviceType}`); }
      continue;
    }
    if (r.code !== 200) { failures++; console.log(`  ! GET ${canon.deviceType} → ${r.code} ${r.raw.slice(0, 200)}`); continue; }
    const cur = clean(r.json.data);
    const curVars = cur.variables || [];
    let touched = false;
    const merged = curVars.map((v) => {
      const c = canon.variables.find((x) => x.name === v.name);
      if (!c) return v;
      const next = { ...v, ...c };
      if (report(canon.deviceType, `variable ${v.name}`, pick(v), pick(next))) touched = true;
      return next;
    });
    for (const c of canon.variables) {
      if (!curVars.some((v) => v.name === c.name)) { merged.push(c); touched = true; changes++; console.log(`  + ${canon.deviceType} variable ${c.name} (nueva)`); }
    }
    const upd = { variables: merged };
    if (canon.autonomy) {
      const a = { ...canon.autonomy, ...(cur.autonomy || {}) };       // la base gana; canónica completa
      if (report(canon.deviceType, 'autonomy', cur.autonomy || null, a)) touched = true;
      upd.autonomy = a;
    }
    if (touched && APPLY) {
      const w = await call('PUT', `/equipmentsheet/${encodeURIComponent(canon.deviceType)}`, { newEquipmentSheet: upd });
      log(w, `PUT ficha ${canon.deviceType}`);
    }
  }
}
const pick = (v) => ({ label: v.label, type: v.type, unit: v.unit, deadband: v.deadband, factoryRange: v.factoryRange, limits: v.limits });

// ── 2. PACKS ─────────────────────────────────────────────────────────────
async function syncPacks() {
  console.log('\n== 2. Packs de reglas ==');
  for (const { pack, ruleIds } of RULE_SYNC) {
    const r = await call('GET', `/rulepacks/${encodeURIComponent(pack.packId)}`);
    if (r.code === 404) { console.log(`  · ${pack.packId}: no existe en la base — se omite (sembrarlo con su seed)`); continue; }
    if (r.code !== 200) { failures++; console.log(`  ! GET ${pack.packId} → ${r.code} ${r.raw.slice(0, 200)}`); continue; }
    const cur = clean(r.json.data);
    const rules = [...(cur.rules || [])];
    let touched = false;
    for (const id of ruleIds) {
      const want = pack.rules.find((x) => x.ruleId === id);
      if (!want) { failures++; console.log(`  ! ${id}: no está en el seed de ${pack.packId}`); continue; }
      const i = rules.findIndex((x) => x.ruleId === id);
      if (i === -1) { rules.push(want); touched = true; changes++; console.log(`  + ${pack.packId} regla ${id} (nueva)`); continue; }
      // Distinto tipo en la base y en el seed = rediseño deliberado en una de las dos
      // puntas: NO se mezcla (saldría una regla híbrida). Se informa y no se toca.
      if (rules[i].type !== want.type) {
        conflicts++;
        console.log(`  ⚠ ${pack.packId} regla ${id}: tipo '${rules[i].type}' en la base vs '${want.type}' en el seed — NO se toca (revisar a mano)`);
        continue;
      }
      // Regla existente: SOLO se llevan los campos que cargan el umbral. Tiempos
      // (graceSec, cooldownSec, resolveGraceSec), severidad, enabled y todo lo demás
      // ajustado en la base se conservan.
      const next = { ...rules[i] };
      for (const k of THRESHOLD_FIELDS) if (k in want) next[k] = want[k];
      if (report(pack.packId, `regla ${id}`, sub(rules[i]), sub(next))) { rules[i] = next; touched = true; }
    }
    if (touched && APPLY) {
      const body = { ...cur, rules };
      const w = await call('PUT', `/rulepacks/${encodeURIComponent(pack.packId)}`, { rulepack: body });
      log(w, `PUT pack ${pack.packId}`);
      if (w.json && Array.isArray(w.json.warnings) && w.json.warnings.length) console.log(`    warnings: ${w.json.warnings.join(' · ')}`);
    }
  }
}
const THRESHOLD_FIELDS = ['label', 'variableLabel', 'unit', 'condition', 'crossExpr', 'recommendation'];
const sub = (x) => ({ label: x.label, unit: x.unit, condition: x.condition, crossExpr: x.crossExpr, recommendation: x.recommendation });

// ── 3. TEMPLATES ─────────────────────────────────────────────────────────
function thresholdsFrom(limits) {
  const t = {};
  for (const l of limits || []) {
    if (typeof l.value !== 'number') continue;
    if (['lt', 'lte'].includes(l.op)) t[l.kind === 'trip' ? 'criticalLow' : 'warningLow'] = l.value;
    if (['gt', 'gte'].includes(l.op)) t[l.kind === 'trip' ? 'criticalHigh' : 'warningHigh'] = l.value;
  }
  return t;
}
async function syncTemplates() {
  console.log('\n== 3. Templates (widgets) ==');
  const r = await call('GET', '/template');
  if (r.code !== 200) { failures++; console.log(`  ! GET /template → ${r.code}`); return; }
  for (const tpl of r.json.data || []) {
    const canon = FICHAS.find((f) => f.deviceType === tpl.deviceType);
    if (!canon) continue;
    const byName = new Map(canon.variables.map((v) => [v.name, v]));
    let touched = false;
    const widgets = (tpl.widgets || []).map((w0) => {
      const w = clean(w0);
      const v = byName.get(w.variable);
      if (v) {
        const before = { unit: w.unit, factoryRange: w.factoryRange, deadband: w.deadband, thresholds: w.thresholds };
        const th = thresholdsFrom(v.limits);
        if (v.unit !== undefined) w.unit = v.unit;
        if (v.factoryRange) w.factoryRange = v.factoryRange;
        if (v.deadband != null) w.deadband = v.deadband;
        if (Object.keys(th).length) w.thresholds = th;
        if (typeof w.variableFullName === 'string') w.variableFullName = w.variableFullName.replace('(psi)', '(kPa)');
        if (report(`template '${tpl.name}'`, `widget ${w.variable}`, before, { unit: w.unit, factoryRange: w.factoryRange, deadband: w.deadband, thresholds: w.thresholds })) touched = true;
      }
      if (Array.isArray(w.sources)) {
        for (const s of w.sources) {
          const sv = byName.get(s.variable);
          if (sv && sv.unit !== undefined && s.unit !== sv.unit) {
            report(`template '${tpl.name}'`, `widget ${w.widget} source ${s.variable} unit`, s.unit, sv.unit);
            s.unit = sv.unit; touched = true;
          }
        }
      }
      return w;
    });
    if (touched && APPLY) {
      const t = clean(tpl);
      const w = await call('PUT', '/template', { templateId: tpl._id, template: { name: t.name, description: t.description, deviceType: t.deviceType, widgets } });
      log(w, `PUT template ${tpl.name}`);
    }
  }
}

function log(w, what) {
  if (w.code === 200 && (!w.json || w.json.status !== 'error')) console.log(`    ✓ ${what}`);
  else { failures++; console.log(`    ✗ ${what} → ${w.code} ${w.raw.slice(0, 300)}`); }
}

(async () => {
  TOKEN = jwtToken();
  console.log(`sync_auditoria_p0 — ${APPLY ? 'APLICANDO' : 'DRY-RUN (sin escribir; usar --apply)'} → ${API_HOST}:${API_PORT}`);
  await syncFichas();
  await syncPacks();
  await syncTemplates();
  console.log(`\n${changes} cambio(s) ${APPLY ? 'enviados' : 'detectados'} · ${failures} error(es) · ${conflicts} conflicto(s) de tipo`);
  process.exit(failures ? 2 : 0);
})().catch((e) => { console.error('ERROR:', e.message || e); process.exit(1); });
