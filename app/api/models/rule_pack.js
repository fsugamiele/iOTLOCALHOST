const mongoose = require('mongoose');
const { Schema } = mongoose;
const RuleDefinitionSchema = require('./rule_definition');

const RulePackSchema = new Schema({
  packId:      { type: String, required: true, unique: true },
  deviceType:  { type: String, required: true },
  version:     { type: Number, required: true, default: 1 },
  description: { type: String, default: '' },
  canary:      { type: Boolean, default: false },
  rules:       { type: [RuleDefinitionSchema], default: [] },
}, {
  timestamps: true,
  collection: 'rulepacks',
});

RulePackSchema.index({ deviceType: 1, canary: 1 });

module.exports = mongoose.model('RulePack', RulePackSchema);
