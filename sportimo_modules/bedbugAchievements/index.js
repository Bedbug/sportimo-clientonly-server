var mongoose = require('mongoose'),
    _ = require('lodash'),
    async = require('async'),
    logger = require('winston');

var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');

Handler = { Reward: {} };

/**
 * Achievement: persist_gamer
 * This achievement rewards players when they are active
 * at the end of the game.
 */
Handler.Reward.persist_gamer = function (matchid, callback) {
    mongoose.models.useractivities.find({ room: matchid, isPresent: true })
        .exec(function (err, users) {
            if (!users) {
                if (callback)
                    return callback(null);
                else
                    return;
            }

            async.eachLimit(users, 500, (user, cbk) => {
                return mongoose.models.users.addAchievementPoint(user.user, { uniqueid: 'persist_gamer', value: 1 }, cbk);
            }, () => {
                if (callback)
                    callback(null);
                else
                    return;
            });
        });
}



/**
 * Achievement: update_achievement
 * This method updates the current achievement points for a specific user achievement in the user document
 */
Handler.Reward.update_achievement = function (userId, achievementUId, achievementQuantity, callback) {
    return mongoose.models.users.addAchievementPoint(userId, { uniqueid: achievementUId, value: achievementQuantity }, callback);
}


/**
 * Achievement: rank_achievements
 * This method rewards players for their rank position
 */
