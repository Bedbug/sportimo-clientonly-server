'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var poolroom = {
    
    title: {type:Schema.Types.Mixed},
    info: {type:Schema.Types.Mixed},

    // roomtype: Season, Week, Game, Custom
    // Season And Week should always have Starting and Ending Dates, Game
    // must have a gameid and Custom must have at least one.
    roomtype: {type:String},
    
    // The atatched game id
    gameid: {type: String},
    
    // Starting and Ending Dates of the pool
    starts: {type:Date},
    ends: {type:Date},
    
    competition: { type: String},
    
    // A sponsor object containing all sponsor's information and resources
    sponsor: {type: Schema.Types.Mixed},
    
    isdefault: {type:Boolean},
    
    // Status: Open, Closed
    status: {type:String, default: "Active"},

    active: {type:Boolean, default: true},
    
    // Partitipants in room. 'All' if hasentryfee is null and passing conditions.
    players: [{type:String}],
    
    minparticipants: Number,
    
    maxparticipants: Number,

    // The number of best scores per user. If null leaderboard is somprised by all user scores.  
    bestscores: Number,

    // If bestscores is supplied, shouldUseScores returns each score used in an array. 
    shouldUseScores: Boolean,
    
    // prizetype: "Prizetype.Gift | Prizetype.Pool"
    prizetype:{type:String},
    
    // Entry fee is in USD currency. Only applicable if Prizetype.Pool 
    // Used in Pool calculations
    hasentryfee: Number,
    
    // Only applicable to Prizetype.Gift 
    // prizes: [{rank:1, img:"http:imagesomewhere.png, title: {en:"Hurray!"}, text:{en:"Reward text. Yay!"}"}]
    prizes: [{type:Schema.Types.Mixed}],
    
    // conditions: [{ condition: "Country", value:["GR","UK","SA"]}, {condition: "Age", value:["17"]}]
    country: [{type:String}],
    
    created: {type: Date, default: Date.now}
};

var poolroomSchema = new Schema(poolroom);

module.exports = mongoose.model('pool', poolroomSchema);
