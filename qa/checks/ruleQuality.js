'use strict';
// spec_supervisor_confiabilidad_v2 (R2) — Capa C nocturna: calidad de las reglas (30 días con el
// motor completo) → rule_quality_snapshots. También se corre a pedido (qa/routes/ruleQuality.js).
const { ruleQuality } = require('../lib/ruleQuality');
const Snap = require('../../app/api/models/rule_quality_snapshot');
const QaConfig = require('../../app/api/models/qa_config');

let corriendo = null;
async function compute() {
  if (corriendo) return corriendo;               // una sola corrida a la vez
  corriendo = (async () => {
    const cfg = (await QaConfig.findById('default').lean()) || {};
    const s = await ruleQuality({ days: cfg.windowDays || 30 });
    await Snap.create(s);
    console.log(`[qa] calidad de reglas: ${s.reglas.length} reglas · ${s.rows} lecturas · ${(s.durationMs / 1000).toFixed(0)} s`);
    return s;
  })();
  try { return await corriendo; } finally { corriendo = null; }
}

module.exports = {
  layer: 'C', name: 'RQ', compute, enCurso: () => !!corriendo,
  run: async () => { const s = await compute(); return { check: 'RQ', rulesCovered: s.reglas.map((r) => r.ruleId), devicesCovered: [], findingsWritten: 0 }; },
};
