// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    player = mongoose.models.players,
    team = mongoose.models.teams,
    _ =  require('lodash'),
    moment = require('moment'),
    match = mongoose.models.scheduled_matches,
    api = {},
    tags = [];

// ALL
api.tags = function (req, res) {
    
    var skip = null, limit = null;
    tags = [];

    if (req.query.skip != undefined)
        skip = req.query.skip;

    if (req.query.limit != undefined)
        limit = req.query.limit;

    var q = player.find();
    q.select('name pic teamId');
    q.exec(function (err, players) {
        players.forEach(function (player) {
            player = player.toObject();
            player.type = "Player";
            tags.push(player);
        });

        var t = team.find();
        t.select('name logo');
        t.exec(function (err, teams) {
            teams.forEach(function (team) {
                team = team.toObject();
                team.type = "Team";
                tags.push(team);
            });

            var m = match.find();
            m.select('home_team away_team')
            m.populate('home_team').populate('away_team');

            m.exec(function (err, matches) {
                matches.forEach(function (match) {
                    if (match.home_team) {
                        var matchTag = { name: { en: "" } };
                        matchTag.name.en = match.home_team.name.en + " - " + match.away_team.name.en;
                        matchTag._id = match._id;
                        matchTag.type = "Event";
                        tags.push(matchTag);
                    }
                });
                return res.send(tags);
            });

        });

    });

};

api.tagssearch = function (req, res) {
    var skip = null, limit = null;
    tags = [];

    if (req.query.skip != undefined)
        skip = req.query.skip;

    if (req.query.limit != undefined)
        limit = req.query.limit;
    
    var term = req.params.term;

    var q = player.find({"name.en": { "$regex": term, "$options": "i" }});
    q.select('name pic teamId');
    q.exec(function (err, players) {
        players.forEach(function (player) {
            player = player.toObject();
            player.type = "Player";
            tags.push(player);
        });

        var t = team.find({"name.en": { "$regex": term, "$options": "i" }});
        t.select('name logo');
        t.exec(function (err, teams) {
            teams.forEach(function (team) {
                team = team.toObject();
                team.type = "Team";
                tags.push(team);
            });

            var teamIds = _.map(teams, '_id');

            var m = match.find({$or:[{'home_team': {$in:teamIds}},{'away_team': {$in:teamIds}}]});
            m.select('home_team away_team start')
            m.populate('home_team').populate('away_team');

            m.exec(function (err, matches) {
                matches.forEach(function (match) {
                    if (match.home_team) {
                        var matchTag = { name: { en: "" } };
                        matchTag.name.en = "["+moment(match.start).format('DD/MM')+"]  " +match.home_team.name.en + " - " + match.away_team.name.en;
                        matchTag._id = match._id;
                        matchTag.type = "Event";
                        tags.push(matchTag);
                    }
                });
                return res.send(tags);
            });

        });

    });

};

api.matchtags = function (req, res) {
    var mid = req.params.matchid;
    var matchTags = [];

    var m = match.findById(mid)
        .select('home_team away_team')
        .populate('home_team', 'name logo')
        .populate('away_team', 'name logo');

    m.exec(function (err, match) {

        // First create the match tag
        if(err || match == null)
        return res.send(err);
        
        if (match.home_team) {
            var matchTag = { name: { en: "" } };
            matchTag.name.en = match.home_team.name.en + " - " + match.away_team.name.en;
            matchTag._id = match._id;
            matchTag.type = "Event";
            matchTags.push(matchTag);
        }

        // Now let's push the two team tags
        var home = match.home_team.toObject();
        home.type = "Team";
        home.alias = "home_team";
        matchTags.push(home);
        var away = match.away_team.toObject();
        away.type = "Team";
        away.alias = "away_team";
        matchTags.push(away);

        // And now let's finish it with each team players
        var q = player.find({ teamId: { $in: [match.home_team._id, match.away_team._id] } });
        q.select('name pic teamId');
        q.exec(function (err, players) {
            players.forEach(function (player) {
                player = player.toObject();
                player.type = "Player";
                matchTags.push(player);
            });

            return res.send(matchTags);
        });


    })


};
/*
=====================  ROUTES  =====================
*/

//router.get('/v1/data/tags', api.tags);
router.get('/v1/data/tags/:matchid/match', api.matchtags);

router.get('/v1/data/tags/search/:term', api.tagssearch);
module.exports = router;
