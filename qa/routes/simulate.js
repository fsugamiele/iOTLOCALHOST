'use strict';
// spec_editor_reglas_v2 — RUTA INTERNA del worker qa: POST /simulate {rule, hours}.
// Corre la regla (guardada o en edición) con el motor real del edge sobre los datos del sitio.
// Calco de routes/backtest.js (DEC-REF-136): auto-descubierta, sin auth (red interna docker;
// la auth vive en el proxy de node), req/res nativos de http.
const { simulate } = require('../lib/simulate');

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) { reject(new Error('body demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('body JSON inválido')); }
    });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

async function handler(req, res) {
  let body;
  try { body = await readJsonBody(req); } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
  const { rule, hours } = body || {};
  if (!rule || typeof rule !== 'object') return sendJson(res, 400, { ok: false, error: 'rule requerida' });
  try {
    const result = await simulate({ rule, hours });
    if (result && result.error) return sendJson(res, 400, { ok: false, error: result.error });
    return sendJson(res, 200, result);
  } catch (e) {
    console.error('[qa/simulate]', e && (e.stack || e.message));
    return sendJson(res, 500, { ok: false, error: 'no se pudo simular la regla' });
  }
}

module.exports = { method: 'POST', path: '/simulate', handler };
