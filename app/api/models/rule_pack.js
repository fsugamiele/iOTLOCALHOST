const mongoose = require('mongoose');
const { Schema } = mongoose;
const RuleDefinitionSchema = require('./rule_definition');

const RulePackSchema = new Schema({
  packId:      { type: String, required: true, unique: true },
  deviceType:  { type: String, required: true },
  version:     { type: Number, required: true, default: 1 },
  description: { type: String, default: '' },
  canary:      { type: Boolean, default: false },
  // DEC-REF-121 (spec_interruptor_enabled) — kill-switch del pack completo. enabled:false
  // excluye el pack entero en loadPacks (siteState.js). Default true = sin migración.
  enabled:        { type: Boolean, default: true },
  disabledBy:     { type: String, default: null },
  disabledAt:     { type: Date,   default: null },
  disabledReason: { type: String, default: null },
  rules:       { type: [RuleDefinitionSchema], default: [] },
}, {
  timestamps: true,
  collection: 'rulepacks',
});

RulePackSchema.index({ deviceType: 1, canary: 1 });

module.exports = mongoose.model('RulePack', RulePackSchema);
