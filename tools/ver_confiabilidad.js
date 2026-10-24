// spec_supervisor_confiabilidad_v2 (R1) — muestra la ÚLTIMA foto de confiabilidad que calculó el
// worker de calidad (reliability_snapshots). SOLO LECTURA. Sirve para validar los números reales
// antes de la UI nueva (R4).
//   docker exec -i node node - < tools/ver_confiabilidad.js
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const f = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
const h = (v) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${f(v)} h`);
const dt = (t) => new Date(t).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const s = await mongoose.connection.db.collection('reliability_snapshots').find({}).sort({ computedAt: -1 }).limit(1).next();
  if (!s) { console.log('Todavía no hay cálculo de confiabilidad.'); process.exit(0); }
  console.log(`Sitio ${s.siteCode} · calculado ${dt(s.computedAt)} en ${(s.durationMs / 1000).toFixed(1)} s · ventana ${s.window.T} h · IC ${s.config.confidence * 100} %\n`);
  const st = s.sitio || {}; const cg = st.carga;
  console.log(cg ? `SITIO  carga: Ao ${f(cg.Ao, 3)} % · ${cg.caidas} caída(s) · ${h(cg.downH)} sin energía${cg.detalle.map((c) => `\n        ${dt(c.desde)} → ${dt(c.hasta)}`).join('')}` : 'SITIO  sin rectificadores con datos');
  if (st.red) console.log(`       red: ${st.red.n} corte(s) · ${h(st.red.horas)} sin red · Ao red ${f(st.red.Ao, 2)} % · MTBF red ${st.red.n ? `${f(st.red.mtbf)} h [${f(st.red.mtbf_lo)}–${f(st.red.mtbf_hi)}]` : `≥ ${f(st.red.mtbf_lo)} h`}`);
  if (st.plataforma) console.log(`       plataforma sin datos: ${f(st.plataforma.sinDatosPct)} % de la ventana (no cuenta como falla ni baja la completitud)`);
  if (st.eventos) console.log(`       eventos que no son falla: ${Object.entries(st.eventos).map(([k, v]) => `${k} ${v}`).join(' · ') || 'ninguno'}`);
  if (st.sinClasificar && st.sinClasificar.length) console.log(`       reglas críticas sin clasificar (no cuentan): ${st.sinClasificar.length}`);
  const a = s.agg;
  console.log(`PARQUE n=${a.n} · MTBF ${f(a.mtbf)} h [${f(a.mtbf_lo)}–${f(a.mtbf_hi)}] · λ ${f(a.lam, 2)}/1000 h · MTTR ${h(a.mttr)} (sobre ${a.nReconocidas} de ${a.n} reconocidas · confianza ${a.confMttr}) · respuesta ${h(a.mrt)} · Ai ${f(a.Ai, 2)} % · Ao ${f(a.Ao, 2)} % · M(${s.config.slaRepairH} h) ${f(a.M4)} % · confianza ${a.conf}\n`);
  for (const q of s.equipos) {
    console.log(`${q.nombre} (${q.modelo}) · T ${f(q.T)} h · completitud ${f(q.completitud)} % · confianza ${q.conf}`);
    console.log(`   n=${q.n} · MTBF ${q.n ? `${f(q.mtbf)} h [${f(q.mtbf_lo)}–${f(q.mtbf_hi)}]` : `≥ ${f(q.mtbf_lo)} h`} · λ ${f(q.lam, 2)} · MTTR ${h(q.mttr)}${q.n ? ` (${q.nReconocidas}/${q.n}, conf. ${q.confMttr})` : ''} · resp ${h(q.mrt)} · fuera ${h(q.mdt)} · Ai ${f(q.Ai, 2)} · Ao ${f(q.Ao, 2)} · R(24 h) ${q.n ? f(q.R24) : '≥ ' + f(100 * Math.exp(-24 / q.mtbf_lo))} %${q.beta != null ? ` · β ${q.beta}` : ''}`);
    for (const x of q.fallas) console.log(`     ${dt(x.start)} ${x.causas.join(' + ')} · fuera ${h(x.fuera)}${x.resp != null ? ` (resp ${h(x.resp)}, rep ${h(x.rep)})` : ' · sin reconocer'}${x.censurada ? ' · ABIERTA' : ''}${x.reconstruida ? ' · reconstruida' : ''}`);
  }
  const i = s.isa;
  console.log(`\nALARMAS ${i.dias} d · ${i.total} avisos · ${f(i.por_hora, 2)}/h (meta ≤ ${s.config.isaRateTarget}) · máx ${i.max10} en 10 min · inundación ${f(i.flood_pct, 2)} % · parpadeo ${i.chattering} · permanentes ${i.stale} · top 10 ${f(i.top10)} %`);
  console.log(`   más activas: ${i.topReglas.slice(0, 5).map((r) => `${r.ruleId} (${r.n})`).join(', ')}`);
  const bajos = s.datos.filter((d) => !d.intermitente && d.completitud < s.config.completitudMin);
  console.log(`\nDATOS con completitud < ${s.config.completitudMin} %: ${bajos.length ? '' : 'ninguno'}`);
  for (const d of bajos) console.log(`   ${d.equipo} · ${d.variable} · ${f(d.completitud)} % · ${d.huecos} hueco(s)`);
  if (s.notas.length) console.log(`\nNOTAS\n   ${s.notas.join('\n   ')}`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
