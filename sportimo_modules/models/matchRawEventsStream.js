'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
  
if (mongoose.models.matchRawEventsStreams)
    module.exports = mongoose.models.matchRawEventsStreams;
else {
    var matchRawEventsStream = new mongoose.Schema({
        matchid: String,
        events_time: Date, 
        all_events: mongoose.Schema.Types.Mixed
      });

    module.exports = mongoose.model("matchRawEventsStreams", matchRawEventsStream);
}