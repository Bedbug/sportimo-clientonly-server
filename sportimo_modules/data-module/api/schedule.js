// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    item = mongoose.models.scheduled_matches,
    competition = mongoose.models.competitions,
    settings = mongoose.models.settings,
    defaultMatch = require('../config/empty-match'),
    MatchModeration = require('../../match-moderation'),
    logger = require('winston'),
    api = {};

var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');
api.items = function (req, res) {

    var skip = null, limit = null;
    //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
    var queries = {};
    var userCountry = req.params.country;


    var q = item.find({ disabled:{$ne:true}, $or: [{ visiblein: userCountry }, { visiblein: { $exists: false } }, { visiblein: { $size: 0 } }] });

    q.populate('home_team', 'name logo')
        .populate('away_team', 'name logo')
        .populate('competition', 'name logo graphics');

    q.select('home_team home_score away_team away_score competition time state start completed');
    q.sort({ start: -1 });
    q.limit(50);
    q.exec(function (err, items) {
        // items = _.remove(items, function (o) {
        //     return o.home_team == null || o.away_team == null;
        // })

        // items.forEach(function (o) {
        //     o.remove(function (err, data) {
        //         if (!err) {
        //             console.log("Removed: " + o._id);
        //         } else {
        //             return res.status(500).json(err);
        //         }
        //     });
        // });

        return res.send(items);
    });

};


// ALL
api.itemsSearch = function (req, res) {
    var skip = null, limit = null;
    //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
    var queries = {};

    if (req.body.minDate != undefined || req.body.maxDate != undefined) {
        queries.publishDate = {};
        if (req.body.minDate == req.body.maxDate) {
            queries.publishDate.$eq = req.body.minDate;
        } else {
            if (req.body.minDate != undefined)
                queries.publishDate.$gte = req.body.minDate;
            if (req.body.maxDate != undefined)
                queries.publishDate.$lt = req.body.maxDate;
        }
    }

    if (req.body.tags != undefined)
        queries['tags.name.en'] = { "$regex": req.body.tags, "$options": "i" };

    if (req.body.related != undefined)
        queries['tags._id'] = req.body.related;

    if (req.body.type != undefined)
        queries.type = req.body.type;

    var q = item.find(queries)
        .populate('home_team')
        .populate('away_team')
        .populate('competition');

    q.select('home_team home_score away_team away_score donttouch completed competition time state start disabled');

    if (req.body.limit != undefined)
        q.limit(req.body.limit);


    q.exec(function (err, items) {

        return res.send(items);
    });

};

// POST
api.additem = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(400).json('No item Provided. Please provide valid team data.');
    }

    if (req.body.competition == null)
        return res.status(400).json('No competition Provided. Please provide valid competition ID.');

    req.body.timeline = [];
    req.body.timeline.push({
        timed: false,
        text: { en: "Pre Game", ar: "ماقبل المباراة" }
    })

    competition.findById(req.body.competition).then(function (competition) {

        // console.log(competition);
        // var defaultData = new defaultMatch();
        var mergedData = _.merge(_.cloneDeep(defaultMatch), req.body);
        var newItem = new item(mergedData);
        newItem.visiblein = competition.visiblein;

        settings.find({}, function (err, result) {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
            // if (result[0])           
                newItem.settings = {
                    "gameCards": {
                        "instant": 15,
                        "overall": 15,
                        "specials": 4,
                        "totalcards": 15
                    },
                    "matchRules": {
                        "freeUserPlaySegments": [
                            0,
                            1,
                            2
                        ],
                        "freeUserHasPlayTimeWindow": false,
                        "freeUserPregameTimeWindow": 20,
                        "freeUserLiveTimeWindow": 20,
                        "freeUserAdsToGetCards": false,
                        "freeUserCardsCap": false,
                        "freeUserCardsLimit": 5
                    },
                    "hashtag": "#sportimo",
                    "destroyOnDelete": true,
                    "sendPushes": true
                }//result[0].clientdefaults;

            return newItem.save(function (err, data) {
                if (err) {                   
                    logger.log('error', err.stack, req.body);
                    return res.status(500).json(err);
                } else {
                    MatchModeration.LoadMatchFromDB(data._id, function () {
                        return res.status(200).json(data);
                    });
                }
            });
        })


    })



};

api.updateVisibility = function (req, res) {

    // console.log(req.body.competitionid);


    item.find({ competition: req.body.competitionid }, function (err, matches) {

        if (matches) {
            matches.forEach(function (match) {
                match.visiblein = req.body.visiblein;
                match.save(function (err, data) {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        return res.status(500).json(data);
                    }
                })
            })
            res.status(200).send();
        } else {
            console.log("404");
            res.status(404).send();
        }
    });


};

// GET
api.item = function (req, res) {
    var id = req.params.id;
    item.findById(id, function (err, returnedItem) {
        if (!err) {
            return res.status(200).json(returnedItem);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
};

// PUT
api.edititem = function (req, res) {
    var id = req.params.id;
    var updateData = req.body;
    item.findById(id, function (err, returnedItem) {

        if (updateData === undefined || returnedItem === undefined) {
            return res.status(400).json("Error: Data is not correct.");
        }

        returnedItem.photo = updateData.photo;
        returnedItem.tags = updateData.tags;
        returnedItem.publishDate = updateData.publishDate;
        returnedItem.type = updateData.type;
        returnedItem.publication = updateData.publication;
        // art.markModified('tags');

        return returnedItem.save(function (err, data) {
            if (!err) {
                return res.status(200).json(data);
            } else {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
        }); //eo team.save
    });// eo team.find
};

api.edititemsettings = function (req, res) {
    var id = req.params.id;
    var updateData = req.body;
    item.findById(id, function (err, returnedItem) {

        if (updateData === undefined || returnedItem === undefined) {
            return res.status(400).json("Error: Data is not correct.");
        }

        returnedItem.settings = updateData;

        return returnedItem.save(function (err, data) {
            if (!err) {
                return res.status(200).json(data);
            } else {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
        }); //eo team.save
    });// eo team.find


};


// DELETE
api.deleteitem = function (req, res) {
    var id = req.params.id;
    item.find({ _id: id }).remove(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
};



/*
=====================  ROUTES  =====================
*/

// Request the schedule based on user's country
router.route('/v1/data/schedule/country/:country')
    .get(api.items);

router.route('/v1/data/schedule/')
    .get(api.itemsSearch);

router.post('/v1/data/schedule', api.additem);

router.post('/v1/data/schedule/visibility', api.updateVisibility);

router.route('/v1/data/schedule/:id/settings')
    .put(api.edititemsettings);

router.route('/v1/data/schedule/:id')
    .get(api.item)
    .put(api.edititem)
    .delete(api.deleteitem);

module.exports = router;
