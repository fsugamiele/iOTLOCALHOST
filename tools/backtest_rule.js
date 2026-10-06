'use strict';
// DEC-REF-131 / DEC-REF-136 — BACKTEST CLI. "Probar una regla contra el historial"
// (Capa A del supervisor de calidad). Replaya una regla (o un pack) contra N días de
// db.data REUSANDO los evaluadores REALES del edge, y reporta episodios / % en condición
// / distribución / veredicto (muerta/permanente/ruidosa/sana). READ-ONLY.
//
// FUENTE ÚNICA (DEC-REF-136): el núcleo vive en qa/lib/backtest.js. Este CLI es un
// FORMATEADOR delgado: llama al módulo y re-imprime EXACTAMENTE el mismo output por
// consola de la versión DEC-REF-131. La lógica (neededVars/replay/stats/veredicto) NO
// se duplica acá.
//
// DÓNDE CORRERLO — el módulo vive en ./qa/lib, montado en el container `wanomi-qa`
// (NO en `wanomi-edge`, que no monta ./qa). Por eso el CLI se corre donde el módulo
// es alcanzable y los evaluadores del edge también:
//   docker exec -i -e PACK=eltek-smartpack-v1 -e DAYS=7 \
//       -e EDGE_DIR=/home/qa/edge-engine -e QA_LIB_DIR=/home/qa/qa/lib \
//       wanomi-qa node < tools/backtest_rule.js
// QA_LIB_DIR/EDGE_DIR son overrides opcionales; sin ellos usa los candidatos de abajo.

// Resuelve qa/lib/backtest.js por candidatos (env primero). Permite correr el CLI desde
// cualquier container que monte ./qa o desde el host, sin hardcodear un único path.
function loadBacktest() {
  const candidatos = [];
  if (process.env.QA_LIB_DIR) candidatos.push(process.env.QA_LIB_DIR + '/backtest');
  candidatos.push('/home/qa/qa/lib/backtest');        // mount de wanomi-qa
  candidatos.push(__dirname + '/../qa/lib/backtest');  // layout del repo (host/otros)
  candidatos.push('../qa/lib/backtest');
  let ultimoError;
  for (const c of candidatos) {
    try { return require(c); }
    catch (e) { ultimoError = e; }
  }
  throw new Error('no pude resolver qa/lib/backtest.js (seteá QA_LIB_DIR). último error: ' + (ultimoError && ultimoError.message));
}

const mongoose = require('mongoose');   // resuelto vía NODE_PATH del contenedor.
const { backtest } = loadBacktest();

// Args por env (robusto con stdin) o argv: PACK/DAYS/RULEID.
const PACK = process.env.PACK || process.argv[2];
const DAYS = Number(process.env.DAYS || process.argv[3]) || 7;
const ONLY = process.env.RULEID || process.argv[4] || null;
if (!PACK) { console.error('uso: node backtest_rule.js <packId> [days] [ruleId]'); process.exit(1); }

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const res = await backtest({ packId: PACK, days: DAYS, ruleId: ONLY });
  if (res.error) { console.error(res.error + ':', PACK); await mongoose.disconnect(); process.exit(1); }

  // Re-impresión EXACTA del output DEC-REF-131 a partir de los datos estructurados.
  console.log(`\nBACKTEST ${res.packId} · ${res.days} días · site ${res.site}\n${'─'.repeat(78)}`);
  for (const r of res.rules) {
    const d = r.distribution;
    const distTxt = d
      ? `${d.var}∈[${d.min.toFixed(1)},${d.max.toFixed(1)}] avg ${d.avg.toFixed(1)}`
      : '(variable no numérica/ausente)';
    const pctTxt = r.type === 'cross' ? '' : ` · ${(r.pctInCondition || 0).toFixed(0)}% en condición`;
    console.log(`• ${r.ruleId.padEnd(32)} ${r.verdict}`);
    console.log(`    ${r.episodes} episodios (${r.perDay.toFixed(1)}/día)${pctTxt} · ${r.evals} evals · ${distTxt}`);
  }
  await mongoose.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(2); });
