// spec_supervisor_confiabilidad_v2 (R2) — APLICA los cambios propuestos por la última corrida de
// calidad de reglas (rule_quality_snapshots), solo los SEGUROS:
//   · veredicto "avisa de más" con propuesta (espera y/o histéresis),
//   · 0 fallas reales (> 10 min) perdidas al reproducir 30 días con el cambio,
//   · baja los avisos al menos a la mitad y no los deja en 0 (no silencia la regla),
//   · la condición no "parpadea" (excursiones de 0 s: pendiente de revisar en R3),
//   · la regla no cambió desde la corrida (misma espera / histéresis).
// Primero muestra la lista; con --apply cambia las reglas por la API (PUT /api/rulepacks/:packId),
// igual que el editor. Ojo: editar una regla cierra sus alarmas abiertas (resolve-by-edit).
//   docker exec -i node node - < tools/aplicar_calidad_reglas.js                    → muestra
//   docker exec -i node node - --apply < tools/aplicar_calidad_reglas.js            → aplica
//   docker exec -i node node - --apply --sin cat-TR-03,cat-AR-03 < tools/aplicar_calidad_reglas.js
//   docker exec -i node node - --apply --solo cummins-GA1-autonomy-warn < tools/aplicar_calidad_reglas.js
//   --forzar id1,id2 → aplica aunque la condición «parpadee» (ya diagnosticada con qa/diag/parpadeo.js)
const http = require('http');
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const jwt = require(NM + 'jsonwebtoken');
const e = process.env;
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const lista = (flag) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
const SOLO = lista('--solo'), SIN = lista('--sin') || [], FORZAR = lista('--forzar') || [];
if (!e.JWT_SECRET) { console.error('ERROR: falta JWT_SECRET (correr dentro del contenedor node).'); process.exit(1); }
const TOKEN = jwt.sign({ userData: { _id: e.ADMIN_ID || '6a32e105be5ca779169754af', email: e.ADMIN_EMAIL || 'admin@wanomi.com' } }, e.JWT_SECRET, { expiresIn: '10m' });
const req = (method, path, body) => new Promise((ok, ko) => {
  const b = body ? Buffer.from(JSON.stringify(body)) : null;
  const r = http.request({ host: 'localhost', port: Number(e.API_PORT || 3001), method, path, headers: { token: TOKEN, 'Content-Type': 'application/json', ...(b ? { 'Content-Length': b.length } : {}) } }, (res) => {
    let raw = ''; res.on('data', (c) => { raw += c; }); res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (_) {} ok({ status: res.statusCode, json, raw }); });
  });
  r.on('error', ko); if (b) r.write(b); r.end();
});

function motivoExclusion(r) {
  const p = r.propuesta || {};
  if (r.veredicto !== 'avisa_de_mas') return 'no avisa de más';
  if (!p.graceSec && !p.deadband) return 'sin cambio propuesto (revisar la condición)';
  if (p.despues == null) return 'sin reproducción del cambio';
  if (p.perdidas > 0) return `pierde ${p.perdidas} falla(s) real(es)`;
  if (p.despues === 0) return 'dejaría la regla sin avisos (revisar a mano)';
  if (p.despues > 0.5 * p.antes) return `baja poco (${p.antes} → ${p.despues})`;
  if ((r.excursiones || 0) > 20 * Math.max(1, r.avisos || 0) && !FORZAR.includes(r.ruleId)) return `la condición parpadea (${r.excursiones} excursiones para ${r.avisos} avisos): revisar en R3`;
  return null;
}

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const s = await mongoose.connection.db.collection('rule_quality_snapshots').find({}).sort({ computedAt: -1 }).limit(1).next();
  await mongoose.disconnect();
  if (!s) { console.log('No hay corrida de calidad de reglas.'); process.exit(0); }
  console.log(`Corrida del ${new Date(s.computedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · ${s.days} días\n`);

  const packs = new Map();
  const getPack = async (id) => { if (!packs.has(id)) packs.set(id, ((await req('GET', `/api/rulepacks/${id}`)).json || {}).data || null); return packs.get(id); };
  const aplicar = []; const excluidas = [];
  for (const r of s.reglas.filter((x) => x.veredicto === 'avisa_de_mas')) {
    let motivo = motivoExclusion(r);
    if (!motivo && SOLO && !SOLO.includes(r.ruleId)) motivo = 'fuera de --solo';
    if (!motivo && SIN.includes(r.ruleId)) motivo = 'excluida con --sin';
    const pack = !motivo ? await getPack(r.packId) : null;
    const i = pack ? pack.rules.findIndex((x) => x.ruleId === r.ruleId) : -1;
    if (!motivo && i < 0) motivo = 'la regla ya no está en el pack';
    if (!motivo) {
      const cur = pack.rules[i];
      const dbCur = cur.condition && cur.condition.deadband != null ? Number(cur.condition.deadband) : 0;
      if ((Number(cur.graceSec) || 0) !== (r.graceSec || 0)) motivo = `cambió desde la corrida (espera ${cur.graceSec || 0} s)`;
      else if (r.propuesta.deadband && cur.type !== 'D') motivo = 'histéresis solo en reglas de umbral fijo';
      else if (r.propuesta.deadband && dbCur >= r.propuesta.deadband) r.propuesta.deadband = null;
    }
    if (motivo) { excluidas.push({ r, motivo }); continue; }
    aplicar.push({ r, i });
  }

  console.log(`SE APLICAN (${aplicar.length}):`);
  for (const { r } of aplicar) {
    const p = r.propuesta; const c = [];
    if (p.graceSec) c.push(`espera ${r.graceSec} s → ${p.graceSec} s`);
    if (p.deadband) c.push(`histéresis → ${p.deadband}`);
    console.log(`  ✓ ${r.label} (${r.ruleId}) · ${c.join(' y ')} · ${p.antes} → ${p.despues} avisos en ${s.days} d`);
  }
  console.log(`\nNO SE APLICAN (${excluidas.length}):`);
  for (const { r, motivo } of excluidas) console.log(`  · ${r.label} (${r.ruleId}) — ${motivo}`);
  if (!APPLY) { console.log('\n(simulación; usar --apply. Editar una regla cierra sus alarmas abiertas.)'); process.exit(0); }

  const porPack = new Map();
  for (const a of aplicar) (porPack.get(a.r.packId) || porPack.set(a.r.packId, []).get(a.r.packId)).push(a);
  for (const [packId, list] of porPack) {
    const pack = packs.get(packId);
    const rules = pack.rules.map((x) => JSON.parse(JSON.stringify(x)));
    for (const { r, i } of list) {
      if (r.propuesta.graceSec) rules[i].graceSec = r.propuesta.graceSec;
      if (r.propuesta.deadband) rules[i].condition = { ...(rules[i].condition || {}), deadband: r.propuesta.deadband };
    }
    const body = { rulepack: { packId, deviceType: pack.deviceType, version: (pack.version || 1) + 1, description: pack.description || '', canary: !!pack.canary, rules } };
    const put = await req('PUT', `/api/rulepacks/${packId}`, body);
    console.log(`PUT ${packId} (${list.length} regla/s) → ${put.status}${put.status !== 200 ? ' ' + put.raw.slice(0, 300) : ''}`);
  }
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
