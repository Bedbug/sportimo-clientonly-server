// Module dependencies.
var mongoose = require('mongoose');
    Score = require('../../models/score'),
   Users = require('../../models/user'),
    api = {},
    _ = require('lodash');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getLeaderboard = function (conditions, skip, limit, cb) {
    var leader_conditions = parseConditons(conditions);
    
    console.log(JSON.stringify(leader_conditions));
    var q = Score.find(leader_conditions);

    if (conditions.bestscores) {
        // console.log(conditions.bestscore);
    }

    var bestscores = conditions.bestscores ? conditions.bestscores : 50;

    return q.exec(function (err, leaderboard) {
        // var result =
        //     _.chain(leaderboard)
        //         .orderBy(['user_name', 'score'], ['desc', 'desc'])
        //         .groupBy("user_id")
        //         .map(function (value, key) {
        //             var scores = _.chain(value).take(bestscores).map("score").value();
        //             var score = _.sum(scores);
        //             var leadItem = {
        //                 "_id": value[0].user_id,
        //                 "score": score,
        //                 "scores": scores,
        //                 "name": value[0].user_name,
        //                 "level": value[0].level,
        //                 "pic": value[0].pic,
        //                 "country": value[0].country
        //             }
        //             return leadItem;
        //         })
        //         .orderBy(["score"], ["desc"])
        //         .value();

        // for (var key in result)
        //     result[key].sort(function (a, b) { var x = a.DisplayName, y = b.DisplayName; return x === y ? 0 : x < y ? -1 : 1; });

        // console.log(result);
        // var rank = 1;
        // var last_score = 0;

        // _.each(result, function(userEntry){

        // })



        cbf(cb, err, Ranked(result));
    });

    // var q = Score.aggregate([
    //     {$match: leader_conditions}
    // ]);

    // q.group({
    //     _id: "$user_id",
    //     score: { $sum: "$score" },
    //     name: { $first: '$user_name' },
    //     pic: { $last: '$pic' },
    //     level: { $max: '$level' },
    //     country: { $first: '$country' }
    // });

    // if (skip != undefined)
    //     q.skip(skip * 1);

    // if (limit != undefined)
    //     q.limit(limit * 1);

    // q.sort({ score: -1 });
    // return q.exec(function (err, leaderboard) {
    //     var result = leaderboard;
    //     cbf(cb, err, result);
    // });
};

function Ranked(leaderboard) {

    var rank = 1;

    var rankedLeaderboard = [];

    var result =
        _.chain(leaderboard)
            .groupBy("score")
            .map(function (value, key) {
                var score_group = {
                    "score": parseInt(key),
                    "entries": _.orderBy(value, "level", 'desc')
                }
                return score_group;
            })
            .orderBy(["score"], ["desc"])
            .value();

    _.each(result, function (s) {
        _.each(s.entries, function (e) {
            e.rank = rank;
            rank++;
            rankedLeaderboard.push(e);
        });
    })

    return rankedLeaderboard;
}

api.getSocialLeaderboardWithRank = function (id, body, mid, cb) {

    var leader_conditions = {}
    var uid = id;

    var cond = { social_id: { $in: body.friends } };

    Users.find(cond, '_id social_id', function (err, users) {

        leader_conditions = {
            user_id: {
                $in: _.map(users, function (o) { return o._id.toString() })
            }
        }

        if (mid)
            leader_conditions.game_id = mid;

        // console.log(leader_conditions);

        var q = Score.aggregate({
            $match: leader_conditions
        });



        q.group({
            _id: "$user_id",
            score: { $sum: "$score" },
            name: { $first: '$user_name' },
            level: { $max: '$level' },
            pic: { $last: '$pic' },
            country: { $first: '$country' }
        });



        q.sort({ score: -1 });

        var rank;
        var user;
        q.exec(function (err, leaderboard) {

            if (leaderboard.length == 0)
                return cbf(cb, err, { user: {}, leaderboad: [] });

            user = _.find(leaderboard, { _id: uid });

            if (user) {
                rank = _.size(_.filter(leaderboard, function (o) {
                    if (o._id != user._id && o.score > user.score)
                        return true;
                    else
                        return false;
                }));
                user.rank = rank + 1;
            }

            var ldata = {
                user: user,
                leaderboad: leaderboard
            }
            if (body.sponsor)
                ldata["sponsor"] = body.sponsor;


            return cbf(cb, err, ldata);
        })
    })


};

api.getMatchLeaderboard = function(uid, mid, cb){
    var q = Score.find({game_id: mid});
    
    q.select('user_id user_name pic score country level');
    q.sort({ "score": "-1" });

    return q.exec(function (err, leaderboard) {

        user = _.find(leaderboard, { user_id: uid })
        if(user)
        user = user.toObject();
        else{
            console.log("Could not find user with id:"+ uid+" in leaderboard. Please investigate.")
            return cbf(cb, "Could not find user in leaderboard" , null);
        }
        
        user._id = user.user_id;
        delete user.user_id;
        user.name = user.user_name;
        delete user.user_name;
        userIndex = _.findIndex(leaderboard, { user_id: uid });
        user.rank = userIndex + 1;
        
        var result = [];
        
        result = _.map(leaderboard, function (value, key) {
            var leadItem = {
            "_id": value.user_id,
            "score": value.score,
            "name": value.user_name,
            "level": value.level,
            "pic": value.pic,
            "country": value.country
        }        

        return leadItem;
    });

        var ldata = {
            user: user,
            leaderboad: result
        }

        return cbf(cb, err, ldata);
    });

}

