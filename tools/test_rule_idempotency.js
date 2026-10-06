'use strict';
// DEC-REF-126 — test permanente de idempotencia del editor-frase.
// Por cada regla sentence-editable de cada pack sembrado:
//   sentenceToRule(ruleToSentence(r), pack, r, idx)  ≡  r   (campos evaluativos)
// 0 diffs = verde. Correr en el contenedor `node` (tiene @babel + los módulos):
//   docker exec -i node node < tools/test_rule_idempotency.js
const APP = process.env.APP_DIR || '/home/node/app';
require(APP + '/node_modules/@babel/register')({
  presets: [[APP + '/node_modules/@babel/preset-env', { targets: { node: 'current' } }]],
  cwd: APP,
});
require(APP + '/node_modules/dotenv').config({ path: APP + '/.env' });
const { MongoClient } = require(APP + '/node_modules/mongodb');
const mongoose = require(APP + '/node_modules/mongoose');
const RDSchema = require(APP + '/api/models/rule_definition.js');
const RD = mongoose.models.RDIdemTest || mongoose.model('RDIdemTest', RDSchema);
const { ruleToSentence, sentenceToRule, isSentenceEditable } = require(APP + '/components/rules/ruleSentence.js');

// Normalizar por el SCHEMA (lo que el PUT realmente guarda): aplica defaults a
// ambos lados → el ruido null-vs-default desaparece y solo quedan diffs REALES.
function sd(x) { const o = new RD(x).toObject({ versionKey: false, minimize: false, depopulate: true }); delete o._id; return o; }
const FIELDS = ['type', 'deviceType', 'variable', 'severity', 'unit', 'cooldownSec',
  'graceSec', 'resolveGraceSec', 'condition', 'crossExpr', 'window', 'mWindow', 'mParams',
  'inputs', 'setpointSource', 'fallbackToD', 'on_missing_ref', 'correlationParent',
  'escalateAfterMinutes', 'metric', 'source_filter', 'reset_behavior'];
function diffs(aRaw, bRaw) {
  const a = sd(aRaw), b = sd(bRaw), out = [];
  for (const f of FIELDS) {
    const x = JSON.stringify(a[f] === undefined ? null : a[f]);
    const y = JSON.stringify(b[f] === undefined ? null : b[f]);
    if (x !== y) out.push(`${f}: ${x} → ${y}`);
  }
  return out;
}

(async () => {
  const uri = `mongodb://${process.env.MONGO_USERNAME}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=admin`;
  const c = new MongoClient(uri, { useUnifiedTopology: true }); await c.connect();
  const packs = await c.db(process.env.MONGO_DATABASE).collection('rulepacks').find({}).toArray();
  let tested = 0, bad = 0, skipped = 0;
  for (const pack of packs) {
    for (let i = 0; i < (pack.rules || []).length; i++) {
      const r = pack.rules[i];
      if (!isSentenceEditable(r)) { skipped++; continue; }
      tested++;
      const back = sentenceToRule(ruleToSentence(r), pack, r, i);
      const d = diffs(r, back);
      if (d.length) { bad++; console.log(`\n✗ ${pack.packId} · ${r.ruleId} (${r.type}/${r.metric || ''})`); d.forEach(x => console.log('    ' + x)); }
    }
  }
  console.log(`\n── ${tested} reglas probadas · ${skipped} salteadas (no sentence-editable) · ${bad} con diffs ──`);
  console.log(bad === 0 ? 'IDEMPOTENCIA: VERDE ✓' : `IDEMPOTENCIA: ${bad} regla(s) mutadas por el round-trip`);
  await c.close(); process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(2); });
