'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.players)
    module.exports = mongoose.models.players;
else {
    var player = {
        name: { type: Schema.Types.Mixed },
        firstName: { type: Schema.Types.Mixed },
        lastName: { type: Schema.Types.Mixed },
        uniformNumber : { type: String },
        stats: { type: Schema.Types.Mixed },
        pic: { type: String },
        position: { type: String },
        personalData: { type: Schema.Types.Mixed },
        parserids: {  type: Schema.Types.Mixed },
        teamId: {
            type: String,
            ref: 'teams'
        },
        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };
    
    var playerSchema = new Schema(player);
    
    module.exports = mongoose.model('players', playerSchema);
}