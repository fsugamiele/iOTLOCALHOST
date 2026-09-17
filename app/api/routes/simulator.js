'use strict';
// ════════════════════════════════════════════════════════════════════
// Simulator API — endpoints para controlar el device simulator desde
// el panel Vue (Sim-3) y el dashboard de demo.
//
// Defensa en profundidad — TRES niveles:
//   1. ENABLE_SIMULATOR_API=true (env var, chequeada en cada handler)
//   2. checkAuth (JWT obligatorio en todos los endpoints)
//   3. SIMULATOR_MODE=true en el simulador (sin esto, los comandos
//      publicados al control topic caen al vacío)
//
// Validaciones adicionales:
//   - Device debe pertenecer al usuario logueado
//   - Device debe tener firmwareType='wanomi-sim'
//   - Template debe pertenecer al mismo usuario
//   - Sensor debe estar en widgets del template
//   - value debe matchear variableType (bool/float/int/categorical)
//   - dId formato makeid(8) — alfanumérico de 8 chars
// ════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();

import Device from '../models/device.js';
import Template from '../models/template.js';
import Site from '../models/site.js';

const checkAuth = require('../middlewares/authentication.js').checkAuth;
const { buildReadFilter, buildWriteFilter } = require('../middlewares/scope.js');
const SimScript = require('../models/sim_script.js');
const runner = require('../services/simScriptRunner.js');

// DEC-REF-100 D-8 (F8) — límites firmados del generador de escenarios.
const SCRIPT_MAX_STEPS = 50;
const SCRIPT_MAX_DURATION_SEC = 1800; // 30 min

// DEC-REF-99 / D-2 — fuente única de verdad: el catálogo de escenarios
// vive en el simulador (sensor-engine.js) y la API lo expone enriquecido
// (roles, duración, noCleanup). Cierra BACKLOG-SIM-5: ya no hay whitelist
// duplicada a mano.
const { SCENARIOS } = require('../../../tools/device_simulator/lib/sensor-engine.js');
const VALID_SCENARIOS = Object.keys(SCENARIOS);

// ────────── Helpers ────────────────────────────────────────────────

function isApiEnabled() {
  return process.env.ENABLE_SIMULATOR_API === 'true';
}
function notFound(res) {
  return res.status(404).json({ status: 'error', error: 'Not found' });
}
function badRequest(res, error) {
  return res.status(400).json({ status: 'error', error });
}
function internalError(res, error) {
  return res.status(500).json({ status: 'error', error: error.message || String(error) });
}

// dId del backend es makeid(8): alfanumérico, 8 chars exactos
function isValidDId(dId) {
  return typeof dId === 'string' && /^[a-zA-Z0-9]{8}$/.test(dId);
}

// sensor: string no vacío
function isValidSensorName(sensor) {
  return typeof sensor === 'string' && sensor.length > 0 && sensor.length < 100;
}

// Valida que value sea correcto para el variableType del widget
// Retorna { ok: true } o { ok: false, error: "..." }
function validateValueForWidget(widget, value) {
  if (widget.variableType === 'bool') {
    if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
      return { ok: false, error: `Sensor '${widget.variable}' is bool, value must be 0|1|true|false` };
    }
  } else if (widget.variableType === 'float') {
    if (typeof value !== 'number' || !isFinite(value)) {
      return { ok: false, error: `Sensor '${widget.variable}' is float, value must be a finite number` };
    }
  } else if (widget.variableType === 'int') {
    if (typeof value !== 'number' || !isFinite(value) || !Number.isInteger(value)) {
      return { ok: false, error: `Sensor '${widget.variable}' is int, value must be an integer` };
    }
  } else if (widget.variableType === 'categorical') {
    if (typeof value !== 'string') {
      return { ok: false, error: `Sensor '${widget.variable}' is categorical, value must be a string` };
    }
    if (Array.isArray(widget.enumValues) && widget.enumValues.length > 0) {
      const allowed = widget.enumValues.map(e => (e && typeof e === 'object' ? e.value : e));
      if (!allowed.includes(value)) {
        return { ok: false, error: `Sensor '${widget.variable}' is categorical, value must be one of: ${allowed.join(', ')}` };
      }
    }
  }
  return { ok: true };
}

