// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    item = mongoose.models.scheduled_matches,
    competition = mongoose.models.competitions,
    settings = mongoose.models.settings,
    defaultMatch = require('../config/empty-match'),
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




/*
=====================  ROUTES  =====================
*/

// Request the schedule based on user's country
router.route('/v1/data/schedule/country/:country')
    .get(api.items);

router.route('/v1/data/schedule/')
    .get(api.itemsSearch);

router.post('/v1/data/schedule/visibility', api.updateVisibility);

router.route('/v1/data/schedule/:id')
    .get(api.item);

module.exports = router;
