'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.taunts)
    module.exports = mongoose.models.taunts;
else {
    var fields = {
        type: { type: String },
        term: { type: String},
        imgurl: { type: String },
        sprite: { type: String },
        text: { type: mongoose.Schema.Types.Mixed },
        animation: { type: String }
    };

    var schema = new Schema(fields);

    module.exports = mongoose.model('taunts', schema);
}