// Publica al control topic con QoS 1 + callback (entrega garantizada)
function publishCommand(dId, command) {
  return new Promise((resolve, reject) => {
    if (!global.mqttClient || !global.mqttClient.connected) {
      return reject(new Error('MQTT client not connected — backend cannot reach simulator'));
    }
    const topic = `simulator/${dId}/control`;
    const payload = JSON.stringify(command);
    global.mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Resuelve device + template + valida alcance de escritura (grants) del caller.
// Retorna { device, template } o tira error con statusCode adjunto.
// DEC-REF-78-A: filtra por buildWriteFilter en lugar de userId propio del caller.
// El template NO se filtra por userId (verificado que devices.js:60 y el resto
// del código productivo usan getTemplates(tplIds) sin filtro por userId).
async function resolveDeviceAndTemplate(req, dId) {
  const writeFilter = await buildWriteFilter(req, 'Device');
  const device = await Device.findOne({ ...writeFilter, dId, firmwareType: 'wanomi-sim' }).lean();
  if (!device) {
    const err = new Error('Simulated device not found or not writable in scope');
    err.statusCode = 404;
    throw err;
  }
  const template = await Template.findOne({ _id: device.templateId }).lean();
  if (!template) {
    const err = new Error('Template not found');
    err.statusCode = 500;
    throw err;
  }
  return { device, template };
}

// ────────── GET /devices ──────────────────────────────────────────
router.get('/simulator/devices', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    // DEC-REF-78-A: alcance por grants (buildWriteFilter), no por userId propio.
    const writeFilter = await buildWriteFilter(req, 'Device');

    // 1. Cargar devices simulados (incluyendo templateId, lo necesitamos para join)
    // DEC-REF-100 D-1: userId (owner) incluido — la UI suscribe lives por
    // namespace del owner, no del caller (espejo de default.vue:272-287).
    const devices = await Device.find(
      { ...writeFilter, firmwareType: 'wanomi-sim' },
      { dId: 1, name: 1, siteId: 1, templateName: 1, templateId: 1, userId: 1, _id: 0 }
    ).lean();

    // 2. Cargar templates únicos en una sola query. Sin filtro userId —
    // templates no están particionados por userId en el resto del código.
    const templateIds = [...new Set(devices.map(d => d.templateId).filter(Boolean))];
    const templates = await Template.find(
      { _id: { $in: templateIds } }
    ).lean();
    const widgetsByTemplateId = {};
    templates.forEach(t => {
      widgetsByTemplateId[t._id.toString()] = t.widgets || [];
    });

    // 3. Enriquecer cada device con sus widgets
    const enriched = devices.map(d => ({
      dId: d.dId,
      name: d.name,
      siteId: d.siteId,
      userId: d.userId,
      templateName: d.templateName,
      templateWidgets: widgetsByTemplateId[d.templateId?.toString()] || [],
    }));

    return res.json({ status: 'success', data: enriched });
  } catch (error) {
    return internalError(res, error);
  }
});

// ────────── GET /scenarios ────────────────────────────────────────
// DEC-REF-99 / D-2: catálogo enriquecido desde la fuente única (sensor-engine).
router.get('/simulator/scenarios', checkAuth, (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  const data = VALID_SCENARIOS.map(name => {
    const s = SCENARIOS[name];
    return {
      name,
      description: s.description || '',
      duration_ms: s.duration_ms || 0,
      roles: Array.isArray(s.roles) ? s.roles : [],
      noCleanup: !!s.noCleanup,
      // DEC-REF-100 D-8 (F8): los pasos se exponen para "Clonar y editar"
      // (el front los convierte a guion editable apuntando al equipo elegido).
      steps: Array.isArray(s.steps) ? s.steps : [],
    };
  });
  return res.json({ status: 'success', data });
});

// ────────── POST /trigger ─────────────────────────────────────────
// Body: { dId, sensor, value?, duration_ms? }
router.post('/simulator/trigger', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const body = req.body || {};
    const { dId, sensor, value, duration_ms } = body;

    // Validación de inputs
    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId (expected 8 alphanumeric chars)');
    }
    if (!isValidSensorName(sensor)) {
      return badRequest(res, 'Invalid or missing sensor name');
    }
    if (duration_ms !== undefined) {
      if (typeof duration_ms !== 'number' || !isFinite(duration_ms) || duration_ms < 0) {
        return badRequest(res, 'duration_ms must be a non-negative finite number');
      }
    }

    // Resolver device + template (DEC-REF-78-A: por grants)
    const { device, template } = await resolveDeviceAndTemplate(req, dId);

    // Validar que el sensor existe en el template
    const widget = template.widgets.find(w => w.variable === sensor);
    if (!widget) {
      return badRequest(res, `Sensor '${sensor}' not in device template`);
    }

    // Si se pasó value, validar tipo según widget
    if (value !== undefined) {
      const validation = validateValueForWidget(widget, value);
      if (!validation.ok) {
        return badRequest(res, validation.error);
      }
    }

    // Construir y publicar comando
    const command = {
      command: 'trigger',
      sensor,
      ...(value !== undefined && { value }),
      ...(duration_ms !== undefined && { duration_ms }),
    };

    await publishCommand(dId, command);
    return res.json({ status: 'success', dId, sensor, command });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ status: 'error', error: error.message });
    }
    return internalError(res, error);
  }
});

