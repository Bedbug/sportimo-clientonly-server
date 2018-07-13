'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var fields = {
    user_id: { type: String },
    pic: { type: String },
    user_name: { type: String },
    game_id: { type: String },
    score: { type: Number, default: 0 },
    prize_eligible: Boolean,
    country: { type: String },
    competition: { type: String },
    level: { type: Number, default: 0 },
    match_date: {type:Date},
    created: { type: Date, default: Date.now },
    lastActive: { type: Date }
};

var scoreSchema = new Schema(fields,
    {
        timestamps: { updatedAt: 'lastActive', createdAt: 'created' }
    });


//scoreSchema.index({ lastActive: -1 });
scoreSchema.index({ user_id: 1, game_id: 1 });

scoreSchema.statics.AddPoints = function (uid, room, points, m_date, cb) {


    // return mongoose.model('users').findById(uid, function (err, user) {

    //     if (err || !user) {
    //         if (cb)
    //             return cb(err, "User not found");
    //     }

    //     var userdata = {
    //         pic: user.picture,
    //         user_name: user.username,
    //         competition: match.competition,
    //         country: user.country
    //     }
    //     if (user.level)
    //         userdata.level = user.level;

    //     if (user) {
    //         return mongoose.model('scores').findOneAndUpdate({ game_id: room, user_id: uid },
    //             score,
    //             { upsert: true, safe: true, new: true },
    //             function (err, result) {
    //                 return mongoose.model('scores').findOneAndUpdate({ game_id: room, user_id: uid },
    //                     { $inc: { score: points } },
    //                     { upsert: true, new: true },
    //                     function (err, result) {
    //                         if (err)
    //                             console.log(err);

    //                         if (cb)
    //                             return cb(err, result);
    //                     });
    //             });
    //     }
    // });




    return mongoose.model('scores').findOneAndUpdate({ game_id: room, user_id: uid },
        { $inc: { score: points },  match_date: m_date },
        { upsert: true, new: true },
        function (err, result) {
            if (err)
                console.log(err);
                        
            // Safe guard empty leaderboard [SPI-282]
            if (!result.user_name) {
              
                mongoose.model('users').findById(uid, function (err, user) {                                      
                    if (err) {
                        console.error(err.stack);
                    }
                    else if (!user) {
                        console.error('Failed to locate user ' + uid + ' in order to update its score in room ' + room);
                    }
                    else {
                        var score = {
                            pic: user.picture,
                            user_name: user.username,
                            country: user.country
                        };
                        if (user.level)
                            score.level = user.level;

                        if (user) {
                            mongoose.model('scores').findOneAndUpdate({ game_id: room, user_id: uid },
                                score,
                                { upsert: true, safe: true, new: true },
                                function (err, result) {
                                    console.log("Updated erroneus leaderboard entry for: " + uid);
                                });
                        }
                    }
                });
            }

            if (cb)
                return cb(err, result);
        });
}

// Internal method used by sockets subscribe
scoreSchema.statics.AddLeaderboardEntry = function (uid, room) {
    mongoose.model('users').findById(uid, function (err, user) {
        if (user) {
            mongoose.model('scores').findOneAndUpdate({ game_id: room, user_id: uid },
                {
                    user_id: user._id,
                    pic: user.picture,
                    user_name: user.username,
                    game_id: room,
                    country: user.country,
                },
                { upsert: true },
                function (err, result) {
                    if (err)
                        console.log(err);
                });
        }
    });


}

module.exports = mongoose.model('scores', scoreSchema);
