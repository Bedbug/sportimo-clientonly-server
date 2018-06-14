// Module dependencies.
var express = require('express'),
router = express.Router(),
question = require('../apiObjects/favQuestion'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.questions = function (req, res) {
	var skip=null,limit=10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	question.getAllQuestions(skip,limit,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};


// POST
api.addquestion = function (req, res) {
	question.addQuestion(req.body,function	(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
            res.status(500).json(err);
        }
		else {
			res.status(201).json(data);
		}
	});	
};


// GET
api.question = function (req, res) {
	var id = req.params.id;
	question.getQuestion(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editQuestion = function (req, res) {
	var id = req.params.id;

	return question.editQuestion(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated question");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
		return res.status(200).json(data);   
	});

};

// DELETE
api.deleteQuestion = function (req, res) {
	var id = req.params.id;
	return question.deleteQuestion(id, function (err, data) {
		if (!err) {
			l.p("removed question");
			return res.status(204).send();
		} else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllQuestions = function (req, res) {
	return question.deleteAllQuestions( function (err, data) {
		if (!err) {
			l.p("removed All question");
			return res.status(204).send();
		} else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/


router.post('/v1/questions/favorites',api.addquestion);

router.route('/v1/questions/favorites/:id')
.get(api.question)
.put(api.editQuestion)
.delete(api.deleteQuestion);


router.route('/v1/questions/favorites')
.get(api.questions);

router.get('/questions/test',function(res,res){
	return question.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