// ────────── POST /set ─────────────────────────────────────────────
// Body: { dId, sensor, value }
router.post('/simulator/set', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const body = req.body || {};
    const { dId, sensor, value } = body;

    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId');
    }
    if (!isValidSensorName(sensor)) {
      return badRequest(res, 'Invalid or missing sensor name');
    }
    if (value === undefined) {
      return badRequest(res, 'value is required for set');
    }

    const { device, template } = await resolveDeviceAndTemplate(req, dId);

    const widget = template.widgets.find(w => w.variable === sensor);
    if (!widget) {
      return badRequest(res, `Sensor '${sensor}' not in device template`);
    }

    const validation = validateValueForWidget(widget, value);
    if (!validation.ok) {
      return badRequest(res, validation.error);
    }

    const command = { command: 'set_sensor', sensor, value };
    await publishCommand(dId, command);
    return res.json({ status: 'success', dId, sensor, value });

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ status: 'error', error: error.message });
    }
    return internalError(res, error);
  }
});

// ────────── POST /scenario ────────────────────────────────────────
// Body: { dId, name }
router.post('/simulator/scenario', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const body = req.body || {};
    const { dId, name } = body;

    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId');
    }
    if (typeof name !== 'string' || !VALID_SCENARIOS.includes(name)) {
      return badRequest(res, `Invalid scenario name. Valid: ${VALID_SCENARIOS.join(', ')}`);
    }

    // DEC-REF-78-A: alcance por grants (buildWriteFilter), no por userId propio.
    const writeFilter = await buildWriteFilter(req, 'Device');
    const device = await Device.findOne({ ...writeFilter, dId, firmwareType: 'wanomi-sim' }).lean();
    if (!device) {
      return res.status(404).json({ status: 'error', error: 'Simulated device not found or not writable in scope' });
    }

    const command = { command: 'scenario', value: name };
    await publishCommand(dId, command);
    return res.json({ status: 'success', dId, scenario: name });

  } catch (error) {
    return internalError(res, error);
  }
});

// ────────── POST /reset ──────────────────────────────────────────
// Body: { dId }
// Resetea TODOS los sensores del device a su initialState.
router.post('/simulator/reset', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const body = req.body || {};
    const { dId } = body;

    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId');
    }

    // DEC-REF-78-A: alcance por grants (buildWriteFilter), no por userId propio.
    const writeFilter = await buildWriteFilter(req, 'Device');
    const device = await Device.findOne({ ...writeFilter, dId, firmwareType: 'wanomi-sim' }).lean();
    if (!device) {
      return res.status(404).json({ status: 'error', error: 'Simulated device not found or not writable in scope' });
    }

    const command = { command: 'reset' };
    await publishCommand(dId, command);
    return res.json({ status: 'success', dId });

  } catch (error) {
    return internalError(res, error);
  }
});

