import mongoose from 'mongoose';

const Schema = mongoose.Schema;

const emqxAuthRuleSchema = new Schema({
    userId: { type: String, required: [true] },
    dId: { type: String },
    username: { type: String, required: [true] },
    password: { type: String, required: [true] },
    publish: { type: [String] },
    subscribe: { type: [String] },
    type: { type: String, required: [true] },
    time: { type: Number },
    updatedTime: { type: Number }
});

const EmqxAuthRule = mongoose.model('EmqxAuthRule', emqxAuthRuleSchema);

export default EmqxAuthRule;     