// Module dependencies.
var express = require('express'),
router = express.Router(),
achievement = require('../apiObjects/achievement'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.achievements = function (req, res) {
	var skip=null, limit = 10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	achievement.getAllAchievements(skip,limit,function(err,data){
        if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// POST
api.addachievement = function (req, res) {
	achievement.addAchievement(req.body,function(err,data){
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
api.achievement = function (req, res) {
	var id = req.params.id;
	achievement.getAchievement(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editAchievement = function (req, res) {
	var id = req.params.id;

	return achievement.editAchievement(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated achievement");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});

};

// DELETE
api.deleteAchievement = function (req, res) {
	var id = req.params.id;
	return achievement.deleteAchievement(id, function (err, data) {
		if (!err) {
			l.p("removed achievement");
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllAchievements = function (req, res) {
	return achievement.deleteAllAchievements( function (err, data) {
		if (!err) {
			l.p("removed All achievement");
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/


router.post('/v1/data/achievements',api.addachievement);

router.route('/v1/data/achievements/:id')
.get(api.achievement)
.put(api.editAchievement)
.delete(api.deleteAchievement);


router.route('/v1/data/achievements')
.get(api.achievements)
.delete(api.deleteAllAchievements);


module.exports = router;