api.getLeaderboardWithRank = function (id, body, cb) {

    var leader_conditions = parseConditons(body);

    console.log(JSON.stringify(leader_conditions));
    // leader_conditions.score = { $gt: 0 };
    var uid = id;

    var bestscores = body.bestscores ? body.bestscores : 50;
    var shouldUseScores = body.shouldUseScores ? shouldUseScores : false;

    var rank;
    var user;

    if (body.friends) {
        var cond = { social_id: { $in: body.friends } };

        Users.find(cond, '_id social_id', function (err, users) {

            var friendUsers = _.map(users, function (o) { return o._id.toString() });

            // We add the id of the requester
            friendUsers.push(uid);

            leader_conditions["user_id"] =  {
                    $in: friendUsers // _.map(users, function (o) { return o._id.toString() })
                };
            
            
            aggregateScores();        
        });
    } else {
        aggregateScores();       
    }

    function aggregateScores(){        
         var q = Score.find(leader_conditions);
        return q.exec(function (err, leaderboard) {
            var result;

            result =
                _.chain(leaderboard)
                    .sortBy(function (value) { // sort the array descending
                        return -value.score;
                    })
                    .groupBy("user_id")
                    .map(function (value, key) {
                        var scores = _.chain(value).take(bestscores).map("score").value();
                        var score = _.sum(scores);
                        var leadItem = {
                            "_id": value[0].user_id,
                            "score": score,
                            "name": value[0].user_name,
                            "level": value[0].level,
                            "pic": value[0].pic,
                            "country": value[0].country
                        }

                        if (shouldUseScores)
                            leadItem["scores"] = scores;

                        return leadItem;
                    })
                    .sortBy(function (value) { // sort the array descending
                        return -value.score;
                    })
                    .value();


            if (result.length == 0)
                return cbf(cb, err, { user: {}, leaderboad: [] });


            // SPI-28 | Create Rankings based on Scores and then Levels
            result = Ranked(result);

            user = _.find(result, { _id: uid });

            var ldata = {
                user: user,
                leaderboad: result
            }
            if (body.sponsor)
                ldata["sponsor"] = body.sponsor;

            if (body.info)
                ldata["info"] = body.info;


            return cbf(cb, err, ldata);

        });
    }

};


api.getMiniMatchLeaderboard = function (id, body, cb) {

    var leader_conditions = parseConditons(body);
    // leader_conditions.score = { $gt: 0 };
    var uid = id;

    var rank;
    var user;

    var q = Score.find(leader_conditions);
    q.select('user_id user_name pic score level');
    q.sort({ "score": "-1" });

    return q.exec(function (err, leaderboard) {

        user = _.find(leaderboard, { user_id: uid })
        if(user)
        user = user.toObject();
        else{
            console.log("Could not find user with id:"+ uid+" in leaderboard. Please investigate.")
            return cbf(cb, "Could not find user in leaderboard" , null);
        }
        
        user._id = user.user_id;
        delete user.user_id;
        user.name = user.user_name;
        delete user.user_name;
        userIndex = _.findIndex(leaderboard, { user_id: uid });
        user.rank = userIndex + 1;

        var start = userIndex - 2;
        var count = 5;

        var end = start + count;

        var result = [];

        for (var i = start; i < end; i++) {
            if (leaderboard[i]) {
                var leadItem = leaderboard[i].toObject();
                leadItem._id = leadItem.user_id;
                delete leadItem.user_id;
                leadItem.name = leadItem.user_name;
                delete leadItem.user_name;
                leadItem.rank = i + 1;
                result.push(leadItem);
            } else {
                result.push({
                    "_id": "dummy",
                    "name": "dummy",
                    "level": 0,
                    "score": 0,
                    "rank": 0
                })
            }


        }

        user.index = _.findIndex(result, { _id: user._id });

        var ldata = {
            user: user,
            leaderboad: result
        }



        return cbf(cb, err, ldata);

    });

};

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

    if (conditions.gameid)
        parsed_conditions.game_id = conditions.gameid;
    else {
        // parsed_conditions.created = {};
        parsed_conditions.match_date = {};
        if (conditions.starts){
            parsed_conditions.match_date.$gte = new Date(conditions.starts); 
            // parsed_conditions.created.$gte = new Date(conditions.starts); 
                         //    $or: [ { created: { $gte: ISODate('2018-01-14T01:00:00.000Z')} }, { lastActive: { $gte: ISODate('2018-01-14T01:00:00.000Z')} }]  
            // parsed_conditions.$or = [ { created: { $gte: null} }, { lastActive: { $gte: null} }];   
            // parsed_conditions.$or[0].created.$gte = new Date(conditions.starts);
            // parsed_conditions.$or[1].lastActive.$gte = new Date(conditions.starts);
        }
        if (conditions.ends)
            // parsed_conditions.created.$lte = new Date(conditions.ends);
            parsed_conditions.match_date.$lte = new Date(conditions.ends);
    }
    if (conditions.country && conditions.country.length > 0 && conditions.country[0] != "All")
        parsed_conditions.country = { "$in": conditions.country };

    if (conditions.competition)
        parsed_conditions.competition = conditions.competition;

    return parsed_conditions;

}


/*
========= [ UTILITY METHODS ] =========
*/

/** Callback Helper
 * @param  {Function} - Callback Function
 * @param  {Object} - The Error Object
 * @param  {Object} - Data Object
 * @return {Function} - Callback
 */

var cbf = function (cb, err, data) {
    if (cb && typeof (cb) == 'function') {
        if (err) cb(err);
        else cb(false, data);
    }
};



module.exports = api;
