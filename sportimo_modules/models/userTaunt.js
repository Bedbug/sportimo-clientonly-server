'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.usertaunts)
    module.exports = mongoose.models.usertaunts;
else {
    var fields = {
        sender: {
            type: String,
            ref: 'users'
        },
        recipient: {
            type: String,
            ref: 'users'
        },
        taunt: {
            type: mongoose.Schema.Types.Mixed
        },
        created: { type: Date, default: Date.now }
    };

    var schema = new Schema(fields);

    module.exports = mongoose.model('usertaunts', schema);
}
