// spec_textos_alarma_ficha · T2 (firmado 2026-10-27) — carga en las FICHAS los textos de la
// alarma por límite (Qt1), tomados de la biblioteca de fallas (docsRefactor/_biblioteca_campo/fallas/).
//
//   docker exec -i node node - < tools/textos_fichas.js
//        → SIMULACIÓN (no escribe): por ficha y límite, qué textos se cargarían y qué reglas los heredan.
//   docker exec -i node node - --apply < tools/textos_fichas.js
//        → APLICA app/api/data/ficha_textos.json por la API (PUT /api/equipmentsheet/:deviceType).
//          Por defecto solo completa campos VACÍOS del límite; con --sobrescribir reemplaza también lo cargado.
//
// Clave del JSON: deviceType → variable → 'kind|dir' (dir = lt | gt, como el límite de la ficha).
// Los textos no cambian la regla para el motor (DISPLAY_ONLY): no cierran alarmas abiertas.
const http = require('http');
const fs = require('fs');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const jwt = require(NM + 'jsonwebtoken');
const e = process.env;
const APPLY = process.argv.includes('--apply');
const SOBRE = process.argv.includes('--sobrescribir');
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
const dirOf = (op) => (op === 'lt' || op === 'lte' ? 'lt' : op === 'gt' || op === 'gte' ? 'gt' : op);
const CAMPOS = ['meaning', 'operatorAction', 'steps', 'causes', 'source'];

(async () => {
  const src = '/home/node/app/api/data/ficha_textos.json';
  let textos;
  try { textos = JSON.parse(fs.readFileSync(src, 'utf8')); } catch (err) { console.error(`No pude leer ${src}: ${err.message}`); process.exit(1); }
  const sheets = ((await req('GET', '/api/equipmentsheet')).json || {}).data || [];
  const packs = ((await req('GET', '/api/rulepacks')).json || {}).data || [];
  // Reglas que heredarían cada límite (condición D con limitRef u hoja de combinada con limitRef).
  const usuarios = new Map();
  const anotar = (dt, v, kind, op, r) => { const k = `${dt}|${v}|${kind}|${dirOf(op)}`; if (!usuarios.has(k)) usuarios.set(k, new Set()); usuarios.get(k).add(r.ruleId); };
  // Mismo criterio que la herencia real (api/services/limitRef.js · mainLimitRef).
  const { mainLimitRef } = require('/home/node/app/api/services/limitRef.js');
  for (const p of packs) for (const r of (p.rules || [])) {
    const ref = mainLimitRef({ ...r, deviceType: r.deviceType || p.deviceType });
    if (ref) anotar(ref.deviceType, ref.variable, ref.kind, ref.op, r);
  }

  let nCampos = 0, nSinTexto = 0;
  const sinEntrada = [];
  for (const sh of sheets) {
    const porVar = textos[sh.deviceType];
    let cambios = 0;
    const variables = (sh.variables || []).map((v) => {
      const limits = (v.limits || []).map((l) => {
        const t = porVar && porVar[v.name] && porVar[v.name][`${l.kind}|${dirOf(l.op)}`];
        const quien = [...(usuarios.get(`${sh.deviceType}|${v.name}|${l.kind}|${dirOf(l.op)}`) || [])];
        if (!t) { sinEntrada.push(`${sh.deviceType}.${v.name} ${l.kind} ${l.op} ${l.value}${quien.length ? ` (lo usan: ${quien.join(', ')})` : ''}`); return l; }
        const prev = l.texts || {};
        const next = { ...prev };
        const llenados = [];
        for (const k of CAMPOS) {
          if (t[k] == null || (!SOBRE && !vacio(prev[k]))) continue;
          if (JSON.stringify(prev[k]) === JSON.stringify(t[k])) continue;
          next[k] = k === 'steps' ? t[k].slice(0, 12) : t[k]; llenados.push(k);
        }
        if (!llenados.length) return l;
        cambios += llenados.length; nCampos += llenados.length;
        console.log(`${sh.deviceType}.${v.name} ${l.kind} ${l.op} ${l.value} → ${llenados.join(', ')}${quien.length ? `  · heredan: ${quien.join(', ')}` : '  · (ninguna regla usa este límite todavía)'}`);
        if (!APPLY) console.log(`   «${String(next.meaning || '').slice(0, 110)}»`);
        return { ...l, texts: next };
      });
      return { ...v, limits };
    });
    if (!cambios) continue;
    if (APPLY) {
      const put = await req('PUT', `/api/equipmentsheet/${encodeURIComponent(sh.deviceType)}`, { newEquipmentSheet: { variables } });
      console.log(`PUT ficha ${sh.deviceType} (${cambios} campo/s) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
    }
  }
  if (sinEntrada.length) {
    console.log(`\nLímites sin textos en ${src.split('/').pop()} (${sinEntrada.length}):`);
    sinEntrada.forEach((x) => console.log('  - ' + x)); nSinTexto = sinEntrada.length;
  }
  console.log(`\n${nCampos} campo(s) ${APPLY ? 'cargado(s)' : 'a cargar (simulación: correr con --apply para escribir)'}${SOBRE ? ' con --sobrescribir' : ' (solo los vacíos)'} · ${nSinTexto} límite(s) sin texto.`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
