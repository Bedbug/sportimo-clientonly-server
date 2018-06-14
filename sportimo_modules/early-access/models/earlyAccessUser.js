// get an instance of mongoose and mongoose.Schema
var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var earlyAccessSchema = new Schema({    
    email: {
        type: String,
        required: true,
        unique: false
    },
    code: String,
  
    verified: {type:Boolean, default: false},
    email_sent: {type:Boolean, default: false}
},{
    timestamps: true
});


module.exports = mongoose.model('earlyAccessUser', earlyAccessSchema);