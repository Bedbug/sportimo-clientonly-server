'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


var fields = {
    userid: {
            type:String,
            ref:'users'
        },
    questionid: String,
    matchid: String,
    answerid: String,
    created: { type: Date, default: Date.now }
};


var schema = new Schema(fields);

// Ensure one answer per user
schema.index({ userid: 1, questionid: 1 }, { unique: true })

module.exports = mongoose.model('answers', schema);
