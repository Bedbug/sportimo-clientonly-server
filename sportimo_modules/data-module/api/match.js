// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    Matches = mongoose.models.scheduled_matches,
    Questions = mongoose.models.questions,
    Answers = mongoose.models.answers,
    Scores = mongoose.models.scores,
    UserGamecards = mongoose.models.userGamecards,
    _ = require('lodash'),
    logger = require('winston'),
    api = {};



// GET
api.item = function (req, res) {
    var gameid = req.params.gameid;
    var userid = req.params.userid;

    var trimBy = req.params.trimby;
    
    var game = {
        userScore: 0,
        questions: [],
        playedCards: []
    };

    if (trimBy && trimBy === "gamecards"){
     
        return Scores.find({ game_id: gameid, user_id: userid }, function (err, result) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }

            if (result[0]) {
                game.userScore = result[0].score;
                if (result[0].prize_eligible)
                    game.prize_eligible = result[0].prize_eligible;

            }

            UserGamecards.find({ matchid: gameid, userid: userid }, function (cardsError, userCards) {
                if (cardsError) {
                    logger.log('error', cardsError.stack, req.body);
                    return res.status(500).json(cardsError);
                }

                if (userCards) {
                    // Translate each userGamecard document into a filtered DTO version
                    game.playedCards = _.map(userCards, function (userCard) {
                        return TranslateUserGamecard(userCard);
                    });
                }

                return res.status(200).json(game);
            });
        });
    }else

    // Return full match data
    return Matches.findById(gameid)
        .select('home_team away_team home_score away_score time isTimeCounting stats timeline start settings completed state headtohead guruStats')
        .populate('home_team', 'name logo stats')
        .populate('away_team', 'name logo stats')
        .exec(function (err, match) {
            if (!err) {
                // Assign the data if everything is ok
                game.matchData = match;
                // Now lets get the questions for the match
                Questions.find({ matchid: gameid }, function (err, questions) {
                    if (!err) {
                        // And the answers
                        Answers.find({ userid: userid, matchid: gameid }, function (err, answers) {
                            // Now that we have both we should marry them
                            _.each(questions, function (question) {
                                var answer = _.find(answers, function (o) {
                                    return o.questionid == question._id
                                });
                                if (answer) {
                                    question.userAnswer = answer.answerid;
                                }
                            })

                            game.questions = questions;

                            Scores.find({ game_id: gameid, user_id: userid }, function (err, result) {
                                if (err) {
                                    logger.log('error', err.stack, req.body);
                                    return res.status(500).json(err);
                                }

                                if (result[0]) {
                                    game.userScore = result[0].score;
                                    if (result[0].prize_eligible)
                                        game.prize_eligible = result[0].prize_eligible;

                                }

                                UserGamecards.find({ matchid: gameid, userid: userid }, function (cardsError, userCards) {
                                    if (cardsError) {
                                        logger.log('error', cardsError.stack, req.body);
                                        return res.status(500).json(cardsError);
                                    }

                                    if (userCards) {
                                        // Translate each userGamecard document into a filtered DTO version
                                        game.playedCards = _.map(userCards, function (userCard) {
                                            return TranslateUserGamecard(userCard);
                                        });
                                    }

                                    if(game && game.matchData)
                                    game.matchData.server_time = Date.now();

                                    return res.status(200).json(game);
                                });
                            })

                        });

                    }
                })



            } else {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
        });

};


var TranslateUserGamecard = function (userGamecard) {
    var retValue = {
        id: userGamecard.id || null,
        userid: userGamecard.userid || null,
        matchid: userGamecard.matchid || null,
        gamecardDefinitionId: userGamecard.gamecardDefinitionId || null,
        title: userGamecard.title || null,
        image: userGamecard.image || null,
        text: userGamecard.text || null,
        minute: userGamecard.minute || 0,
        segment: userGamecard.segment || 0,
        primaryStatistic: userGamecard.primaryStatistic || null,
        cardType: userGamecard.cardType || null,
        isDoubleTime: userGamecard.isDoubleTime || false,
        isDoublePoints: userGamecard.isDoublePoints || false,
        status: userGamecard.status || 0,
        specials: userGamecard.specials
    };



    if (userGamecard.startPoints)
        retValue.startPoints = userGamecard.startPoints;
    if (userGamecard.endPoints)
        retValue.endPoints = userGamecard.endPoints;
    if (userGamecard.pointsPerMinute)
        retValue.pointsPerMinute = userGamecard.pointsPerMinute;

    if (userGamecard.activationLatency)
        retValue.activationLatency = userGamecard.activationLatency;
    if (userGamecard.pointsAwarded)
        retValue.pointsAwarded = userGamecard.pointsAwarded;
    if (userGamecard.duration)
        retValue.duration = userGamecard.duration;
    if (userGamecard.optionId)
        retValue.optionId = userGamecard.optionId;
    if (userGamecard.maxUserInstances)
        retValue.maxUserInstances = userGamecard.maxUserInstances;
    if (userGamecard.creationTime)
        retValue.creationTime = userGamecard.creationTime;
    if (userGamecard.activationTime)
        retValue.activationTime = userGamecard.activationTime;
    if (userGamecard.terminationTime)
        retValue.terminationTime = userGamecard.terminationTime;
    if (userGamecard.wonTime)
        retValue.wonTime = userGamecard.wonTime;

        if (userGamecard.pauseTime)
            retValue.pauseTime = userGamecard.pauseTime;
            if (userGamecard.resumeTime)
                retValue.resumeTime = userGamecard.resumeTime;

    return retValue;
};
// api.items = function(req, res) {

