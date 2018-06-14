/**
 * Stats modification Model
 *
 * @description :: Stat modifications are used in order to register changes
 * in the stats of a game. With their use we are able to handle changes to
 * user's score or pickaup where we left in the case that a server might 
 * crash.
 * 
 */

'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;


if (mongoose.models.statsMod)
    module.exports = mongoose.models.statsMod;
else {
    var statsMod = new mongoose.Schema({
        match_id: String,
        stat_for: String,
        stat: String,
        by: Number,
        was: Number,
        is: Number,
        segment: Number,
        linked_event: String,
        created: Date
    });

    module.exports = mongoose.model("statsMod", statsMod);
}
