// Module dependencies.
var express = require('express'),
	router = express.Router(),
	leaderboard = require('../apiObjects/leaderboard'),
	mongoose = require('mongoose'),
    Pools = mongoose.models.pool,
    _ = require('lodash');

var api = {};




/**
 * Returns a leaderboard based on suplied conditions
 */
api.leaderboard = function (req, res) {

    /* The conditions for the leaderboard
     * (match_id, starts, ends, contry_id) */
	var conditions = req.body;
    var skip = req.body.skip;
    var limit = req.body.limit;

	leaderboard.getLeaderboard(conditions, skip, limit, function (err, data) {
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	});
};
router.post('/v1/leaderboards', api.leaderboard);



api.leaderboardWithRank = function (req, res) {

    /* The conditions for the leaderboard
     * (match_id, starts, ends, contry_id) */

    var skip = req.body.skip;
    var limit = req.body.limit;
	if(!req.body._id) return res.status(404).json("A valid Pool Object is required in order to receive a leaderboard");
	
	leaderboard.getLeaderboardWithRank(req.params.uid, req.body, function (err, data) {
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	});
};
router.post('/v1/leaderboards/:uid', api.leaderboardWithRank);

// More simple leaderboard calls

// Get leaderboards for all players


api.allPlayersWithRank = function (req, res) {
	// first request season pools
    var querry = { roomtype: "Season", $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pools.find(querry);

    q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {

			if (_.size(pools) > 1) {
				pools = _.remove(pools, function (n) {
					return !(n.country.length == 0);
				});
			}

			var poolData = pools[0];
			leaderboard.getLeaderboardWithRank(req.params.uid, poolData, function (err, data) {
				if (err) {
					res.status(404).json(err);
				} else {
					res.status(200).json(data);
				}
			});

        }

    })
};
router.get('/v1/leaderboards/:uid/:country/allplayers', api.allPlayersWithRank);

api.matchLeaderboard = function(req,res){
	leaderboard.getMatchLeaderboard(req.params.uid, req.params.mid, function (err, data) {
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	});
}


api.allPlayersForMatchWithRank = function (req, res) {
	// first request season pools
    var querry = { gameid: req.params.mid, $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pools.find(querry);

    q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {

			if (_.size(pools) > 1) {
				pools = _.remove(pools, function (n) {
					return !(n.country.length == 0);
				});
			}

			var poolData = {}

			if (!pools[0]){
				console.log("no pools");
				poolData.conditions = { game_id: req.params.mid };
				// console.log(poolData);
			}else{
				poolData = pools[0];
				}
				
			leaderboard.getLeaderboardWithRank(req.params.uid, poolData, function (err, data) {
				if (err) {
					res.status(404).json(err);
				} else {
					res.status(200).json(data);
				}
			});

        }

    })
};
// router.get('/v1/leaderboards/:uid/:country/match/:mid', api.allPlayersForMatchWithRank);
router.get('/v1/leaderboards/:uid/:country/match/:mid', api.matchLeaderboard)

api.getMiniMatchLeaderboard = function (req, res) {
	// first request season pools
    var querry = { gameid: req.params.mid, $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pools.find(querry);

    q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {

			if (_.size(pools) > 1) {
				pools = _.remove(pools, function (n) {
					return !(n.country.length == 0);
				});
			}

			var poolData = {}

			if (!pools[0]){
				// console.log("no pools");
				poolData.conditions = { game_id: req.params.mid };
				// console.log(poolData);
			}else{
				poolData = pools[0];
				}
				
			leaderboard.getMiniMatchLeaderboard(req.params.uid, poolData, function (err, data) {
				if (err) {
					res.status(404).json(err);
				} else {
					res.status(200).json(data);
				}
			});

        }

    })
};
router.get('/v1/leaderboards/:uid/:country/match/:mid/mini', api.getMiniMatchLeaderboard);


api.FriendsWithRank = function (req, res) {

	if (!req.body.friends)
		return res.status(404).send("No friends list in the body of the request. Remember to include the user's social id also");

	var poolData =  req.body; 		
	

	leaderboard.getSocialLeaderboardWithRank(req.params.uid, poolData, null, function (err, data) {
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	});

};
router.post('/v1/leaderboards/:uid/friends', api.FriendsWithRank);


api.FriendsForMatchWithRank = function (req, res) {

 if (!req.body.friends)
		return res.status(404).send("No friends list in the body of the request. Remember to include the user's social id also");

	var poolData =  req.body; 		
	
	leaderboard.getSocialLeaderboardWithRank(req.params.uid, poolData, req.params.mid, function (err, data) {
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	});
};
router.post('/v1/leaderboards/:uid/friends/match/:mid/', api.FriendsForMatchWithRank);





api.allSponsored = function (req, res) {
	// first request season pools
    var querry = { gameid: { $exists: false }, roomtype: "Custom", $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pools.find(querry);

    q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {

			if (_.size(pools) > 1) {
				pools = _.remove(pools, function (n) {
					return !(n.country.length == 0);
				});
			}

			if (err) {
				res.status(404).json(err);
			} else {
				res.status(200).json(pools);
			}


        }

    })
};
router.get('/v1/leaderboards/:uid/:country/sponsored', api.allSponsored);


api.matchSponsored = function (req, res) {
	// first request season pools
    var querry = { gameid: req.params.mid, roomtype: "Custom", $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pools.find(querry);

	q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {

			if (_.size(pools) > 1) {
				pools = _.remove(pools, function (n) {
					return !(n.country.length == 0);
				});
			}

			if (err) {
				res.status(404).json(err);
			} else {
				res.status(200).json(pools);
			}


        }

    })
};
router.get('/v1/leaderboards/:uid/:country/sponsored/match/:mid', api.matchSponsored);



module.exports = router;