Handler.Reward.rank_achievements = function (matchid, outerCallback) {
    console.log("Calculating and sending rank achievements");
    async.waterfall([
        // First we must find all leaderboards for the matchid
        function (callback) {
            var p = mongoose.models.pool.find({ gameid: matchid });
            p.exec(callback);
        },
        function (pools, callback) {
            mongoose.models.gameserversettings.findOne({}, (mongoErr, settings) => {
                if (mongoErr)
                    return callback(mongoErr);

                return callback(null, pools, settings);
            });
        },
        function (pools, settings, callback) {
            mongoose.models.scheduled_matches
                .findById(matchid, '_id disabled start home_team away_team home_score away_score')
                .populate('_id home_team away_team', 'name')
                .exec((mongoErr, match) => {
                    if (mongoErr)
                        return callback(mongoErr);

                    if (!match)
                        return callback(new Error(`Match id ${matchid} is not found`));

                    return callback(null, pools, settings, match);
                });
        },
        // Get all leaderboards from match pools, assign arrays with player positions
        function (pools, serverSettings, match, callback) {
            var top1s = [];
            var top10s = [];
            var top100s = [];
            var loosers = [];

            var pushNotifications = serverSettings.pushNotifications;

            if (pools.length == 0) 
                pools[0] = { game_id: matchid };

            var matchName = { en: '', ar: '' };

            if (match.home_team && match.home_team.name && match.home_team.name.en)
                matchName.en += match.home_team.name.en;
            else matchName.en += 'Home team';
            matchName.en += ' ' + match.home_score + ' - ' + match.away_score + ' ';
            if (match.away_team && match.away_team.name && match.away_team.name.en)
                matchName.en += match.away_team.name.en;
            else matchName.en += 'Away team';

            if (match.home_team && match.home_team.name && match.home_team.name.ar)
                matchName.ar += match.home_team.name.ar;
            else matchName.ar += 'Home team';
            matchName.ar += ' ' + match.home_score + ' - ' + match.away_score + ' ';
            if (match.away_team && match.away_team.name && match.away_team.name.ar)
                matchName.ar += match.away_team.name.ar;
            else matchName.ar += 'Away team';

            var poolsCount = pools.length;
            return async.eachLimit(pools, 500, function (pool, poolCbk) {

                var parsedPool = parseConditons(pool);
                var q = mongoose.models.scores.aggregate({
                    $match: parsedPool
                });

                q.sort({ score: -1 });
                var usersCount = 0;

                q.exec(function (err, leaderboard) {
                    if (err)
                        console.log(err);
                    if (!leaderboard || leaderboard.length == 0)
                        return poolCbk(null);

                    // return async.eachOfSeries(leaderboard, (user, usersCount, userCbk) => {
                    return async.eachSeries(leaderboard, function (user, userCbk) {

                        // Update Best Rank for User
                        mongoose.models.users.updateRank(user.user_id, { rank: (usersCount + 1), matchid: matchid }, function (err, result) {
                            if (err) {
                                console.log(err);
                            }
                            else {
                                if (usersCount == 0 && user.score > 0) {
                                    //MessagingTools.sendPushToUsers(user.user_id, { en: `Congratulation!\n You ranked #${usersCount + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                    top1s.push(user.user_id.toString());
                                }
                                if (usersCount > 0 && usersCount < 10 && user.score > 0) {
                                    //MessagingTools.sendPushToUsers(user.user_id, { en: `Congratulation!\n You ranked #${usersCount + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                    top10s.push(user.user_id.toString());
                                }
                                if (usersCount >= 10 && usersCount < 100 && user.score > 0) {
                                    //MessagingTools.sendPushToUsers(user.user_id, { en: `You ranked #${usersCount + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                    top100s.push(user.user_id.toString());
                                }
                                if (usersCount >= 100 && user.score > 0) {
                                    //MessagingTools.sendPushToUsers(user.user_id, { en: `You won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                    loosers.push(user.user_id.toString());
                                }

                                if (usersCount >= 0 && usersCount < 3 && user.score > 0) {
                                    var msgG5 = {
                                        en: `Congrats! You ranked #${usersCount + 1} and won ${user.score} points in ${matchName.en}`,
                                        ar: `مبروك!
أنت في المرتبة ${usersCount + 1}  وقد كسبت ${user.score} نقطة في مباراة ${matchName.ar}`
                                    };

                                    // Send push notification to users with their rank and score.
                                    if (!match.disabled) {
                                        if (pushNotifications && pushNotifications.G5) {
                                            logger.log('info', `[${matchName.en}]: Sending leaderboard G5 notification to user: ${user.user_id}`);
                                            MessagingTools.sendPushToUsers(user.user_id, msgG5, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        }
                                    }
                                }
                                if (usersCount > 2 && usersCount < 10 && user.score > 0) {
                                    var msgG6 = {
                                        en: `You ranked #${usersCount + 1} and won ${user.score} points in ${matchName.en}`,
                                        ar: `أنت في المرتبة ${usersCount + 1}  وقد كسبت ${user.score} نقطة في مباراة ${matchName.ar}`
                                    };

                                    // Send push notification to users with their rank and score.
                                    if (!match.disabled) {
                                        if (pushNotifications && pushNotifications.G6) {
                                            logger.log('info', `[${matchName.en}]: Sending leaderboard G6 notification to user: ${user.user_id}`);
                                            MessagingTools.sendPushToUsers(user.user_id, msgG6, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        }
                                    }
                                }
                            }

                            usersCount++;

                            return userCbk(null);
                        });

                    }, poolCbk);
                });
            }, () => {
                return callback(null, top1s, top10s, top100s, loosers);
            });
        },
        function (top1s, top10s, top100s, loosers, callback) {

            var concat10s = _.concat(top1s, top10s);
            var concat100s = _.concat(concat10s, top100s);

            async.parallel([
                (cbk) => {

                    if (top1s.length > 0) {
                        async.eachLimit(top1s, 500, function (userId, innerCbk) {
                            return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'mike_drop', value: 1 }, innerCbk);
                        }, cbk);
                    }
                    else
                        return async.setImmediate(() => { cbk(null); });
                },
                (cbk) => {

                    if (concat10s.length > 0) {
                        async.eachLimit(concat10s, 500, function (userId, innerCbk) {
                            return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'top_10', value: 1 }, innerCbk);
                        }, cbk);
                    }
                    else
                        return async.setImmediate(() => { cbk(null); });
                },
                (cbk) => {

                    if (concat100s.length > 0) {
                        async.eachLimit(concat100s, 500, function (userId, innerCbk) {
                            return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'top_100', value: 1 }, innerCbk);
                        }, cbk);
                    }
                    else
                        return async.setImmediate(() => { cbk(null); });
                },
                (cbk) => {

                    if (loosers.length > 0)
                        async.eachLimit(loosers, 500, function (userId, innerCbk) {
                            return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'loosers_reward', value: 1 }, innerCbk);
                        }, cbk);
                    else
                        return async.setImmediate(() => { cbk(null); });
                }
            ], callback);

        }],
        function (err, result) {
            if (outerCallback)
                outerCallback(err, result);
        });

}


module.exports = Handler;


function parseConditons(conditions) {

    // Conditions is not a Pool Room
    if (conditions.conditions) {
        var conditions = conditions.conditions;
        if (conditions.created) {
            if (conditions.created.$gt)
                conditions.created.$gt = new Date(conditions.created.$gt);
            if (conditions.created.$gte)
                conditions.created.$gte = new Date(conditions.created.$gte);
            if (conditions.created.$lte)
                conditions.created.$lte = new Date(conditions.created.$lte);
            if (conditions.created.$lt)
                conditions.created.$lt = new Date(conditions.created.$lt);
        }
        return conditions;
    }

    var parsed_conditions = {};

    if (conditions.game_id) {
        parsed_conditions.game_id = conditions.game_id;
    }
    else if (conditions.gameid)
        parsed_conditions.game_id = conditions.gameid;
    else {
        parsed_conditions.created = {};
        if (conditions.starts)
            parsed_conditions.created.$gte = new Date(conditions.starts);
        if (conditions.ends)
            parsed_conditions.created.$lte = new Date(conditions.ends);
    }

    // if (conditions.country)
    //     if (conditions.country.length > 0 && conditions.country[0] != "All")
    //         parsed_conditions.country = { "$in": conditions.country };

    return parsed_conditions;

}