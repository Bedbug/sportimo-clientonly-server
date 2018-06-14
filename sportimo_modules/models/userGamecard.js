// userWildcard is a wildcard definition after it has been played by a user, hence it is a wildcard instance in play.

'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    moment = require('moment');

if (mongoose.models.userGamecards)
    module.exports = mongoose.models.userGamecards;
else {
    
    var special = new mongoose.Schema({
        creationTime: Date,
        activationTime: Date,
        activationLatency: Number,
        status: { type: Number, default: 0 }    // 0: not enabled, 1: pending activation 2: activated
    });
    
    var condition = new mongoose.Schema({
       text: Schema.Types.Mixed,
       stat: String,
       target: Number,
       remaining: Number,
       teamid: String,
       playerid: String,
       comparativeTeamid: String,
       comparativePlayerid: String,
       comparisonOperator: { type: String, enum: ['gt', 'lt', 'eq']},
       startPoints: Number,
       endPoints: Number,
       pointsPerMinute: Number,
       conditionNegation: { type: Boolean, default: false }
    });
    
    var userGamecard = new mongoose.Schema({
        userid: String,
        gamecardDefinitionId: {
            type: String,
            ref: 'gamecardDefinitions'
        },
        optionId: String, // valid only if the definition includdes options.
        pointsAwarded: Number,
        pointsAwardedInitially: Number,
        matchid: String,
        title: Schema.Types.Mixed, // card title
        image: Schema.Types.Mixed, // icon image
        text: Schema.Types.Mixed,
        primaryStatistic: String, // the primary statistic that this card is affected from, in order to be shown on the card (averages for each team)
        guruAction: {type:String , default: "Sum"},          // Handling action of guru stats 
        // Trigger specifications
        minute: Number,
        segment: Number,
        activationLatency: Number,
        duration: Number,
        winConditions: [condition],
        terminationConditions: [condition],
        pointsPerMinute: Number,
        startPoints: Number,
        endPoints: Number,
        // States and state times
        cardType: { type: String, enum: ['Instant', 'Overall', 'PresetInstant']},
        maxUserInstances: Number,   // maximum number of times a user may play this card
        //remainingUserInstances: Number,
        creationTime: Date,
        activationTime: Date,
        pauseTime: Date, // when the gamecard is suspended because the current segment ends
        resumeTime: Date, // when the gamecard is resumed with the next segment start, after being paused
        terminationTime: Date,
        specials: { DoublePoints: special, DoubleTime: special },
        isDoubleTime: { type: Boolean, default: false },
        isDoublePoints: { type: Boolean, default: false },
        wonTime: Date,
        status: { type: Number, default: 0 },  // 0: pending activation, 1: active, 2: terminated (dead), 3: paused
        // finally an array of event ids that have modified this userGamecard document since its instantiation, useful for modifying its state when an event is updated/removed
        contributingEventIds: [String]
    });
    
    
    userGamecard.pre('save', function(next){
        let now = moment.utc();
    
        if (this.status == 0)   // auto-set times only if this is a new instance
        {
            if (!this.creationTime)
                this.creationTime = now.toDate();
            // if (!this.activationTime && !this.activationLatency)
            //     this.activationTime = now.add(this.activationLatency, 'ms').toDate(); // add activates_in seconds
            // if (!this.terminationTime && !this.duration)
            //     this.terminationTime = now.add(this.activationLatency, 'ms').add(this.duration, 'ms').toDate();
        }
      
        next();
    });
    
    module.exports = mongoose.model("userGamecards", userGamecard);
}