// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    item = mongoose.models.standings,
    logger = require('winston'),
    api = {};
var knockouts = mongoose.models.knockoutStandings,
    competitions = mongoose.models.competitions;


api.items = function (req, res) {

    var skip = null, limit = null;
    //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
    var queries = {};
    var userCountry = req.params.country;


    var q = item.find({ $or: [{ visiblein: userCountry }, { visiblein: { $exists: false } }, { visiblein: { $size: 0 } }] });

    q.exec(function (err, items) {
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
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

    // if(req.params.season)
    //     queries.season = req.params.season;

    var q = item.find(queries);

    if (req.body.limit != undefined)
        q.limit(req.body.limit);

    q.exec(function (err, items) {

        return res.send(items);
    });

};

// POST
api.additem = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(500).json('No item Provided. Please provide valid team data.');
    }

    var newItem = new item(req.body);

    return newItem.save(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });

};

api.updateVisibility = function (req, res) {

    // console.log(req.body.competitionid);


    item.find({ competitionid: req.body.competitionid }, function (err, standings) {

        if (standings) {
            standings.forEach(function (standing) {
                standing.visiblein = req.body.visiblein;
                standing.save(function (err, data) {
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
var GetSeasonYear = function () {
    var now = new Date();
    if (now.getMonth() > 6)
        return now.getFullYear();
    else return now.getFullYear() - 1;
};
// GET
api.item = function (req, res) {
    // var id = req.params.id;
    // console.log(item);
    var season;
    if (req.params.season) {
        season = req.params.season;
        api.getCompetition(req.params.id, season, res);
    }
    else {
        competitions.findById(req.params.id, (err, competition) => {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            } else {
                if (!competition || !competition.season)
                    return res.status(404).json({});

                api.getCompetition(req.params.id, competition.season, res);
            }
        });
    }
    

};

api.getCompetition = function (competitionid, season, res) {

    item.findOne({competitionid: competitionid, season: season}, function (err, returnedItem) {
        if (!err) {
            if (returnedItem || season == 2016) {
                knockouts.findOne({ competitionid: competitionid, season: season }, function (err, standingKnockouts) {
                    if (!err) {
                        if (returnedItem) {
                            returnedItem = returnedItem.toObject();
                            returnedItem.knockouts = standingKnockouts;
                        }
                        return res.status(200).json(returnedItem);
                    } else {
                        logger.log('error', err.stack, req.body);
                        return res.status(500).json(err);
                    }
                });
            }
            else
                api.getCompetition(competitionid, season - 1, res);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
}

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
        areturnedItemrt.publishDate = updateData.publishDate;
        returnedItem.type = updateData.type;
        returnedItemart.publication = updateData.publication;
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

// DELETE
api.deleteitem = function (req, res) {
    var id = req.params.id;

};



/*
=====================  ROUTES  =====================
*/

router.route('/v1/data/standings/')
    .get(api.itemsSearch);

router.post('/v1/data/standings', api.additem);

router.post('/v1/data/standings/visibility', api.updateVisibility);

router.route('/v1/data/standings/country/:country')
    .get(api.items);


router.route('/v1/data/standings/:id')
    .get(api.item)
    .put(api.edititem)
    .delete(api.deleteitem);

router.route('/v1/data/standings/:id/:season')
    .get(api.item);

module.exports = router;
