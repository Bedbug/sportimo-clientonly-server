'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

if (mongoose.models.scheduled_matches)
  module.exports = mongoose.models.scheduled_matches;
else {

  var matchEvent = new mongoose.Schema({
    match_id: String,
    parserids: mongoose.Schema.Types.Mixed, // one id per sender parser
    type: String,
    stats: mongoose.Schema.Types.Mixed,
    playerscount: Number,
    status: String,
    timeline_event: Boolean,
    state: Number,
    sender: String,
    time: Number,
    team: String,
    description: mongoose.Schema.Types.Mixed, // one description per language
    // extra info property to store general references
    extrainfo: String,
    team_id: String,
    complete: Boolean,
    playerSelected: String,
    players: [mongoose.Schema.Types.Mixed],
    linked_mods: [String],
    created: { type: Date, default: Date.now }
  });

  var segment = new mongoose.Schema({
    start: Date,
    // The time in sport time that this segment starts e.g. 46' for second half
    sport_start_time: Number,
    end: Date,
    timed: Boolean,
    text: mongoose.Schema.Types.Mixed,
    // time duration that the segment was on hold
    break_duration: Number,
    events: [matchEvent]
  });


  var moderationService = new mongoose.Schema({
    type: String,
    parserid: String,
    parsername: String,
    start: String,
    active: Boolean,
    scheduled: Boolean,
    interval: Number
  })

  var match_schema = new mongoose.Schema({
    sport: {type:String, default:'soccer'},
    home_team: {
      type: String,
      ref: 'teams'
    },
    away_team: {
      type: String,
      ref: 'teams'
    },
    start: Date,
    color: String,
    competition: {
      type: String,
      ref: 'competitions'
    },
    name: String,   // a match name generated from team names, mainly for tracing and debugging reasons
    disabled: {type: Boolean, default: true},
    donttouch: Boolean,
    visiblein: [String],
    isTimeCounting: { type: Boolean, default: false },
    home_score: {type:Number, default:0},
    away_score: {type:Number, default:0},
    match_date: Date,
    time: {type:Number, default:0},
    state: {type:Number, default:0},
    completed: {type: Boolean, default: false},
    stats: [mongoose.Schema.Types.Mixed],
    guruStats: mongoose.Schema.Types.Mixed,
    headtohead: {type:Array, default: ["W","W","D","L","L"]},
    timeline: [segment],
    settings: mongoose.Schema.Types.Mixed,
    moderation: [moderationService],
    guruStatsChecked: {type: Boolean, default: false},
    updatedAt: Date,
    createdAt: Date,
    server_time:{type:Date}
  }, {
      collection: 'scheduled_matches',
      minimize: false,
      timestamps: { updatedAt: 'updatedAt', createdAt: 'createdAt' }
    });

  module.exports = mongoose.model("scheduled_matches", match_schema);
}