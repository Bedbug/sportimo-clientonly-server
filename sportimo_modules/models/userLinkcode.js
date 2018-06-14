'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.userlinkcodes)
    module.exports = mongoose.models.userlinkcodes;
else {
    var fields = {
        userId: {
            type: String,
            required: true,
            ref: 'users'
        },
        createdAt: {
            type: Date,
            default: Date.now,
            required: true
        },
        code: {
            type: String,
            required: true
        }
    };

    var schema = new Schema(fields);

    module.exports = mongoose.model('userlinkcodes', schema);
}
