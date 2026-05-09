'use strict';

// HTTP client para el backend Wanomi. Usa el módulo http nativo — cero deps extra.
// Todos los endpoints retornan { status, body } donde body puede ser:
//   - JSON parseado si el response tenía body válido
//   - string crudo si el body no parsea como JSON
//   - null si el body estaba vacío (caso típico de 404/401 de getdevicecredentials)

const http = require('http');

const HOST = process.env.API_HOST || 'localhost';
const PORT = parseInt(process.env.API_PORT || '3001', 10);

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { token } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        // Algunos endpoints (getdevicecredentials 404/401, sendStatus 500) envían body
        // vacío o no-JSON. Resolvemos con body:null o body:string para que el caller
        // pueda inspeccionar el status code directamente.
        let parsed = null;
        if (data.length > 0) {
          try {
            parsed = JSON.parse(data);
          } catch {
            // raw string fallback. El caller debería chequear status code primero;
            // si esperaba JSON y obtuvo string, es un problema upstream.
            parsed = data;
          }
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(email, password) {
  const r = await request('POST', '/api/login', { email, password });
  if (r.body?.status !== 'success') throw new Error(`Login failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body; // { status, token, userData }
}

// Sin auth token — mismo path de bootstrap que un ESP32 real.
// getdevicecredentials envía body vacío en 404/401, así que primero chequeamos status.
async function getDeviceCredentials(dId, password) {
  const r = await request('POST', '/api/getdevicecredentials', { dId, password });
  if (r.status === 404) throw new Error(`Device ${dId} not found in backend`);
  if (r.status === 401) throw new Error(`Credentials rejected by backend for device ${dId}`);
  if (!r.body?.username) throw new Error(`getDeviceCredentials unexpected response for ${dId}: HTTP ${r.status}`);
  return r.body; // { username, password, topic: "userId/dId/", variables }
}

async function getSites(token) {
  const r = await request('GET', '/api/site', null, token);
  if (r.body?.status !== 'success') throw new Error(`getSites failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body.data;
}

async function createSite(token, site) {
  const r = await request('POST', '/api/site', { newSite: site }, token);
  if (r.body?.status !== 'success') throw new Error(`createSite(${site.siteCode}) failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body;
}

async function getTemplates(token) {
  const r = await request('GET', '/api/template', null, token);
  if (r.body?.status !== 'success') throw new Error(`getTemplates failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body.data;
}

// POST /api/template retorna {status:"success"} sin _id.
// El caller debe re-fetch con getTemplates() para resolver el _id.
async function createTemplate(token, template) {
  const r = await request('POST', '/api/template', { template }, token);
  if (r.body?.status !== 'success') throw new Error(`createTemplate(${template.name}) failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body;
}

async function getDevices(token) {
  const r = await request('GET', '/api/device', null, token);
  if (r.body?.status !== 'success') throw new Error(`getDevices failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body.data;
}

// Retorna { status, dId, password } - el backend genera dId+password automáticamente.
async function createDevice(token, device) {
  const r = await request('POST', '/api/device', { newDevice: device }, token);
  if (r.body?.status !== 'success') throw new Error(`createDevice(${device.name}) failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body;
}

// bind: POST /api/site/devices — body { siteCode, dId } directo, NO wrapped.
async function bindDevice(token, dId, siteCode) {
  const r = await request('POST', '/api/site/devices', { siteCode, dId }, token);
  if (r.body?.status !== 'success') throw new Error(`bindDevice(${dId} → ${siteCode}) failed: ${r.body?.error ?? `HTTP ${r.status}`}`);
  return r.body;
}

module.exports = {
  login,
  getDeviceCredentials,
  getSites,
  createSite,
  getTemplates,
  createTemplate,
  getDevices,
  createDevice,
  bindDevice,
};
