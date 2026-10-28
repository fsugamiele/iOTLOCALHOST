// Franco 2026-10-25 — que TODAS las reglas tengan sus cuatro textos:
//   · eventClass      «Para la confiabilidad, este aviso indica» (Qs7)
//   · recommendation  «Qué tiene que hacer el operador»
//   · meaning         «Qué significa esta alarma»
//   · steps           «Pasos a seguir» (uno por renglón, máx. 12)
//
// Dos modos:
//   docker exec -i node node - < tools/textos_reglas.js > reglas_textos.json
//        → VOLCADO (solo lectura): cada regla con su condición (umbrales de ficha resueltos), espera,
//          equipo y los cuatro textos actuales, y al final cuántas tienen cada texto vacío.
//   docker exec -i node node - --apply < tools/textos_reglas.js
//        → APLICA app/api/data/rule_textos.json (ruleId → {recommendation, meaning, steps, eventClass}).
//          Por defecto solo completa lo que está VACÍO; con --sobrescribir reemplaza también lo cargado.
//          Va por la API (PUT /api/rulepacks/:packId). Los textos no cambian la regla para el motor
//          (no cierran alarmas abiertas: DISPLAY_ONLY en edge-engine/reloadState.js).
const http = require('http');
const fs = require('fs');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const e = process.env;
const APPLY = process.argv.includes('--apply');
const SOBRE = process.argv.includes('--sobrescribir');
const SIM = process.argv.includes('--simular');   // con --apply: muestra antes → después y NO escribe
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});
const vacio = (v) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');

// Condición en texto compacto (con el número resuelto de la ficha si lo hay).
function cond(n) {
  if (!n) return '';
  if (n.op === 'AND' || n.op === 'OR') return '(' + (n.children || []).map(cond).join(` ${n.op} `) + ')';
  const c = n.condition || {};
  const val = c.value != null ? JSON.stringify(c.value) : c.limitRef ? `[ficha:${c.limitRef}]` : c.ref ? `[${c.ref.variable}×${c.ref.scale}]` : '?';
  const m = n.metric ? `${n.metric}(${n.variable}${n.mWindow && n.mWindow.durationSec ? `, ${n.mWindow.durationSec}s` : ''})` : n.variable;
  return `${n.deviceType ? n.deviceType + '.' : ''}${m} ${c.op || ''} ${val}${c.deadband ? ` ±${c.deadband}` : ''}`;
}

(async () => {
  const packs = ((await req('GET', '/api/rulepacks')).json || {}).data || [];
  if (!APPLY) {
    const out = []; const faltan = { eventClass: 0, recommendation: 0, meaning: 0, steps: 0 };
    for (const p of packs) for (const r of (p.rules || [])) {
      for (const k of Object.keys(faltan)) if (vacio(r[k])) faltan[k]++;
      out.push({
        ruleId: r.ruleId, packId: p.packId, label: r.label, type: r.type, severity: r.severity, enabled: r.enabled !== false,
        deviceType: r.deviceType, condicion: r.type === 'cross' ? cond(r.crossExpr) : cond({ ...r, deviceType: r.deviceType }),
        metric: r.metric || undefined, window: r.window || undefined, mParams: r.mParams || undefined,
        graceSec: r.graceSec || 0, resolveGraceSec: r.resolveGraceSec || 0, reset: r.reset_behavior || 'auto',
        eventClass: r.eventClass || null, failDeviceType: r.failDeviceType || undefined,
        recommendation: r.recommendation || '', meaning: r.meaning || '', steps: r.steps || [],
      });
    }
    console.log(JSON.stringify({ reglas: out.length, faltan, detalle: out }, null, 1));
    process.exit(0);
  }
  // Vive en app/ porque es lo único montado en el contenedor node (junto con el simulador).
  const src = '/home/node/app/api/data/rule_textos.json';
  let textos;
  try { textos = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (err) { console.error(`No pude leer ${src}: ${err.message}`); process.exit(1); }
  let n = 0;
  for (const p of packs) {
    const rules = (p.rules || []).map((x) => JSON.parse(JSON.stringify(x)));
    let cambios = 0;
    for (const r of rules) {
      const t = textos[r.ruleId]; if (!t) continue;
      for (const k of ['eventClass', 'recommendation', 'meaning', 'steps']) {
        if (t[k] == null || (!SOBRE && !vacio(r[k]))) continue;
        const nuevo = k === 'steps' ? t.steps.slice(0, 12) : t[k];
        if (JSON.stringify(r[k]) === JSON.stringify(nuevo)) continue;
        if (SIM) {
          const ver = (x) => (Array.isArray(x) ? x.join(' / ') : String(x || '—'));
          console.log(`[${p.packId}] ${r.ruleId} · ${k}\n    antes:   ${ver(r[k]).slice(0, 220)}\n    después: ${ver(nuevo).slice(0, 220)}`);
        }
        r[k] = nuevo;
        cambios++;
      }
    }
    if (!cambios) continue;
    if (SIM) { n += cambios; continue; }
    const body = { rulepack: { packId: p.packId, deviceType: p.deviceType, version: (p.version || 1) + 1, description: p.description || '', canary: !!p.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${p.packId}`, body);
    console.log(`PUT ${p.packId} (${cambios} texto/s) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    n += cambios;
  }
  console.log(`${n} texto(s) ${SIM ? 'a cargar (SIMULACIÓN: no se escribió nada)' : 'cargado(s)'}${SOBRE ? ' (con --sobrescribir)' : ' (solo los vacíos)'}.`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
