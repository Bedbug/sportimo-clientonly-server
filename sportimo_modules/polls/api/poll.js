// Module dependencies.
var express = require('express'),
	router = express.Router(),
	mongoose = require('mongoose'),
    polls = mongoose.models.polls,
    logger = require('winston'),
    api = {};

/*
========= [ CORE METHODS ] =========
*/
api.getAllPolls = function (req, res) {
	var q = polls.find();

	q.sort({"created":-1});

    q.exec(function (err, polls) {
		if (!err) {

			var trimmedPolls = [];
			_.each(polls, function (poll) {

				if (req.params.uid) {
					var hasAlreadyVoted = _.find(poll.voters, function (o) {
						return o.uid == req.params.uid;
					});

					if (hasAlreadyVoted) poll.hasAlreadyVoted = 1;
					poll.hasAnswered = hasAlreadyVoted.answer;
				}

				poll = poll.toObject();

				if (poll.voters)
					delete poll.voters;

				trimmedPolls.push(poll);
			})


			return res.send(trimmedPolls);
		}

		else
			return res.status(500).send(err);
    });
};


api.getGeneralPolls = function (req, res) {
	var q = polls.find({ 'tags': {$size: 0}});

	q.sort({"created":-1});

    q.exec(function (err, polls) {
		if (!err) {

			var trimmedPolls = [];
			_.each(polls, function (poll) {

				if (req.params.uid) {
					var hasAlreadyVoted = _.find(poll.voters, function (o) {
						return o.uid == req.params.uid;
					});

					if (hasAlreadyVoted){ poll.hasAlreadyVoted = 1;
					poll.hasAnswered = hasAlreadyVoted.answer;}
				}

				poll = poll.toObject();

				if (poll.voters)
					delete poll.voters;

				trimmedPolls.push(poll);
			})


			return res.send(trimmedPolls);
		}

		else
			return res.status(500).send(err);
    });
};

api.findPollByTag = function (req, res) {
	var q = polls.find({ 'tags._id': req.params.tag });

	q.sort({"created":-1});

    q.exec(function (err, polls) {
		if (!err) {

			var trimmedPolls = [];
			_.each(polls, function (poll) {

				if (req.params.uid) {
					var hasAlreadyVoted = _.find(poll.voters, function (o) {
						return o.uid == req.params.uid;
					});

					if (hasAlreadyVoted) {poll.hasAlreadyVoted = 1;
					poll.hasAnswered = hasAlreadyVoted.answer;}
				}

				poll = poll.toObject();

				if (poll.voters)
					delete poll.voters;

				trimmedPolls.push(poll);
			})


			return res.send(trimmedPolls);
		}

		else
			return res.status(500).send(err);
    });
};



// POST
api.addpoll = function (req, res) {
    var poll = new polls(req.body);
    poll.save(function (err, result) {
        if (!err)
            return res.send(result);
        else {
            logger.log('error', err.stack, req.body);
            return res.status(500).send(err);
        }

	});
};


api.uservote = function (req, res) {

	polls.findOne({ '_id': req.params.pollid }, function (err, poll) {
		if (poll){
			if (poll.status == 1)
				return res.status(200).send('Poll has been closed.');
			else {

				var hasAlreadyVoted = _.find(poll.voters, function (o) {
					return o.uid == req.body.userid;
				});

				if (hasAlreadyVoted)
					return res.status(302).send("User has alreay voted for this.");

				var answer = _.find(poll.answers, function (o) {
					return o._id == req.body.answerid;
				});

				if(!answer)
				return res.status(404).send('Answer ID not found.');

				answer.votes++;
				poll.voters.push({uid:req.body.userid, answer: req.body.answerid} );

				poll.save(function (err, result) {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        return res.status(500).send(err);
                    }
					result.hasAlreadyVoted = 1;						
					result.hasAnswered = req.body.answerid;
					return res.send(result);
				});
			}
		}else
			return res.status(404).send('Poll not found.');

	});
};



// PUT
api.editpoll = function (req, res) {
	polls.findById(req.params.pollid, function (err, poll) {

		var newData = req.body;

		if (err)
			return res.status(500).send(err);

		delete req.body._id;
		delete req.body.__v;
		
		poll.text = newData.text;
		poll.answers = newData.answers;
		poll.tags = newData.tags;
		poll = _.merge(poll, req.body);
		
		
        poll.save(function (err, result) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).send(err);
            }

            console.log(result);
            return res.send(result);
        });

	})

    // polls.findOneAndUpdate({_id:req.params.pollid},req.body,{new:true}, function (err, poll) {
	// 	if (err)
	// 		return res.status(500).send(err);

	// 	return res.send(poll);
	// })
};

// DELETE
api.deletepoll = function (req, res) {
    return polls.findById(req.params.pollid, function (err, poll) {
        return poll.remove(function (err) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).send(err);
            }
			return res.send('done');
		})

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

/*
=====================  ROUTES  =====================
*/
router.get('/v1/polls/', api.getAllPolls);
router.get('/v1/polls/general', api.getGeneralPolls);
router.get('/v1/polls/general/:uid', api.getGeneralPolls);

router.get('/v1/polls/:tag/tag', api.findPollByTag);
router.get('/v1/polls/:tag/tag/:uid/user', api.findPollByTag);

router.post('/v1/polls', api.addpoll);

router.post('/v1/polls/:pollid/vote', api.uservote);

router.route('/v1/polls/:pollid')
	.put(api.editpoll)
	.delete(api.deletepoll);

module.exports = router;
