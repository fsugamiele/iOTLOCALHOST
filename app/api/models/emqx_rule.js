import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const ruleSchema = new Schema({
    userId: {type: String, required: [true]},
    dId: { type: String, required: [true] },
    emqxRuleId: { type: String, required: [true] },
    variableFullName: { type: String },
    variable: { type: String },
    value: {type: Number},
    condition: { type: String },
    triggerTime: { type: Number },
    status: { type: Boolean },
    counter: { type: Number, default: 0},
    createdTime: {type: Number},
    actuatorVariable: { type: String },
    actuatorVariableFullName: { type: String },
    actuatorValue: { type: Number }
});

const Rule = mongoose.model('Rule', ruleSchema);

export default Rule;
