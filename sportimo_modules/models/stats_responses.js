'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
  
if (mongoose.models.matchfeedStatuses)
    module.exports = mongoose.models.matchfeedStatuses;
else {
    var statResponse = new mongoose.Schema({
        matchid: String,
        response: String
      });

    module.exports = mongoose.model("statsResponses", statResponse);
}