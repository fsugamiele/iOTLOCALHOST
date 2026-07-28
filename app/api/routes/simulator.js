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
//   - value debe matchear variableType (bool/float)
//   - dId formato makeid(8) — alfanumérico de 8 chars
// ════════════════════════════════════════════════════════════════════

const express = require('express');
const router = express.Router();

import Device from '../models/device.js';
import Template from '../models/template.js';

const checkAuth = require('../middlewares/authentication.js').checkAuth;

// Whitelist de escenarios — debe matchear sensor-engine.js del simulador.
// Divergencia con el sim documentada como BACKLOG-SIM-5 (2 mordidas: #7 y
// #53/Fase 3). La solución real es una sola fuente de verdad; hoy se sincroniza
// a mano al agregar escenarios. Al agregar/quitar acá, verificar en paralelo
// contra tools/device_simulator/lib/sensor-engine.js SCENARIOS con grep.
const VALID_SCENARIOS = [
  // Existentes desde antes de #53/Fase 3
  'intrusion',
  'copper_theft',
  'fuel_siphon',
  'genset_no_start',
  'genset_vibration_anomaly',
  'battery_degraded',
  'maintenance',
  // Existentes en el sim pero fuera de la whitelist hasta #53/Fase 3
  // (7 escenarios del guion del paréntesis pre-reunión Claro que la consola
  // no podía disparar por UI hasta este commit)
  'mains_failure_ats_transfer',
  'mains_failure_gen_no_start',
  'mains_restore',
  'cummins_setpoint_lost',
  'cummins_setpoint_restore',
  'eltek_load_high',
  'eltek_load_restore',
  // Nuevos en #53/Fase 3 (DEC-REF-77-A + DEC-REF-79 vi + DEC-REF-79-B)
  'weekly_exercise',
  'service_due',
  'fuel_drawdown',
];

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

// Resuelve device + template + valida pertenencia al usuario
// Retorna { device, template } o tira error con statusCode adjunto
async function resolveDeviceAndTemplate(userId, dId) {
  const device = await Device.findOne({ userId, dId, firmwareType: 'wanomi-sim' }).lean();
  if (!device) {
    const err = new Error('Simulated device not found or not owned by user');
    err.statusCode = 404;
    throw err;
  }
  const template = await Template.findOne({ _id: device.templateId, userId }).lean();
  if (!template) {
    const err = new Error('Template not found or not owned by user');
    err.statusCode = 500;
    throw err;
  }
  return { device, template };
}

// ────────── GET /devices ──────────────────────────────────────────
router.get('/simulator/devices', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const userId = req.userData._id;

    // 1. Cargar devices simulados (incluyendo templateId, lo necesitamos para join)
    const devices = await Device.find(
      { userId, firmwareType: 'wanomi-sim' },
      { dId: 1, name: 1, siteId: 1, templateName: 1, templateId: 1, _id: 0 }
    ).lean();

    // 2. Cargar templates únicos en una sola query
    const templateIds = [...new Set(devices.map(d => d.templateId).filter(Boolean))];
    const templates = await Template.find(
      { _id: { $in: templateIds }, userId }
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
      templateName: d.templateName,
      templateWidgets: widgetsByTemplateId[d.templateId?.toString()] || [],
    }));

    return res.json({ status: 'success', data: enriched });
  } catch (error) {
    return internalError(res, error);
  }
});

// ────────── GET /scenarios ────────────────────────────────────────
router.get('/simulator/scenarios', checkAuth, (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  return res.json({ status: 'success', data: VALID_SCENARIOS });
});

// ────────── POST /trigger ─────────────────────────────────────────
// Body: { dId, sensor, value?, duration_ms? }
router.post('/simulator/trigger', checkAuth, async (req, res) => {
  if (!isApiEnabled()) return notFound(res);
  try {
    const userId = req.userData._id;
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

    // Resolver device + template
    const { device, template } = await resolveDeviceAndTemplate(userId, dId);

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
    const userId = req.userData._id;
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

    const { device, template } = await resolveDeviceAndTemplate(userId, dId);

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
    const userId = req.userData._id;
    const body = req.body || {};
    const { dId, name } = body;

    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId');
    }
    if (typeof name !== 'string' || !VALID_SCENARIOS.includes(name)) {
      return badRequest(res, `Invalid scenario name. Valid: ${VALID_SCENARIOS.join(', ')}`);
    }

    // Validar que el device existe
    const device = await Device.findOne({ userId, dId, firmwareType: 'wanomi-sim' }).lean();
    if (!device) {
      return res.status(404).json({ status: 'error', error: 'Simulated device not found' });
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
    const userId = req.userData._id;
    const body = req.body || {};
    const { dId } = body;

    if (!isValidDId(dId)) {
      return badRequest(res, 'Invalid or missing dId');
    }

    const device = await Device.findOne({ userId, dId, firmwareType: 'wanomi-sim' }).lean();
    if (!device) {
      return res.status(404).json({ status: 'error', error: 'Simulated device not found' });
    }

    const command = { command: 'reset' };
    await publishCommand(dId, command);
    return res.json({ status: 'success', dId });

  } catch (error) {
    return internalError(res, error);
  }
});

module.exports = router;
