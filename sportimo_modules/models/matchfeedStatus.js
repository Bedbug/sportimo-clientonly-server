'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
  
if (mongoose.models.matchfeedStatuses)
    module.exports = mongoose.models.matchfeedStatuses;
else {
    var matchfeedStatus = new mongoose.Schema({
        matchid: String,
        parsed_eventids: mongoose.Schema.Types.Mixed,
        incomplete_events: mongoose.Schema.Types.Mixed,
        diffed_events: mongoose.Schema.Types.Mixed,
        parser_status: mongoose.Schema.Types.Mixed
      });

    module.exports = mongoose.model("matchfeedStatuses", matchfeedStatus);
}