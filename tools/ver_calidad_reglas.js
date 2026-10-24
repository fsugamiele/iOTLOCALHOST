// spec_supervisor_confiabilidad_v2 (R2) — muestra la última CALIDAD DE LAS REGLAS (30 días
// reproducidos con el motor completo). SOLO LECTURA.
//   docker exec -i node node - < tools/ver_calidad_reglas.js            → todo
//   docker exec -i node node - sana < tools/ver_calidad_reglas.js       → omite las sanas y sin disparos
const NM = '/home/node/app/node_modules/';
require(NM + 'dotenv').config({ path: '/home/node/app/.env' });
const mongoose = require(NM + 'mongoose');
const e = process.env;
const OCULTAR = process.argv.includes('sana') ? ['sana', 'proteccion'] : [];
const NOM = { avisa_de_mas: 'AVISA DE MÁS', no_evalua: 'NO PUEDE EVALUAR', inalcanzable: 'INALCANZABLE', umbral_revisar: 'UMBRAL A REVISAR', proteccion: 'protección sin disparos', sana: 'sana' };
(async () => {
  const uri = `mongodb://${e.MONGO_USERNAME}:${encodeURIComponent(e.MONGO_PASSWORD)}@${e.MONGO_HOST}:${e.MONGO_PORT}/${e.MONGO_DATABASE}`;
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true, authSource: 'admin' });
  const s = await mongoose.connection.db.collection('rule_quality_snapshots').find({}).sort({ computedAt: -1 }).limit(1).next();
  if (!s) { console.log('Todavía no hay cálculo de calidad de reglas.'); process.exit(0); }
  const cuenta = {}; for (const r of s.reglas) cuenta[r.veredicto] = (cuenta[r.veredicto] || 0) + 1;
  console.log(`Sitio ${s.siteCode} · ${new Date(s.computedAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })} · ${s.days} días · ${s.rows} lecturas reproducidas en ${(s.durationMs / 60000).toFixed(1)} min`);
  console.log(Object.entries(cuenta).map(([k, v]) => `${NOM[k] || k}: ${v}`).join(' · '));
  for (const r of s.reglas) {
    if (OCULTAR.includes(r.veredicto)) continue;
    console.log(`\n[${NOM[r.veredicto] || r.veredicto}] ${r.label} (${r.ruleId} · ${r.severity}) · ${r.avisos || 0} avisos${r.porDia != null ? ` · ${r.porDia}/día` : ''}`);
    console.log(`   por qué: ${r.porque}`);
    if (r.calculo) console.log(`   cálculo: ${String(r.calculo).replace(/\n/g, '\n            ')}`);
    console.log(`   cambio:  ${r.cambio}`);
  }
  if (s.notas && s.notas.length) console.log(`\n${s.notas.join('\n')}`);
  process.exit(0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
