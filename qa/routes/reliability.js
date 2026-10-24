'use strict';
// spec_supervisor_confiabilidad_v2 (R1) — POST /reliability: recalcula la foto de confiabilidad
// YA (sin esperar el ciclo de qa_config.everyMin). Ruta interna; la auth superadmin vive en node.
const { compute } = require('../checks/reliability');

module.exports = {
  method: 'POST', path: '/reliability',
  handler: async (req, res) => {
    const s = await compute({ force: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, computedAt: s.computedAt, durationMs: s.durationMs }));
  },
};
