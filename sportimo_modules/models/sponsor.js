'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var fields = {
    company: { type: String },
    name: { type: String },
    banner: { type: String },
    video: { type: String },
    created: { type: Date, default: Date.now }
};

var sponsorSchema = new Schema(fields);

module.exports = mongoose.model('sponsors', sponsorSchema);