// ════════════════════════════════════════════════════════════════════
// GUIONES DE ESCENARIO (DEC-REF-100 D-8 · F8) — generador por sitio.
// Pasos (segundo + equipo + variable + valor), reloj en el servidor
// (simScriptRunner), bloqueo de un guion activo por sitio, límites
// 50 pasos / 30 min, validación variable/valor idéntica al botón Aplicar.
// ════════════════════════════════════════════════════════════════════

// Shape + límites. Devuelve string de error o null.
function validateScriptShape(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return 'name is required';
  }
  if (body.name.length > 120) return 'name too long (max 120)';
  if (typeof body.siteId !== 'string' || !body.siteId) return 'siteId is required';
  if (body.cleanup !== undefined && !['reset', 'hold'].includes(body.cleanup)) {
    return "cleanup must be 'reset' or 'hold'";
  }
  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return 'steps must be a non-empty array';
  }
  if (body.steps.length > SCRIPT_MAX_STEPS) {
    return `Máximo ${SCRIPT_MAX_STEPS} pasos por guion`;
  }
  for (const [i, s] of body.steps.entries()) {
    if (!s || typeof s !== 'object') return `Paso ${i + 1}: shape inválido`;
    if (typeof s.atSec !== 'number' || !isFinite(s.atSec) || s.atSec < 0 || s.atSec > SCRIPT_MAX_DURATION_SEC) {
      return `Paso ${i + 1}: el segundo debe estar entre 0 y ${SCRIPT_MAX_DURATION_SEC} (30 min)`;
    }
    if (!isValidDId(s.dId)) return `Paso ${i + 1}: dId inválido`;
    if (!isValidSensorName(s.variable)) return `Paso ${i + 1}: variable inválida`;
    if (s.value === undefined) return `Paso ${i + 1}: value es requerido`;
  }
  return null;
}

// Validación contra el mundo real: sitio en scope + cada paso contra el
// template de su equipo (misma regla que /simulator/set).
async function validateScriptSteps(req, siteId, steps) {
  const siteFilter = await buildReadFilter(req, 'Site');
  const site = await Site.findOne({ ...siteFilter, siteCode: siteId }, { siteCode: 1 }).lean();
  if (!site) {
    const err = new Error('El sitio no existe o está fuera de tu scope');
    err.statusCode = 404;
    throw err;
  }
  const dIds = [...new Set(steps.map(s => s.dId))];
  for (const dId of dIds) {
    const { device, template } = await resolveDeviceAndTemplate(req, dId);
    if (device.siteId !== siteId) {
      const err = new Error(`El equipo ${dId} no pertenece al sitio ${siteId}`);
      err.statusCode = 400;
      throw err;
    }
    for (const step of steps.filter(s => s.dId === dId)) {
      const widget = (template.widgets || []).find(w => w.variable === step.variable);
      if (!widget) {
        const err = new Error(`Paso ${step.atSec}s: la variable '${step.variable}' no está en la plantilla de ${device.name || dId}`);
        err.statusCode = 400;
        throw err;
      }
      const v = validateValueForWidget(widget, step.value);
      if (!v.ok) {
        const err = new Error(`Paso ${step.atSec}s: ${v.error}`);
        err.statusCode = 400;
        throw err;
      }
    }
  }
}

function scriptError(res, error) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ status: 'error', error: error.message });
  }
  return internalError(res, error);
}

// ── GET /simulator/scripts/active — guiones en ejecución (barra de progreso)
router.get('/simulator/scripts/active', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  const isSuperadmin = (req.userData.grants || []).some(g => g.role === 'superadmin');
  const runs = runner.listActive()
    .filter(r => isSuperadmin || r.userId === req.userData._id);
  return res.json({ status: 'success', data: runs });
});

// ── GET /simulator/scripts?siteId= — mis guiones (opcional por sitio)
router.get('/simulator/scripts', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const filter = await buildReadFilter(req, 'SimScript');
    if (req.query.siteId) filter.siteId = String(req.query.siteId);
    const scripts = await SimScript.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ status: 'success', data: scripts });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── POST /simulator/scripts — crear guion
