// Corre UNA vez las capas B (invariantes) y C (oráculo) del supervisor de calidad, sin
// esperar al scheduler (B cada 5 min, C una vez por día), y lista los hallazgos abiertos
// I13/I14/I15. Verificación de G2 (DEC-REF-147).
//   docker exec -i wanomi-qa node - < tools/qa_run_once.js
require('dotenv').config({ path: '/home/qa/qa/.env.qa' });
const mongoose = require('mongoose');
const QA = '/home/qa/qa/checks/';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false });
  for (const m of ['invariants', 'oracle']) {
    const t0 = Date.now();
    try {
      const r = await require(QA + m).run();
      console.log(`[${m}] ok en ${Date.now() - t0} ms · hallazgos escritos: ${r && r.findingsWritten}`);
    } catch (e) { console.log(`[${m}] ERROR: ${e.message}`); }
  }
  const f = await mongoose.connection.db.collection('quality_findings')
    .find({ type: { $in: ['I13', 'I14', 'I15'] }, status: 'open' }).sort({ type: 1, ruleId: 1 }).toArray();
  console.log(`\nHallazgos abiertos I13/I14/I15: ${f.length}`);
  for (const x of f) {
    const ev = x.evidence || {};
    const det = x.type === 'I15' ? ev.direccion
      : x.type === 'I14' ? (ev.cambios || []).map((c) => `${c.campo}: ${c.deFabrica} → ${c.actual}`).join(', ')
      : (ev.camposDivergentes || []).join(', ');
    console.log(`  ${x.type} ${x.severity.padEnd(4)} ${x.ruleId}${x.dId ? ' · ' + x.dId : ''} — ${det}`);
  }
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
