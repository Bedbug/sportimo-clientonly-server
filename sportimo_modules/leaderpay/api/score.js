// Module dependencies.
var express = require('express'),
router = express.Router(),
score = require('../apiObjects/score'),
l=require('../config/lib');

var api = {};
// ALL
api.scores = function (req, res) {
	var skip=null,limit=10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	score.getAllScores(skip,limit,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json({scores: data});
		}
	}); 
};

// POST
api.addscore = function (req, res) {
	score.addScore(req.body.score,function	(err,data){
		if(err) res.status(500).json(err);
		else {
			res.status(201).json(data);
		}
	});	
};

// GET
api.score = function (req, res) {
	var id = req.params.id;
	score.getScore(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json({score: data});
		}
	}); 
};

api.updateScore = function(req,res){
	score.updateScore(req.params.uid,req.params.room,req.params.points, function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json({score: data});
		}
	});
}

// PUT
api.editScore = function (req, res) {
	var id = req.params.id;

	return score.editScore(id,req.body.score, function (err, data) {
		if (!err) {
			l.p("updated score");
			return res.status(200).json(data);
		} else {
			return res.status(500).json(err);
		}
		return res.status(200).json(data);   
	});

};

// DELETE
api.deleteScore = function (req, res) {
	var id = req.params.id;
	return score.deleteScore(id, function (err, data) {
		if (!err) {
			l.p("removed score");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllScores = function (req, res) {
	return score.deleteAllScores( function (err, data) {
		if (!err) {
			l.p("removed All score");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/


router.post('/v1/scores',api.addscore);

router.get('/v1/scores/update/:uid/:room/:points',api.updateScore);

router.route('/v1/scores/:id')
.get(api.score)
.put(api.editScore)
.delete(api.deleteScore);


router.route('/v1/scores')
.get(api.scores)
.delete(api.deleteAllScores);


router.get('/scores/test',function(req,res){
	return score.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
