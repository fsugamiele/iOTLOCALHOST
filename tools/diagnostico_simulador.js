// Auditoría del simulador 2026-10-20 — estado de los equipos SIMULADOS con datos reales.
// SOLO LECTURA. Para cada equipo 'wanomi-sim':
//   1. sitio: el que usa el simulador (device.siteId, agrupa el estado compartido) vs el sitio
//      que lo lista (site.devices, lo que usa el motor). Si difieren, los escenarios "del sitio"
//      (sifoneo, carga alta, corte de red) afectan a equipos equivocados.
//   2. plantilla vs ficha: variables que publica sin ficha y tipos distintos (la API valida
//      contra la plantilla; el motor normaliza contra la ficha).
//   3. reglas que esperan una medición que el equipo nunca publica.
//   4. últimas 24 h por variable: lecturas, último dato, mínimo/máximo.
//   5. firmas de estado pegado: tanque que baja con el motor detenido (sifoneo activo),
//      grupo en marcha sin ATS, etc.
//
//   docker exec -i node node - < tools/diagnostico_simulador.js
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const H = 3600000;
const hace = (ms) => { if (!ms) return 'nunca'; const s = Math.round((Date.now() - ms) / 1000); return s < 120 ? `${s} s` : s < 7200 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`; };
const f = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : JSON.stringify(v));
const TYPE_ALIAS = { number: 'float', string: 'categorical', boolean: 'bool' };
const leaves = (n, out = []) => { if (!n) return out; if (Array.isArray(n.children)) n.children.forEach((c) => leaves(c, out)); else out.push(n); return out; };

(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const db = mongoose.connection.db;
  const devs = await db.collection('devices').find({ firmwareType: 'wanomi-sim' }).toArray();
  const sites = await db.collection('sites').find({}).project({ siteCode: 1, devices: 1 }).toArray();
  const siteOf = new Map(); for (const s of sites) for (const d of (s.devices || [])) siteOf.set(d, s.siteCode);
  const sheets = new Map((await db.collection('equipmentsheets').find({}).toArray()).map((s) => [s.deviceType, s]));
  const packs = await db.collection('rulepacks').find({ enabled: { $ne: false } }).toArray();
  const issues = [];
  console.log(`${devs.length} equipos simulados\n`);

  const series = {};   // dId → variable → [{time,value}] (24 h)
  for (const d of devs) {
    const tid = d.templateId && mongoose.Types.ObjectId.isValid(String(d.templateId)) ? new mongoose.Types.ObjectId(String(d.templateId)) : d.templateId;
    const tpl = tid ? await db.collection('templates').findOne({ _id: tid }) : null;
    const widgets = (tpl && tpl.widgets) || [];
    const tvars = new Map(); for (const w of widgets) { if (w.variable) tvars.set(w.variable, w.variableType); for (const s of (w.sources || [])) if (s.variable) tvars.set(s.variable, s.variableType || w.variableType); }
    const sh = sheets.get(d.deviceType);
    const fvars = new Map(((sh && sh.variables) || []).map((v) => [v.name, TYPE_ALIAS[v.type] || v.type]));
    const sitioSim = d.siteId || 'UNKNOWN', sitioMotor = siteOf.get(d.dId) || '—';
    console.log('═'.repeat(90));
    console.log(`${d.name || d.dId} [${d.dId}] · ${d.deviceType} · plantilla «${(tpl && tpl.name) || '—'}» · sitio simulador ${sitioSim} · sitio motor ${sitioMotor}`);
    const p = [];
    if (sitioSim !== sitioMotor) p.push(`el simulador lo agrupa en «${sitioSim}» y el motor en «${sitioMotor}»: los escenarios del sitio no lo afectan como se espera`);
    if (!sh) p.push(`no hay ficha para el tipo ${d.deviceType}: el motor no normaliza sus valores`);
    for (const [v, t] of tvars) {
      if (sh && !fvars.has(v)) p.push(`publica ${v} pero la ficha no la declara`);
      else if (sh && fvars.get(v) && t && fvars.get(v) !== t && !(fvars.get(v) === 'int' && t === 'float')) p.push(`${v}: plantilla dice ${t}, ficha dice ${fvars.get(v)} (la API valida con una y el motor con la otra)`);
    }
    // Reglas de su tipo que esperan variables que no publica.
    const esperadas = new Set();
    for (const pk of packs) for (const r of (pk.rules || [])) {
      if (r.enabled === false) continue;
      const ls = r.type === 'cross' ? leaves(r.crossExpr) : [r];
      for (const l of ls) {
        if ((l.deviceType || r.deviceType) !== d.deviceType) continue;
        [l.variable, ...((l.inputs || []).map((i) => i.variable)), l.setpointSource && l.setpointSource.variable].filter(Boolean).forEach((v) => esperadas.add(`${v}|${r.label}`));
      }
    }
    const DERIVADAS = ['autonomy_hours', 'autonomy_source', 'autonomy_lph', 'autonomy_liters', 'fuel_efficiency', 'consumption_tank'];
    const faltan = {};
    for (const x of esperadas) { const [v, lab] = x.split('|'); if (!tvars.has(v) && !DERIVADAS.includes(v)) (faltan[v] = faltan[v] || []).push(lab); }
    for (const [v, labs] of Object.entries(faltan)) p.push(`${labs.length} regla(s) esperan ${v} y el equipo no la publica: ${labs.slice(0, 3).join(' · ')}${labs.length > 3 ? '…' : ''}`);
    // Lecturas 24 h.
    series[d.dId] = {};
    for (const v of tvars.keys()) {
      const rows = await db.collection('data').find({ dId: d.dId, variable: v, time: { $gte: Date.now() - 24 * H } }).project({ time: 1, value: 1, _id: 0 }).sort({ time: 1 }).toArray();
      series[d.dId][v] = rows;
      const nums = rows.map((r) => r.value).filter((x) => typeof x === 'number');
      const last = rows[rows.length - 1];
      const rango = nums.length ? `${f(Math.min(...nums))}…${f(Math.max(...nums))}` : (rows.length ? [...new Set(rows.map((r) => r.value))].slice(0, 4).join('/') : '—');
      console.log(`  ${v.padEnd(24)} ${String(rows.length).padStart(5)} lecturas · último ${last ? f(last.value) + ' hace ' + hace(last.time) : 'NUNCA'} · rango ${rango}`);
      if (!last) p.push(`${v}: sin lecturas en 24 h`);
      else if (Date.now() - last.time > 10 * 60000) p.push(`${v}: último dato hace ${hace(last.time)} (¿silenciada o detenida?)`);
    }
    // Firmas de estado pegado.
    const fuel = series[d.dId].fuel_level || [];
    const run = series[d.dId].genset_running || series[d.dId].rpm || [];
    const ult2h = fuel.filter((r) => r.time >= Date.now() - 2 * H);
    if (ult2h.length > 10) {
      const corriendo = run.filter((r) => r.time >= Date.now() - 2 * H).some((r) => Number(r.value) > (series[d.dId].rpm ? 300 : 0));
      const drop = ult2h[0].value - ult2h[ult2h.length - 1].value;
      const horas = (ult2h[ult2h.length - 1].time - ult2h[0].time) / H;
      if (!corriendo && drop / Math.max(horas, 0.1) > 1) p.push(`el tanque bajó ${drop.toFixed(1)} % en ${horas.toFixed(1)} h con el motor DETENIDO → sifoneo del simulador activo (escenario sin "sifoneo_fin") o pérdida configurada`);
      const saltos = []; for (let i = 1; i < fuel.length; i++) { const dv = fuel[i].value - fuel[i - 1].value; if (dv > 5) saltos.push(`+${dv.toFixed(0)} % ${new Date(fuel[i].time).toLocaleTimeString('es-AR', { hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })}`); }
      if (saltos.length) p.push(`subidas bruscas del tanque en 24 h (reset del simulador o recarga simulada): ${saltos.slice(0, 5).join(', ')}`);
    }
    console.log(p.length ? `  ⚠ ${p.join('\n  ⚠ ')}` : '  ✓ sin observaciones');
    issues.push(...p.map((x) => `${d.name || d.dId}: ${x}`));
  }
  // Coherencia del sitio: grupo Cummins en marcha sin ATS en marcha, etc.
  console.log('═'.repeat(90));
  const banco = packs.find((p) => p.packId === 'banco-conformidad');
  if (banco && (banco.rules || []).length) {
    const x = `el pack de pruebas «banco-conformidad» tiene ${banco.rules.length} regla(s) activas (${banco.rules.map((r) => r.label).join(' · ')}): el banco lo vacía al correr y sus avisos se mezclan con los reales`;
    console.log(`⚠ ${x}`); issues.push(x);
  }
  console.log(`\n${issues.length} observación(es).`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.stack || err.message); process.exit(1); });
