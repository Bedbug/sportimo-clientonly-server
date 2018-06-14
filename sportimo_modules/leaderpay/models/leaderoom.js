'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var leaderoom = {
    game_id: {type: String},
    
    // Partitipants in room. 'All' if empty and passing conditions.
    players: [{type:String}],
    
    minparticipants: Number,
    
    maxparticipants: Number,
    
    // prizetype: "Prizetype.Gift | Prizetype.Pool"
    prizetype:{type:String},
    
    // Entry fee is in USD currency. Only applicable if Prizetype.Pool 
    // Used in Pool calculations
    entryfee: Number,
    
    // Only applicable to Prizetype.Gift 
    // prizes: [{rank:1, img:"http:imagesomewhere.png, title: {en:"Hurray!"}, text:{en:"Reward text. Yay!"}"}]
    prizes: [Schema.Types.Mixed],
    
    // conditions: [{ condition: "Country", value:["GR","UK","SA"]}, {condition: "Age", value:["17"]}]
    conditions: [Schema.Types.Mixed],
    
    created: {type: Date, default: Date.now}
};

var leaderoomSchema = new Schema(leaderoom);

module.exports = mongoose.model('leaderoom', leaderoomSchema);
