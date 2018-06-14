/**
 * Wildcard Model
 *
 * @description :: Mongoose model schema for a wildcard
 * 
 */
// the wildcardTemplate is a abstract template for a wildcard or for a userWildcard. It is not related with a specific match, its instantiations (through the widcard model or the userWildcard model) do.

'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.gamecardTemplates)
    module.exports = mongoose.models.gamecardTemplates;
else {
    var specialActivationLatencyType = new mongoose.Schema({
        DoublePoints: Number, 
        DoubleTime: Number
    });
    
    var optionTemplate = new mongoose.Schema({
        isVisible: Boolean,
        optionId: String,
        text: Schema.Types.Mixed,
        startPoints: Number,
        endPoints: Number,
        pointsPerMinute: Number,
        activationLatency: Number,
        duration: Number,
        specialActivationLatency: specialActivationLatencyType,
        winConditions: [Schema.Types.Mixed],
        terminationConditions: [Schema.Types.Mixed]
    }, { _id: false });


    var gamecardTemplate = new mongoose.Schema({
        isActive: Boolean,
        title: Schema.Types.Mixed, // card title
        image: Schema.Types.Mixed, // icon image
        text: Schema.Types.Mixed, // text template with placeholders: [[player]] for player name, [[team]] for team name
        primaryStatistic: String, // the primary statistic that this card is affected from, in order to be shown on the card (averages for each team)
        guruAction: String,          // Handling action of guru stats 
        // Trigger specifications
        activationLatency: Number, // seconds between the gamecard's creation and activation
        specialActivationLatency: specialActivationLatencyType, // seconds between the gamecard's special ability creation (double time, double points) and activation
        duration: Number,   // seconds between the wildcard's activation and termination
        appearConditions: [Schema.Types.Mixed], // the wildcard will appear (start its lifetime in a pending state 0) when all the conditionsToAppear are met.
        winConditions: [Schema.Types.Mixed], // the wildcard wins when all win conditions are met
        terminationConditions: [Schema.Types.Mixed], // the wildcard is terminated when any of the terminationConditions is met, or the duration is over (if not null).
        options: [optionTemplate],
        isVisible: { type: Boolean, default: true },
        // Awarded points specs
        pointsPerMinute: Number,
        startPoints: Number,
        endPoints: Number,
        cardType: { type: String, enum: ['Instant', 'Overall', 'PresetInstant'] },
    });

    module.exports = mongoose.model("gamecardTemplates", gamecardTemplate);
}
