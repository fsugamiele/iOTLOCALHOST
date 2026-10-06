'use strict';
// DEC-REF-134 — writer idempotente de hallazgos (contrato §4). Lo usan TODOS los checks
// (Capa B/C) para no reinventar el upsert ni colisionar. Idempotente por (type, ruleId, dId):
// agrega count/lastSeen en vez de duplicar un hallazgo recurrente. Normaliza null para que la
// clave sea estable. NO toca `status` en update → un hallazgo 'muted'/'ack' por el admin
// conserva su estado (el silenciado NO se re-abre solo); las transiciones de status son del
// API de lectura (bloque 140). El check DEBE deduplicar por (type,ruleId,dId) dentro de UNA
// corrida (llamar upsert una vez por hallazgo distinto), no una vez por lectura observada.
const QualityFinding = require('../../app/api/models/quality_finding');

async function upsertFinding(f) {
  if (!f || !f.type || !f.severity || !f.layer) throw new Error('upsertFinding: faltan type/severity/layer');
  const key = { type: f.type, ruleId: f.ruleId || null, dId: f.dId || null, variable: f.variable || null };
  const now = f.lastSeen || new Date();
  return QualityFinding.findOneAndUpdate(key, {
    $set: {
      severity: f.severity,
      layer: f.layer,
      packId: f.packId || null,
      siteCode: f.siteCode || null,
      evidence: f.evidence != null ? f.evidence : null,
      suggestedAction: f.suggestedAction || '',
      lastSeen: now,
    },
    $inc: { count: 1 },
    $setOnInsert: { firstSeen: now, status: 'open' },
  }, { upsert: true, new: true, setDefaultsOnInsert: true });
}

module.exports = { upsertFinding };
