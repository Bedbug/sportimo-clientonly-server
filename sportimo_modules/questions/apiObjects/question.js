// Module dependencies.
var mongoose = require('mongoose'),
    Question = mongoose.models.questions,
    Answer = mongoose.models.answers,
    Scores = mongoose.models.scores,
    Users = mongoose.models.users,
    _ = require('lodash'),
    redis = require('redis'),
    api = {},
    l = require('../config/lib');

// Initialize and connect to the Redis datastore
// var redisCreds = {
//     url: 'clingfish.redistogo.com',
//     port: 9307,
//     secret: '075bc004e0e54a4a738c081bf92bc61d',
//     channel: "socketServers"
// };

var redisCreds = require('../../../config/redisConfig');

var Pub;
Pub = redis.createClient(process.env.REDIS_URL || "redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-34-247-112-146.eu-west-1.compute.amazonaws.com:6799");
// Pub.auth(redisCreds.secret, function (err) {
//     if (err) {
//         console.log("[Questions_Module]: "+err);
//     }
// });

/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllQuestions = function (skip, limit, cb) {
    var q = Question.find();

    if (skip != undefined)
        q.skip(skip * 1);

    if (limit != undefined)
        q.limit(limit * 1);

    return q.exec(function (err, questions) {
        cbf(cb, err, questions);
    });
};

api.getAllQuestionsByMatch = function (id, cb) {
    var q = Question.find({ matchid: id });

    return q.exec(function (err, questions) {
        cbf(cb, err, questions);
    });
};

// GET
api.getQuestion = function (id, cb) {

    Question.findOne({ '_id': id }, function (err, question) {
        cbf(cb, err, question);
    });
};

// POST
api.addQuestion = function (question, cb) {

    if (question == 'undefined') {
        cb('No Question Provided. Please provide valid question data.');
    }

    question = new Question(question);

    question.save(function (err) {
        // Send Event to Redis to be consumed by socket servers
        PubChannel.publish("socketServers", JSON.stringify({
            sockets: true,
            payload: {
                type: "Question_added",
                room: question.matchid,
                data: question
            }
        }
        ));

        // Wait 15 seconds the call method to notify client votes
        setTimeout(function () {
            informClientsOfAnwswers(question._id)
        }, 15000);

        cbf(cb, err, question.toObject());
    });
};

// This method is called 15" after the question creation in order to inform clients
// about the number of answers that the other users have given
var informClientsOfAnwswers = function (id) {
    Question.findOne({ '_id': id }, function (err, question) {
        if (!err)
            // Send Event to Redis to be consumed by socket servers
            PubChannel.publish("socketServers", JSON.stringify({
                sockets: true,
                payload: {
                    type: "Question_updated",
                    room: question.matchid,
                    data: question
                }
            }
            ));
    });
}

api.userAnswerQuestion = function (answer, cb) {

    if (answer == 'undefined' || _.isEmpty(answer)) {
        cb('No answer Provided. Please provide valid answer data.');
    }
    else
        Question.findOne({ '_id': answer.questionid }, function (err, question) {
            if (question.status > 0)
                cb('Question already answered by moderator.');
            else {
                _.find(question.answers, function (o) {
                    return o._id == answer.answerid;
                }).answered++;

                question.save(function (err) { });

                answer = new Answer(answer);
                answer.save(function (err) {
                    cbf(cb, err, answer.toObject());
                });
            }
        });
};



// PUT
api.editQuestion = function (id, updateData, cb) {
    Question.findById(id, function (err, question) {

        // First check change in status and user privilages
        if (updateData["admin"] == true && question["status"] == 0 && updateData["status"] == 1) {
            // then if we have a correct answer
            if (typeof updateData["correct"] != 'undefined') {
                question["status"] = updateData["status"];
                question["correct"] = updateData["correct"];

                //  Give points to all users who answered correctly (update their score and questions_answered_correctly stat)
                var pointsToGive = _.find(question.answers, function (o) { return o._id == updateData["correct"]; }).points;

                Answer.find({ questionid: question._id, answerid: updateData["correct"] }, 'userid', function (err, ids) {
                    var userids = _.map(ids, 'userid');

                    Scores.update({ match_id: question.matchid, user_id: { $in: userids } },
                        { $inc: { score: pointsToGive } },
                        { safe: true, new: true, multi: true },
                        function (err, result) {
                            if (err)
                                console.log(err);

                            //  Send Socket Event with the changes in the question
                            Pub.publish("socketServers", JSON.stringify({
                                sockets:true,
                                payload: {
                                    type: "question_answered",
                                    room: question.matchid,
                                    data: {
                                        qid:  question._id,
                                        correct: question.correct,
                                        points: pointsToGive
                                    }
                                }
                            }));
                        });

                })
            }

            //  Save status of the card in db
            return question.save(function (err) {
                cbf(cb, err, question.toObject());
            }); //eo question.save

        } else {




            if (typeof updateData["text"] != 'undefined') {
                question["text"] = updateData["text"];
            }

            if (typeof updateData["answers"] != 'undefined') {
                question["answers"] = updateData["answers"];
            }

            if (typeof updateData["matchid"] != 'undefined') {
                question["matchid"] = updateData["matchid"];
            }

            if (typeof updateData["type"] != 'undefined') {
                question["type"] = updateData["type"];
            }

            if (typeof updateData["img"] != 'undefined') {
                question["img"] = updateData["img"];
            }

            if (typeof updateData["sponsor"] != 'undefined') {
                question["sponsor"] = updateData["sponsor"];
            }

            if (typeof updateData["created"] != 'undefined') {
                question["created"] = updateData["created"];
            }


            return question.save(function (err) {
                cbf(cb, err, question.toObject());
            }); //eo question.save
        }
    });// eo question.find
};

// DELETE
api.deleteQuestion = function (id, cb) {
    return Question.findById(id, function (err, question) {
        return question.remove(function (err) {
            cbf(cb, err, true);
        });
    });
};



/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test = function (cb) {
    cbf(cb, false, { result: 'ok' });
};


api.deleteAllQuestions = function (cb) {
    return Question.remove({}, function (err) {
        cbf(cb, err, true);
    });
};






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