//     var skip = null, limit = null;
//     //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
//     var queries = {};
//     var userCountry = req.params.country;


//     var q = item.find({ $or: [{ visiblein: userCountry }, { visiblein: { $exists: false } }, { visiblein: { $size: 0 } }] });

//     q.exec(function(err, items) {

//         return res.send(items);
//     });

// };


// // ALL
// api.itemsSearch = function(req, res) {
//     var skip = null, limit = null;
//     //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
//     var queries = {};

//     if (req.body.minDate != undefined || req.body.maxDate != undefined) {
//         queries.publishDate = {};
//         if (req.body.minDate == req.body.maxDate) {
//             queries.publishDate.$eq = req.body.minDate;
//         } else {
//             if (req.body.minDate != undefined)
//                 queries.publishDate.$gte = req.body.minDate;
//             if (req.body.maxDate != undefined)
//                 queries.publishDate.$lt = req.body.maxDate;
//         }
//     }

//     if (req.body.tags != undefined)
//         queries['tags.name.en'] = { "$regex": req.body.tags, "$options": "i" };

//     if (req.body.related != undefined)
//         queries['tags._id'] = req.body.related;

//     if (req.body.type != undefined)
//         queries.type = req.body.type;

//     var q = item.find(queries);

//     if (req.body.limit != undefined)
//         q.limit(req.body.limit);

//     q.exec(function(err, items) {

//         return res.send(items);
//     });

// };

// POST
api.updateHeadToHead = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(400).json('No item Provided. Please provide valid team data.');
    }

    return Matches.findOneAndUpdate({ _id: req.params.gameid }, { headtohead: req.body }, function (err, result) {
        if (!err) {
            return res.status(200).json(result);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });



};

// api.updateVisibility = function(req, res) {

//     console.log(req.body.competitionid);


//     item.find({competitionid: req.body.competitionid}, function(err,standings) {

//         if (standings) {
//             standings.forEach(function(standing) {
//                 standing.visiblein = req.body.visiblein;
//                 standing.save(function(err, data) {
//                     if (err) {
//                         res.status(500).json(data);
//                         return;
//                     }
//                 })
//             })
//             res.status(200).send();
//         } else {
//             console.log("404");
//             res.status(404).send();
//         }
//     });


// };


// // PUT
// api.edititem = function(req, res) {
//     var id = req.params.id;
//     var updateData = req.body;
//     item.findById(id, function(err, returnedItem) {

//         if (updateData === undefined || returnedItem === undefined) {
//             return res.status(500).json("Error: Data is not correct.");
//         }

//         returnedItem.photo = updateData.photo;
//         returnedItem.tags = updateData.tags;
//         areturnedItemrt.publishDate = updateData.publishDate;
//         returnedItem.type = updateData.type;
//         returnedItemart.publication = updateData.publication;
//         // art.markModified('tags');

//         return returnedItem.save(function(err, data) {
//             if (!err) {
//                 return res.status(200).json(data);
//             } else {
//                 return res.status(500).json(err);
//             }
//         }); //eo team.save
//     });// eo team.find


// };

// // DELETE
// api.deleteitem = function(req, res) {
//     var id = req.params.id;

// };



/*
=====================  ROUTES  =====================
*/

router.route('/v1/data/match/:gameid/user/:userid/')
    .get(api.item);

router.route('/v1/data/match/:gameid/user/:userid/:trimby')
    .get(api.item);

router.route('/v1/data/match/:gameid/headtohead')
    .post(api.updateHeadToHead);
// router.post('/v1/data/standings', api.additem);

// router.post('/v1/data/standings/visibility', api.updateVisibility);

// router.route('/v1/data/standings/country/:country')
//     .get(api.items);


// router.route('/v1/data/standings/:id')
//     .get(api.item)
//     .put(api.edititem)
//     .delete(api.deleteitem);

module.exports = router;
