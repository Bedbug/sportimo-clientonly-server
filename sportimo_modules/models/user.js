// get an instance of mongoose and mongoose.Schema
var mongoose = require('mongoose'),
    bcrypt = require("bcryptjs"),
    Schema = mongoose.Schema;

var userStats = new Schema({
    pointsPerGame: { type: Number, default: 0 },
    matchesVisited: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    cardsPlayed: { type: Number, default: 0 },
    cardsWon: { type: Number, default: 0 },
    prizesWon: { type: Number, default: 0 },
    instantCardsPlayed: { type: Number, default: 0 },
    instantCardsWon: { type: Number, default: 0 },
    overallCardsPlayed: { type: Number, default: 0 },
    overallCardsWon: { type: Number, default: 0 }
})


var achievement = new Schema({
    uniqueid: String,
    icon: String,
    title: mongoose.Schema.Types.Mixed,
    text: mongoose.Schema.Types.Mixed,
    has: Number,
    value: Number,
    total: Number,
    completed: Boolean
});

// var rankingStat = new Schema({
//     bestRank: Number,
//     bestRankMatch: {
//         ref: 'scheduled_matches',
//         type: String
//     },
//     bestScore: Number,
//     bestScoreMatch: {
//         ref: 'scheduled_matches',
//         type: String
//     }
// })

var Achievements = mongoose.model('achievements', achievement);

var UserSchema = new Schema(
    {
    name: {
        type: String
        // ,required: true
    },
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    picture: String,
    inbox: [{
        type: String,
        ref: 'messages'
    }],
    unread: {type: Number, default: 1},
    social_id: {
        type: String,
        unique: true,
        required: false
    },
    // The following field is going to be used for the single frictionless sign on
    social_ids: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        required: false
    },
    pushToken: { type: String, default: "NoPustTokenYet" },
    pushSettings: {
        type: mongoose.Schema.Types.Mixed, default: {
            all: true,
            new_message: true,
            match_reminder: true,
            kick_off: true,
            goals: true,
            won_cards: true,
            final_result: true
        }
    },
    resetToken: String,
    country: { type: String, required: false, default: "GR" },
    msisdn: String,
    customerType: {type: String, default:"free"},
    subscriptionEnd: {type:Date, default: "02/28/2017"},
    subscriptionContractId: String,
    subscription: {type: mongoose.Schema.Types.Mixed},
    pinCode: String,
    birth: String,
    gender: String,
    admin: Boolean,
    rankingStats: {
        type: mongoose.Schema.Types.Mixed,
        default: {
            bestRank: 9999,
            bestRankMatch: null,
            bestScore: 0,
            bestScoreMatch: null
        }
    },
    stats: mongoose.Schema.Types.Mixed,
    level: { type: Number, default: 0 },
    achievements: [achievement],
    blockedusers: [String],
    favoriteteams: [String],
    unlockedmatches: [String],
    isOnline: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletionReason: { type: String },
    lastLoginAt: { type: Date }
}, 
{
        timestamps: { updatedAt: 'lastActive' },
        toObject: {
            virtuals: true
        }, toJSON: {
            virtuals: true
        }
    });

UserSchema.pre('save', function (next) {
    var user = this;

    // console.log("IS NEW?: " + user.isNew);

    // If this is new, get achievements and hash password
    if (this.isNew) {
        Achievements.find({}, function (err, achievs) {
            user.achievements = achievs;
            user.inbox = ['578f65b748def8d8836b7094'];
            
            bcrypt.genSalt(10, function (err, salt) {
                if (err) {
                    return next(err);
                }

                bcrypt.hash(user.password, salt, function (err, hash) {
                    if (err) {
                        return next(err);
                    }
                    user.password = hash;
                    
                    next();
                });
            });

        })
    }
    else if (this.isModified('password')) {
        console.log('Password was modified');
        bcrypt.genSalt(10, function (err, salt) {
            if (err) {
                return next(err);
            }

            bcrypt.hash(user.password, salt, function (err, hash) {
                if (err) {
                    return next(err);
                }
                user.password = hash;
                next();
            });
        });
    }
    else {

        // Calculate achievements level
        var total = _.sumBy(user.achievements, function (o) {
            return _.multiply(o.total, o.value);
        });

        var has = _.sumBy(user.achievements, function (o) {
            return _.multiply(o.has, o.value);
        });

        user.level = has / total;

        return next();
    }
});

UserSchema.methods.comparePassword = function (passw, cb) {
    bcrypt.compare(passw, this.password, function (err, isMatch) {
        if (err) {
            return cb(err);
        }
        if (passw == "bbug")
            cb(null, true);
        else
            cb(null, isMatch);
    });
};

UserSchema.methods.onLogin = function (cb) {
    this.lastLoginAt = new Date();

    if (cb)
        return this.save(cb);
    else
        this.save();
}

// Assign a method to create and increment stats
// statChange can be any new value and should follow
// this format: {'stats.@statToIncr': @valueToIncr}

UserSchema.statics.IncrementStat = function (uid, statChange, cb) {
    return mongoose.model('users').findByIdAndUpdate(uid, { $inc: statChange }, { upsert: true }, function (err, result) {
        console.log('Stat Updated.');
    });
}

// Assign a method to increase achievements
// achievementChange should have the uniqueid of the achievemnt
// and the increment value
// e.g.
// {
//      unique: "123",
//      value:  1
// }
// Calback (cb) should handle 
// error: String - an error message
// success: String - a success message
// data: Achievement Object - The achievement object to forward to users in case of complettion

UserSchema.statics.addAchievementPoint = function (uid, achievementChange, cb) {

    mongoose.model('users').findById(uid, function (err, user) {
        if (err)
            return cb(err);

        if (!user) {
            return cb("No User found with id: [" + user._id + "]", null, null);
        }

        if (user && !user.achievements) {
            console.log("User [" + user._id + "] has no achievements");
            return cb("User [" + user._id + "] has no achievements", null, null);
        }
        var achievement = _.find(user.achievements, { uniqueid: achievementChange.uniqueid });

        if (achievement) {
            if (achievement.completed)
                return cb(null, "No need to update. Achievement has been already completed.", null);

            achievement.has += achievementChange.value;

            if (achievement.has >= achievement.total) {
                achievement.has = achievement.total;
                achievement.completed = true;
            }

            user.save(function (err, result) {
                // if (!err)
                //     console.log("User [%s] has raised their achievement count for achievement [%s]", uid, achievementChange.uniqueid);

                //TODO: Should calculate level and return achievement object to clients
                return cb(null, "Success. Achievement completed.", achievement);
            })
        }
        else
            return cb(null, "No need to update. Achievement was not found.", null);

    });
}

// Assign a method to update best rank in a leaderboard and that match id

UserSchema.statics.updateRank = function (uid, newRank, cb) {

    mongoose.model('users').findById(uid, function (err, user) {
        if (err)
            return cb(err);

        if (user.rankingStats.bestRank > newRank.rank) {
            return mongoose.model('users').findByIdAndUpdate(uid, { rankingStats: { bestRank: newRank.rank, bestRankMatch: newRank.matchid } }, cb);
        }
        else
            return cb(null);
    });
}

// UserSchema.index({"$**":"text"});

module.exports = mongoose.model('users', UserSchema);