'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.competitions)
    module.exports = mongoose.models.competitions;
else {
    var competition = {
        name: { type: Schema.Types.Mixed },
        logo: { type: String },
        parserids: { type: Schema.Types.Mixed },
        visiblein: [String],
        graphics: { type: Schema.Types.Mixed },
        season: String,
        status: {type:String},
        created: { type: Date, default: Date.now }
    };

    var competitionSchema = new Schema(competition);

    module.exports = mongoose.model('competitions', competitionSchema);
}