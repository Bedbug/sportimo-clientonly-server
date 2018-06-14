// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    Poll = mongoose.models.polls,
    Users = mongoose.models.users,
    _ = require('lodash'),
    logger = require('winston'),
    api = {};


// ALL
api.polls = function (req, res) {
    var q = Poll.find({}, function (err, data) {

        if (!err) {
            return res.status(200).json(data);
        } else {
            return res.status(500).json(err);
        }
    });
}

api.getPollsByMatch = function (req, res) {
    var q = Poll.find({ matchid: req.params.mid }, function (err, data) {

        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
}

// POST
api.addpoll = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(500).json('No valid Poll Provided. Please provide valid data.');
    }

    var newItem = new Poll(req.body);

    return newItem.save(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });

};

// GET
api.poll = function (req, res) {
    var id = req.params.id;
    Poll.findById(id, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            return res.status(500).json(err);
        }
    })
};

// PUT
api.editpoll = function (req, res) {
    var id = req.params.id;
    var updateData = req.body;
    Poll.findByIdAndUpdate(id, updateData, function (err, result) {

        if (!err) {
            return res.status(200).json(result);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });// eo team.find


};

// DELETE
api.deletepoll = function (req, res) {
    var id = req.params.id;
    Poll.findByIdAndRemove(id, function (err, result) {
        if (!err) {
            return res.status(200).json(result);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    })
};

// var vote = {
// 	poll: poll_id,
// 	answer : string_id,
// 	user: user_id
// }

api.userPollVote = function (req, res) {

    if (req.body == 'undefined' || _.isEmpty(req.body)) {
        return res.status(400).json('No vote Provided. Please provide valid vote data.');
    }
    else {
        var pollid = req.body.poll;
        var answerid = req.body.answer;
        var userid = req.body.pouserll;

        Poll.findById(pollid, function (err, poll) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
            var pollanswer = _.find(poll.answers, function (eachanswer) {
                return eachanswer._id == answerid;
            })

            if (pollanswer) {
                pollanswer.voters.push(userid);
            }

            pollanswer.answered++;
            poll.save(function (err, result) {
                if (!err) {
                    return res.status(200).json(result);
                } else {
                    logger.log('error', err.stack, req.body);
                    return res.status(500).json(err);
                }
            })

        });
    }

};


/*
=====================  ROUTES  =====================
*/

router.post('/v1/data/polls/:id/vote', api.userPollVote);
router.get('/v1/data/polls/match/:mid', api.getPollsByMatch)

router.route('/v1/data/polls/:id')
    .get(api.poll)
    .put(api.editpoll)
    .delete(api.deletepoll);


router.route('/v1/data/polls')
    .get(api.polls)
    .post(api.addpoll);
    


module.exports = router;
