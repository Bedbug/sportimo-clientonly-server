'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.knockoutStandings)
    module.exports = mongoose.models.knockoutStandings;
else {

    const matchEvent = new mongoose.Schema({
        home_team: {
            _id: { type: String, required: false },
            name: { type: Schema.Types.Mixed, required: true },
            logo: { type: String }
        },
        away_team: {
            _id: { type: String, required: false },
            name: { type: Schema.Types.Mixed, required: true },
            logo: { type: String }
        },
        start: Date,
        name: String,   // a match name generated from team names, mainly for tracing and debugging reasons
        home_score: { type: Number, default: 0 },
        away_score: { type: Number, default: 0 },
        venue: { type: Schema.Types.Mixed }
    });


    const knockoutStandingRound = new mongoose.Schema({
        name: { type: Schema.Types.Mixed, required: true },
        parserids: { type: Schema.Types.Mixed },
        events: [matchEvent]
    });


    const knockoutStanding = new Schema({
        identity: { type: String, required: true },
        season: { type: Number, required: true },
        competitionid: { type: String, ref: 'competitions' },
        rounds: [knockoutStandingRound]
    });


    knockoutStanding.index({ competitionid: 1, season: 1 }, { unique: true });


    module.exports = mongoose.model('knockoutStandings', knockoutStanding);
}