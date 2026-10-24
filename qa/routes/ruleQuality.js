'use strict';
// spec_supervisor_confiabilidad_v2 (R2) — POST /rule-quality: arranca la reproducción en segundo
// plano (tarda minutos) y responde enseguida; GET /api/qa/rule-quality lee el resultado.
const rq = require('../checks/ruleQuality');
module.exports = {
  method: 'POST', path: '/rule-quality',
  handler: async (req, res) => {
    const ya = rq.enCurso();
    if (!ya) rq.compute().catch((e) => console.error('[qa] calidad de reglas FALLÓ:', e && (e.stack || e.message)));
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, started: !ya, running: true }));
  },
};
