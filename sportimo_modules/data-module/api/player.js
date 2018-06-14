// Module dependencies.
var express = require('express'),
router = express.Router(),
player = require('../apiObjects/player'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.players = function (req, res) {
	var skip=null,limit=null;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	player.getAllPlayers(skip,limit,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};


api.getPlayersByTeam = function (req, res) {

	player.getPlayersByTeam(req.params.teamid, function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// GET (search)
api.searchPlayers = function (req, res) {
    var searchTerm = req.params.searchTerm;
    var teamId = req.query.teamId;

    player.searchPlayers(searchTerm, teamId, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
}



// POST
api.addplayer = function (req, res) {
	player.addPlayer(req.body,function	(err,data){
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
api.player = function (req, res) {
	var id = req.params.id;
	player.getPlayer(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json({player: data});
		}
	}); 
};

// PUT
api.editPlayer = function (req, res) {
	var id = req.params.id;

	return player.editPlayer(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated player");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
		return res.status(200).json(data);   
	});

};

// DELETE
api.deletePlayer = function (req, res) {
	var id = req.params.id;
	return player.deletePlayer(id, function (err, data) {
		if (!err) {
			l.p("removed player");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllPlayers = function (req, res) {
	return player.deleteAllPlayers( function (err, data) {
		if (!err) {
			l.p("removed All player");
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


router.post('/v1/data/players',api.addplayer);

router.route('/v1/data/players/:id')
.get(api.player)
.put(api.editPlayer)
.delete(api.deletePlayer);

router.get('/v1/data/players/team/:teamid', api.getPlayersByTeam);

router.get('/v1/data/players/search/:searchTerm', api.searchPlayers);


router.route('/v1/data/players')
.get(api.players);
// .delete(api.deleteAllPlayers);


router.get('/players/test',function(req,res){
	return player.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
