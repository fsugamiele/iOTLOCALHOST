'use strict';
// DEC-REF-136 — RUTA INTERNA on-demand del worker qa: POST /backtest. Auto-descubierta
// por index.js (loadDir('routes')); NO se toca index.js. Sin auth acá (red interna docker;
// la auth superadmin vive en el proxy de node, bloque 140).
//
// Contrato de extensión (index.js): module.exports = { method, path, handler(req,res) }.
// req/res son nativos de http (NO Express) → el body se lee del stream a mano.
const { backtest } = require('../lib/backtest');

// Lee el body del request (http crudo) y lo parsea como JSON. Cota de tamaño defensiva.
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) { reject(new Error('body demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('body JSON inválido')); }
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
  // Caso raro #5: body inválido → 400 JSON { ok:false, error }.
  try { body = await readJsonBody(req); }
  catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }

  const { packId, days, ruleId } = body || {};
  if (!packId || typeof packId !== 'string') {
    return sendJson(res, 400, { ok: false, error: 'packId requerido' });
  }

  const result = await backtest({ packId, days, ruleId: ruleId || null });
  // Caso raro #1: pack inexistente → el módulo devuelve {error:...} (no throw). 404 JSON.
  if (result && result.error) return sendJson(res, 404, { ok: false, error: result.error });
  return sendJson(res, 200, { ok: true, ...result });
}

module.exports = { method: 'POST', path: '/backtest', handler };
