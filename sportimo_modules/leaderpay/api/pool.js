// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    Pool = mongoose.models.pool,
    moment = require('moment'),
    logger = require('winston'),
    l = require('../config/lib');
_ = require('lodash');

var api = {};

/**
 * Returns a pool based on suplied condtions
 */
api.pool = function (req, res) {

};

/**
 * Returns all pools for a specific game
 */
api.poolbygameid = function (req, res) {

    var querry = { gameid: req.params.id, $or: [{ country: { "$size": 0 } }] };

    if (req.params.country)
        querry.$or[1] = { country: req.params.country.toUpperCase() };

    var q = Pool.find(querry);

    q.exec(function (err, pools) {
        if (err) res.satus(500).send(err);
        else {
            // var uniqueArray = _.pluck(pools, 'roomtype');
            // uniqueArray = _.uniq(uniqueArray);

            var uniqueArray = ['Season', 'Week'];

            _.each(uniqueArray, function (type) {
                var poolsWithType = _.filter(pools, { roomtype: type });
                if (_.size(poolsWithType) > 1) {
                    pools = _.remove(pools, function (n) {
                        return !(n.roomtype == type && n.country.length == 0);
                    });
                }
            })

            res.status(200).send(pools);
        }

    })


};

/**
 * Returns all timed pools
 */
api.timedpools = function (req, res) {

    // if (!req.params.country)
    //     return res.status(404).send("You didn't leave the user's country code empty on purpose, did you?");

    var querry = { gameid: { "$exists": false } };

    if (req.params.country)
        querry.$or = [{ country: { "$size": 0 } }, { country: req.params.country.toUpperCase() }];

    if (req.params.shouldHavePrizes)
        querry["prizes.0"] = { "$exists": true };

    var q = Pool.find(querry);

    q.exec(function (err, pools) {
        if (err) res.status(500).send(err);
        else {
            var uniqueArray = ['Season', 'Week'];
            _.remove(pools, { roomtype: "Game" });

            if (req.params.country)
                _.each(uniqueArray, function (type) {
                    var poolsWithType = _.filter(pools, { roomtype: type });
                    if (_.size(poolsWithType) > 1) {
                        pools = _.remove(pools, function (n) {
                            return !(n.roomtype == type && n.country.length == 0);
                        });
                    }
                })

            var weekpool = _.find(pools, { roomtype: "Week" });
            if (weekpool) {
                var poolstart = moment(weekpool.starts);
                var poolends = moment(weekpool.ends);
                var now = moment.utc();

                // Disabling Weekly leaderboard
                weekpool.status ="Closed"
                res.status(200).send(pools);
                // Week pool disabled. To enable again uncomment bellow section
                // if (now >= poolstart && now <= poolends)
                //     res.status(200).send(pools);
                // else {
                //     weekpool.starts = moment.utc().startOf('week').add(1, 'h');
                //     weekpool.ends = moment.utc().endOf('week').add(1, 'h');
                //     weekpool.save(function (err, weekres) {
                //         if (err) {
                //             res.status(500).json(err);
                //         }
                //         console.log(pools);
                //         res.status(200).send(pools);
                //     });

                // }
            }else{
                res.status(200).send(pools);
            }

        }

    });
};



// POST
api.addPool = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(400).json('No Pool Provided. Please provide valid Pool data.');
    }

    var newItem = new Pool(req.body);

    return newItem.save(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });

};

// PUT
api.editPool = function (req, res) {

    Pool.findOneAndUpdate({ _id: req.params.id }, req.body, function (err) {
        if (err) {
            logger.log('error', err.stack, req.body);
            res.status(500).send(err);
        } else {
            res.send({ success: true });
        }
    });
};


// PUT
api.deletePool = function (req, res) {
    Pool.findById(req.params.id, function (err, pool) {
        pool.remove(function (err) {
            if (err) {
                logger.log('error', err.stack, req.body);
                res.status(500).send(err);
            } else {
                res.send({ success: true });
            }
        });

    });
};


router.post('/v1/pools', api.addPool);

router.put('/v1/pools/:id', api.editPool);
router.delete('/v1/pools/:id', api.deletePool);

// A pool atatched to a gameid is basicaly attached to the leaderboard
// of that specific game. It will start and finish during this game's 
// period and winners will be evaluated automaticaly.
router.get('/v1/pools/forgame/:id', api.poolbygameid);
router.get('/v1/pools/forgame/:id/:country', api.poolbygameid);

router.get('/v1/pools/for/country/:country/:shouldHavePrizes', api.timedpools);
router.get('/v1/pools/for/country/:country', api.timedpools);
router.get('/v1/pools/for/country/', api.timedpools);

// Timed pools are pools not tied up to a specific game but to a certain
// time-span. They can repeat in specific intervals or they can last an
// exact period of time. 
router.get('/v1/pools/timed/', api.timedpools);
router.get('/v1/pools/timed/:country', api.timedpools);

module.exports = router;
