// Module dependencies.
var express = require('express'),
router = express.Router(),
team = require('../apiObjects/team'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.teams = function (req, res) {
	var skip=null,limit=null;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	team.getAllTeams(skip,limit,function(err,data){
        if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};


// GET (search)
api.searchTeams = function (req, res) {
    var searchTerm = req.params.searchTerm;
    var competitionId = req.query.competitionId;

    team.searchTeams(searchTerm, competitionId, function(err,data){
        if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
}

// POST
api.addteam = function (req, res) {
	team.addTeam(req.body,function	(err,data){
        if (err) {
            res.status(500).json(err);
            logger.log('error', err.stack, req.body);
        }
		else {
			res.status(201).json(data);
		}
	});	
};

// GET
api.team = function (req, res) {
	var id = req.params.id;
	team.getTeam(id,function(err,data){
        if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

api.teamFull = function (req, res) {
	var id = req.params.id;
	return team.getTeamFull(id,function(err,data){
		
        if (err) {
			return res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

api.teamFavoriteData = function (req, res) {
	var id = req.params.id;
	return team.teamFavoriteData(id,function(err,data){
		
        if (err) {
			return res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
		 
	}); 
};

// PUT
api.editTeam = function (req, res) {
	var id = req.params.id;

	return team.editTeam(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated team");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
		return res.status(200).json(data);   
	});

};

// DELETE
api.deleteTeam = function (req, res) {
	var id = req.params.id;
	return team.deleteTeam(id, function (err, data) {
		if (!err) {
			l.p("removed team");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllTeams = function (req, res) {
	return team.deleteAllTeams( function (err, data) {
		if (!err) {
			l.p("removed All team");
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


router.post('/v1/data/teams',api.addteam);

router.route('/v1/data/teams/:id')
.get(api.team)
.put(api.editTeam)
.delete(api.deleteTeam);

router.get('/v1/data/teams/search/:searchTerm', api.searchTeams);

router.route('/v1/data/teams/:id/full')
.get(api.teamFull);

router.route('/v1/data/teams/:id/favorite')
.get(api.teamFavoriteData);

router.route('/v1/data/teams')
.get(api.teams);
// .delete(api.deleteAllTeams);


router.get('/teams/test',function(req,res){
	return team.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
