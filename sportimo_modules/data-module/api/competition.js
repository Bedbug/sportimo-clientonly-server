// Module dependencies.
var express = require('express'),
router = express.Router(),
competition = require('../apiObjects/competition'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.competitions = function (req, res) {
	var skip=null,limit=10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	competition.getAllCompetitions(skip,limit,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// POST
api.addcompetition = function (req, res) {
	competition.addCompetition(req.body.competition,function	(err,data){
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
api.competition = function (req, res) {
	var id = req.params.id;
	competition.getCompetition(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editCompetition = function (req, res) {
	var id = req.params.id;  
	return competition.editCompetition(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated competition");        
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}	
	});

};

// DELETE
api.deleteCompetition = function (req, res) {
	var id = req.params.id;
	return competition.deleteCompetition(id, function (err, data) {
		if (!err) {
			l.p("removed competition");
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllCompetitions = function (req, res) {
	return competition.deleteAllCompetitions( function (err, data) {
		if (!err) {
			l.p("removed All competition");
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


router.post('/v1/data/competitions',api.addcompetition);

router.route('/v1/data/competitions/:id')
.get(api.competition)
.put(api.editCompetition)
.delete(api.deleteCompetition);


router.route('/v1/data/competitions')
.get(api.competitions)
.delete(api.deleteAllCompetitions);


router.get('/competitions/test',function(req,res){
	return competition.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
