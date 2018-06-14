'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
     ObjectId = Schema.ObjectId;


if (mongoose.models.messages)
    module.exports = mongoose.models.messages;
else {
    var fields = {
        sender:{
            type:String,
            ref:'users'
        },
        recipients:[{
            type:String,
            ref:'users'
        }],
        img: { type: String },
        title: {type:mongoose.Schema.Types.Mixed},
        msg: {type:mongoose.Schema.Types.Mixed, required:true},
        data: {type:String},
        read: {type:Number},
        link: {type:String},
        welcome: {type: Boolean},
        created: { type: Date, default: Date.now }
    };
    
    var schema = new Schema(fields);
    
    module.exports = mongoose.model('messages', schema);
}
