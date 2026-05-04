const colors = require('colors'); // side-effect: extends String.prototype with .red, .green, etc.

import Device        from '../models/device.js';
import ForensicEvent, { GENESIS_HASH } from '../models/forensic_event.js';

// Fail-fast: secret debe estar configurado y NO ser el placeholder.
// Sin un secret real, la cadena forense pierde valor judicial.
const _secret = process.env.FORENSIC_HMAC_SECRET;
if (!_secret) {
  throw new Error('[ForensicDispatcher] FORENSIC_HMAC_SECRET not set in env');
}
if (_secret.startsWith('change-me-')) {
  throw new Error('[ForensicDispatcher] FORENSIC_HMAC_SECRET still has placeholder value — generate a real one with: openssl rand -hex 32');
}

// ── Mapping: alarm.variable → { eventKind, severity }
// TODO Producción: migrar a lookup desde alarm.rule.forensicEventKind/Severity
//   (extendiendo emqx_alarm_rule.js). Hardcoded es solo para el piloto Claro.
const VARIABLE_MAP = {
  door_main:     { eventKind: 'DOOR_OPEN',           severity: 'HIGH'     },
  door_cabinet:  { eventKind: 'CABINET_OPEN',        severity: 'HIGH'     },
  pir_motion:    { eventKind: 'PIR_MOTION',           severity: 'MEDIUM'   },
  ground_loop:   { eventKind: 'GROUND_LOOP_LOST',     severity: 'CRITICAL' },
  fence_vib:     { eventKind: 'FENCE_VIBRATION',      severity: 'HIGH'     },
  tower_vib:     { eventKind: 'TOWER_VIBRATION',      severity: 'HIGH'     },
  battery_tag:   { eventKind: 'BATTERY_TAG_MISSING',  severity: 'CRITICAL' },
  fuel_level:    { eventKind: 'FUEL_LOW',             severity: 'MEDIUM'   },
  fuel_drop:     { eventKind: 'FUEL_SIPHON',          severity: 'CRITICAL' },
  genset_temp:   { eventKind: 'TEMP_HIGH',            severity: 'HIGH'     },
  genset_start:  { eventKind: 'GENSET_START_FAIL',    severity: 'CRITICAL' },
  genset_vib:    { eventKind: 'VIBRATION_ANOMALY',    severity: 'MEDIUM'   },
  battery_v:     { eventKind: 'BATTERY_VOLTAGE_LOW',  severity: 'MEDIUM'   },
  device_online: { eventKind: 'DEVICE_ONLINE',        severity: 'LOW'      },
  device_off:    { eventKind: 'DEVICE_OFFLINE',       severity: 'MEDIUM'   },
};

function resolveForensicMetadata(alarm) {
  return VARIABLE_MAP[alarm.variable] || null;
}

// ── Serialized per-site queue (in-memory Promise chain)
// TODO Producción: este queue es in-memory; solo serializa en
//   single-instance. Si se escala a cluster mode, migrar a lock
//   distribuido en MongoDB.
const siteQueues = new Map(); // Map<siteId, Promise>

// NOTA: el set de siteQueues es atómico respecto al event loop.
// Aunque varios dispatchForensicEvent resuelvan Device.findOne
// simultáneamente, las llamadas a enqueueForSite no se intercalan
// (single-threaded JS). No hay race condition.
function enqueueForSite(siteId, taskFn) {
  const prev = siteQueues.get(siteId) || Promise.resolve();
  const next = prev
    .then(taskFn)
    .catch(err => {
      console.log(`[ForensicDispatcher] Failed for site ${siteId}: ${err.message}`.red);
      // Chain continues — next event does its own prevHash lookup from last
      // successfully persisted event. Failed event is lost but chain stays valid.
    });
  siteQueues.set(siteId, next);
  // GC: remove entry once this is the last task and it resolves
  next.then(() => { if (siteQueues.get(siteId) === next) siteQueues.delete(siteId); });
}

async function createForensicEvent(alarm, device, meta) {
  const lastEvent = await ForensicEvent
    .findOne({ siteId: device.siteId })
    .sort({ timestamp: -1 })
    .select('hash')
    .lean();

  const prevHash = lastEvent ? lastEvent.hash : GENESIS_HASH;

  await ForensicEvent.create({
    userId:    device.userId,
    siteId:    device.siteId,
    deviceId:  device.dId,
    eventKind: meta.eventKind,
    severity:  meta.severity,
    payload: {
      value:     alarm.value,
      condition: alarm.condition,
      variable:  alarm.variable
    },
    timestamp: Date.now(),
    prevHash
  });
}

export async function dispatchForensicEvent(alarm) {
  try {
    const device = await Device.findOne({ dId: alarm.dId });
    if (!device || !device.siteId) return;

    const meta = resolveForensicMetadata(alarm);
    if (!meta) return;

    enqueueForSite(device.siteId, () => createForensicEvent(alarm, device, meta));
  } catch (err) {
    console.log('[ForensicDispatcher] Dispatch error:'.red, err.message);
  }
}
