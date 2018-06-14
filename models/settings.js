'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.messages)
    module.exports = mongoose.models.messages;
else {
    var fields = {
        "ios_current_build_version": Number,
        "android_current_build_version": Number,
        "update_required": Boolean,
        "UseCDN": String,
        "CropCDN": String,
        "apis": mongoose.Schema.Types.Mixed,
        "hashtag": String,
        "prizes": false,
        "clientdefaults": mongoose.Schema.Types.Mixed
    };

    var schema = new Schema(fields);

    module.exports = mongoose.model('settings', schema);
}
