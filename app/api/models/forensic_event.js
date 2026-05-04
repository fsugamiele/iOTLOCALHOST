import mongoose from 'mongoose';
import crypto from 'crypto';

const Schema = mongoose.Schema;

export const EVENT_KINDS = [
  // Seguridad (SEC)
  'DOOR_OPEN', 'GROUND_LOOP_LOST', 'PIR_MOTION', 'CABINET_OPEN',
  'BATTERY_TAG_MISSING', 'TOWER_VIBRATION', 'FENCE_VIBRATION',
  // Grupo electrógeno (GEN)
  'GENSET_START_FAIL', 'FUEL_LOW', 'FUEL_SIPHON', 'TEMP_HIGH',
  'VIBRATION_ANOMALY', 'BATTERY_VOLTAGE_LOW',
  // Sistema
  'DEVICE_ONLINE', 'DEVICE_OFFLINE', 'CONFIG_CHANGED'
];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const GENESIS_HASH = 'GENESIS';

const forensicEventSchema = new Schema({
  userId:    { type: String, required: [true] },
  siteId:    { type: String, required: [true] },
  deviceId:  { type: String, required: [true] },
  eventKind: { type: String, required: [true], enum: EVENT_KINDS },
  severity:  { type: String, required: [true], enum: SEVERITIES },
  payload:   { type: Object, default: {} },
  timestamp: { type: Number, required: [true] },
  prevHash:  { type: String, required: [true] },
  hash:      { type: String }
});

// Hash auto-calculado: el modelo garantiza que ningún evento se persiste
// sin hash íntegro sobre sus propios datos. El prevHash debe venir provisto
// por el dispatcher (que serializa inserciones por site para evitar
// race conditions en la cadena).
forensicEventSchema.pre('validate', function(next) {
  if (this.isNew) {
    const secret = process.env.FORENSIC_HMAC_SECRET;
    if (!secret) {
      return next(new Error('FORENSIC_HMAC_SECRET not configured'));
    }
    const data = [
      this.siteId,
      this.deviceId,
      this.eventKind,
      this.severity,
      JSON.stringify(this.payload || {}),
      this.timestamp,
      this.prevHash
    ].join('|');
    this.hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
  }
  next();
});

// Inmutabilidad: una vez creado, no se puede modificar.
forensicEventSchema.pre('save', function(next) {
  if (!this.isNew) {
    return next(new Error('ForensicEvent is immutable — modification rejected'));
  }
  next();
});

// Helper estático para validar la cadena al exportar peritajes.
// Recibe un array de eventos ordenados por timestamp ascendente (de un site)
// y retorna { valid: bool, brokenAt: index | null }.
forensicEventSchema.statics.verifyChain = function(events) {
  const secret = process.env.FORENSIC_HMAC_SECRET;
  if (!secret) throw new Error('FORENSIC_HMAC_SECRET not configured');
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
    }
    const data = [
      e.siteId, e.deviceId, e.eventKind, e.severity,
      JSON.stringify(e.payload || {}), e.timestamp, e.prevHash
    ].join('|');
    const expectedHash = crypto.createHmac('sha256', secret).update(data).digest('hex');
    if (e.hash !== expectedHash) {
      return { valid: false, brokenAt: i, reason: 'hash mismatch' };
    }
    expectedPrev = e.hash;
  }
  return { valid: true, brokenAt: null };
};

forensicEventSchema.index({ siteId: 1, timestamp: -1 });

const ForensicEvent = mongoose.model('ForensicEvent', forensicEventSchema);

export default ForensicEvent;
