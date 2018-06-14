'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema,
  ObjectId = Schema.ObjectId;

var matchevent = new mongoose.Schema({
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
    team_id: String,
    description: mongoose.Schema.Types.Mixed, // one description per language
    complete: Boolean,
    playerSelected: String,
    extrainfo: String,
    players: [mongoose.Schema.Types.Mixed],
    linked_mods: [String],
    created: { type: Date, default: Date.now }
  });

  
  
  module.exports = mongoose.model("matchEvents", matchevent);
