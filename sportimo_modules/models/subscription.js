'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.taunts)
    module.exports = mongoose.models.subscriptions;
else {
    var fields = {
        status: { type: String }, // Elite or Pro
        userid: {
            type:String,
            ref:'users'
        },
        provider: { type: String},
        receiptid: { type: String, required: true, unique: true },
        start: { type: Date },
        end: { type: Date },
        state: { type: String, default: "inactive" }
    };

    var schema = new Schema(fields);

    module.exports = mongoose.model('subscriptions', schema);
}
