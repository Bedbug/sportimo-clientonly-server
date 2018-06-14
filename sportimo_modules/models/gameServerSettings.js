'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
  
if (mongoose.models.gameserversettings)
    module.exports = mongoose.models.gameserversettings;
else {
    var gameServerSetting = new mongoose.Schema({
        pushNotifications: {
            E1: Boolean,
            E2: Boolean,
            R1: Boolean,
            R2: Boolean,
            R3: Boolean,
            R4: Boolean,
            E6: Boolean,
            G1: Boolean,
            G2: Boolean,
            G3: Boolean,
            G4: Boolean,
            G5: Boolean,
            G6: Boolean,
            G7: Boolean,
            G8: Boolean
        },
        scheduledTasks: [{
                competitionId: String,
                season: String,
                cronPattern: String,
                isDeleted: Boolean,
                parser: String
        }]
    });

    module.exports = mongoose.model("gameserversettings", gameServerSetting);
}