router.post('/simulator/scripts', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const shapeError = validateScriptShape(req.body);
    if (shapeError) return badRequest(res, shapeError);

    const { name, description, siteId, cleanup, steps } = req.body;
    await validateScriptSteps(req, siteId, steps);

    const doc = await SimScript.create({
      userId: req.userData._id,
      siteId,
      name: name.trim(),
      description: (description || '').slice(0, 300),
      cleanup: cleanup || 'reset',
      steps: steps.map(s => ({ atSec: s.atSec, dId: s.dId, variable: s.variable, value: s.value })),
    });
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── PUT /simulator/scripts/:id — editar guion (solo propio)
router.put('/simulator/scripts/:id', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const shapeError = validateScriptShape(req.body);
    if (shapeError) return badRequest(res, shapeError);

    const writeFilter = await buildWriteFilter(req, 'SimScript');
    const script = await SimScript.findOne({ ...writeFilter, _id: req.params.id });
    if (!script) return notFound(res);

    if (runner.isSiteBusy(script.siteId)) {
      return res.status(409).json({ status: 'error', error: 'Hay un guion en ejecución en ese sitio — detenelo antes de editar' });
    }

    const { name, description, siteId, cleanup, steps } = req.body;
    await validateScriptSteps(req, siteId, steps);

    script.siteId = siteId;
    script.name = name.trim();
    script.description = (description || '').slice(0, 300);
    script.cleanup = cleanup || 'reset';
    script.steps = steps.map(s => ({ atSec: s.atSec, dId: s.dId, variable: s.variable, value: s.value }));
    await script.save();
    return res.json({ status: 'success', data: script });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── DELETE /simulator/scripts/:id
router.delete('/simulator/scripts/:id', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const writeFilter = await buildWriteFilter(req, 'SimScript');
    const script = await SimScript.findOne({ ...writeFilter, _id: req.params.id });
    if (!script) return notFound(res);
    if (runner.isSiteBusy(script.siteId)) {
      return res.status(409).json({ status: 'error', error: 'Hay un guion en ejecución en ese sitio — detenelo antes de borrar' });
    }
    await script.deleteOne();
    return res.json({ status: 'success' });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── POST /simulator/scripts/:id/duplicate
router.post('/simulator/scripts/:id/duplicate', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const readFilter = await buildReadFilter(req, 'SimScript');
    const src = await SimScript.findOne({ ...readFilter, _id: req.params.id }).lean();
    if (!src) return notFound(res);
    const doc = await SimScript.create({
      userId: req.userData._id,
      siteId: src.siteId,
      name: `${src.name} (copia)`.slice(0, 120),
      description: src.description,
      cleanup: src.cleanup,
      steps: src.steps,
    });
    return res.json({ status: 'success', data: doc });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── POST /simulator/scripts/:id/run — ejecutar (reloj en el servidor)
router.post('/simulator/scripts/:id/run', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const readFilter = await buildReadFilter(req, 'SimScript');
    const script = await SimScript.findOne({ ...readFilter, _id: req.params.id }).lean();
    if (!script) return notFound(res);

    if (runner.isSiteBusy(script.siteId)) {
      return res.status(409).json({ status: 'error', error: `Ya hay un guion en ejecución en el sitio ${script.siteId}` });
    }
    // Revalidar contra el estado actual (el template/device pudo cambiar
    // desde que se guardó el guion).
    await validateScriptSteps(req, script.siteId, script.steps);

    const run = runner.startRun({ script, userId: req.userData._id, publishCommand });
    return res.json({ status: 'success', data: run });
  } catch (error) {
    return scriptError(res, error);
  }
});

// ── POST /simulator/scripts/:id/stop — detener (sin cleanup)
router.post('/simulator/scripts/:id/stop', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const readFilter = await buildReadFilter(req, 'SimScript');
    const script = await SimScript.findOne({ ...readFilter, _id: req.params.id }).lean();
    if (!script) return notFound(res);
    const stopped = runner.stopRun(script.siteId);
    if (!stopped) {
      return res.status(409).json({ status: 'error', error: 'No hay guion en ejecución en ese sitio' });
    }
    return res.json({ status: 'success', data: stopped });
  } catch (error) {
    return scriptError(res, error);
  }
});

module.exports = router;
