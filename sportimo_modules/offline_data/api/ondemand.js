var express = require('express'),
    router = express.Router(),
    path = require("path"),
    fs = require("fs"),
    async = require('async'),
    log = require('winston'),
    _ = require('lodash');


var parsers = {};

// Recursively add parsers
var servicesPath = path.join(__dirname, '../parsers');
fs.readdirSync(servicesPath).forEach(function (file) {
    parsers[path.basename(file, ".js")] = require(servicesPath + '/' + file);
});

// Recursively add models
var modelsPath = path.join(__dirname, '../../models');
fs.readdirSync(modelsPath).forEach(function (file) {
    require(modelsPath + '/' + file);
});

var api = {};

// var mongoDb = mongoose.mongoose.models;
// var mongoConn = mongoose.mongoose.connections[0];

var selectedUpdateParser = parsers['Statscore'];

// Define api actions:


// This is the endpoint that executes the same method that is automatically schedulled every day for many leagues, and updates all available stats
api.UpdateTeamStats = function (req, res) {
    if (!req.params.competitionId)
        return res.status(400).json({ error: "No 'competitionId' id parameter defined in the request path." });

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        parser.UpdateAllCompetitionStats(req.params.competitionId, req.body.season, function (error, result) {
            if (!error) {
                response.parsers[parser.Name] = result;

                return res.status(200).json(response);
            }
            else {
                log.log('error', error.stack, req.body);
                response.error = error.message;
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
router.post('/teamstats/:competitionId/update', api.UpdateTeamStats);


// POST //function(competitionId, season, schedulePattern, callback)
api.UpdateAllTeamsAddSchedule = function(req, res) {
    if (!req.params.competitionId)  
        return res.status(400).json({ error: "No 'competitionId' id parameter defined in the request path." });
    if (!req.body || !req.body.season)  
        return res.status(400).json({ error: "No 'season' parameter defined in the request body." });
    if (!req.body || !req.body.pattern)  
        return res.status(400).json({ error: "No 'pattern' parameter defined in the request body." });

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        // ToDo: maybe change the sequential order, and break the loop when the first parser completes the action without error.
        parser.CreateCompetitionTeamsStatsSchedule(req.params.competitionId, req.body.season, req.body.pattern, function (error, result) {
            if (!error) {
                response.parsers[parser.Name] = result;

                return res.status(200).json(response);
            }
            else {
                log.warn('Error calling UpdateAllTeams for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }    
};

// GET //function(leagueName, callback)
api.UpdateAllTeamsGetSchedule = function(req, res) {
    if (!req.params.competitionId)  
        return res.status(400).json({ error: "No 'competitionId' id parameter defined in the request path." });

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        // ToDo: maybe change the sequential order, and break the loop when the first parser completes the action without error.
        parser.GetCompetitionTeamsStatsSchedule(req.params.competitionId, function (error, result) {
            if (error) {
                log.warn('Error calling UpdateAllTeams for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
            else {
                response.parsers[parser.Name] = result;

                return res.status(200).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }    
};



// POST //function(leagueName, teamId, season, callback) UpdateOneTeamStats
api.UpdateOneTeamStats = function (req, res) {
    if (!req.body.leagueName)
        return res.status(400).json({ error: "No 'leagueName' parameter defined in the request body." });
    if (!req.body.teamid)
        return res.status(400).json({ error: "No 'teamid' Stats team id parameter defined in the request body." });
    if (!req.body.season)
        return res.status(400).json({ error: "No 'season' parameter defined in the request body." });


    api.GetTeamFullData(req.body.leagueName, req.body.teamid, req.body.season, function(err,response){
            if (err) {
            response.error = err.message;
            return res.status(500).json(response);
        }
        else
            return res.status(200).json(response);
    });
};
// update team stats full
router.post('/teamstats/teamUpdate', api.UpdateOneTeamStats);


api.GetTeamFullData = function (leagueName, teamid, season, outerCallback ) {
    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        parser.UpdateTeamStatsFull(leagueName, teamid, season, function (error, result) {
            if (!error) {
                response.parsers[parser.Name] = result;

                outerCallback(null, response);
            }
            else {
                log.warn('Error calling GetTeamFullData for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                outerCallback(null, response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return outerCallback(error, response);
    }
};

// POST
api.UpdateAllTeams = function (req, res) {
    if (!req.params.competitionId)
        return res.status(400).json({ error: "No 'competitionId' id parameter defined in the request path." });

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {

        parser.UpdateTeams(req.params.competitionId, function (error, teamsToAdd, teamsToUpdate, playersToAdd, playersToUpdate) {
            if (!error) {
                response.parsers[parser.Name] = {
                    error: null,
                    teamsToAdd: teamsToAdd.length,
                    teamsToUpdate: teamsToUpdate.length,
                    playersToAdd: playersToAdd.length,
                    playersToUpdate: playersToUpdate.length
                };

                return res.status(200).json(response);
            }
            else {
                log.warn('Error calling UpdateAllTeams for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
// update all teams and players in each
router.post('/:competitionId/teams', api.UpdateAllTeams);


// POST
api.UpdateAllPlayerStatsInTeam = function (req, res) {
    if (!req.params.teamId)
        return res.status(400).json({ error: "No 'teamId' id parameter defined in the request path." });

    var teamId = req.params.teamId;
    
    var season = req.body.season;

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        parser.UpdateTeamPlayersCareerStats(teamId, season, function (error, playersToUpdate) {
            if (!error) {
                response.parsers[parser.Name] = {
                    error: null,
                    playersToUpdate: playersToUpdate
                };

                return res.status(200).json(response);
            }
            else {
                log.warn('Error calling UpdateAllPlayerStatsInTeam for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
// update all player career stats for all players in teamId
router.post('/players/:teamId', api.UpdateAllPlayerStatsInTeam);


api.UpdateLeagueStandings = function (req, res) {
    if (!req.params.competitionId)
        return res.status(400).json({ error: "No 'competition' id parameter defined in the request path." });

    var leagueId = req.params.competitionId;
    
    var season = req.body.season;
    res.status(200).send("Request received.");
    
    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    try {
        parser.UpdateLeagueStandings(null, leagueId, season, null, function (error, teamsIncluded) {
            if (!error) {
                response.parsers[parser.Name] = {
                    error: null,
                    teamsNumber: teamsIncluded
                };

                return res.status(200).json(response);
            }
            else {
                log.warn('Error calling UpdateLeagueStandings for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
// update the team standings of the selected competition (id)
router.post('/standings/:competitionId', api.UpdateLeagueStandings);


api.UpdateAllStandings = function (req, res) {    
    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var parser = req.query.parser || selectedUpdateParser;

    if (!req.body.season)
        return res.status(400).json({ error: "No 'season' id parameter defined in the request path." });

    try {
        parser.UpdateStandings(req.body.season, function (error, teamsIncluded) {
            if (!error) {
                response.parsers[parser.Name] = {
                    error: null,
                    updatedCompetitions: teamsIncluded
                };

                return res.status(200).json(response);
            }
            else {
                log.warn('Error calling UpdateAllStandings for parser ' + parser.Name + ': ' + error.message);
                response.parsers[parser.Name] = {
                    error: error.message
                };
                return res.status(500).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
// update all competition standings
router.post('/update/standings/all', api.UpdateAllStandings);


api.GetCompetitionFixtures = function (req, res) {
    var response = { error: null, results: [] };
    var results = [];

    if (!req.params.competitionId)
        return res.status(400).json({ error: "No 'competition' id parameter defined in the request path." });

    var parsersToSearch = parsers;
    if (req.query.parser)
        parsersToSearch = _.pick(parsers, req.query.parser);

    try {
        // ToDo: maybe change the sequential order, and break the loop when the first parser completes the action without error.
        async.eachSeries(parsersToSearch, function (parser, callback) {
            parser.GetCompetitionFixtures(req.params.competitionId, !req.params.season ? null : req.params.season, function (error, fixtures) {
                if (!error) {
                    results = results.concat(fixtures);
                    callback();
                }
                else {
                    log.warn('Error calling GetCompetitionFixtures for parser ' + parser.Name + ': ' + error.message);
                    response.error = error.message;
                    callback();
                }
            });
        }, function done(error) {
            if (error) {
                response.error = error.message;
                return res.status(500).json(response);
            }
            else {
                var grouped = _.groupBy(results, (item) => { return item.competitionId + ':' + (!item.home_team || !item.home_team._id ? '' : item.home_team._id) + ':' + (!item.away_team || !item.away_team._id ? '' : item.away_team._id); });
                var mapped = _.map(grouped, (item) => {
                    if (item.length <= 1) {
                        if (item[0].moderation && item[0].moderation.length > 0)
                            item[0].moderation[0].active = true;
                        return item;
                    }
                    else {
                        item[0].moderation = _.flatMap(item, 'moderation');
                        return [item[0]];
                    }
                });
                response.results = _.flatten(mapped);

                return res.status(200).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }
};
// return the future fixtures for the selected competition (id)
router.get('/fixtures/:competitionId/:season', api.GetCompetitionFixtures);
router.get('/fixtures/:competitionId', api.GetCompetitionFixtures);


api.Welcome = function (req, res) {
    return res.status(200).json({ error: null, response: 'The offline_data Api is up and running.' });
};



// Bind api actions to router paths:

router.get('/', api.Welcome);


router.get('/teamstats/:competitionId/schedule', api.UpdateAllTeamsGetSchedule);
router.post('/teamstats/:competitionId/schedule', api.UpdateAllTeamsAddSchedule);
//router.delete('/teamstats/:competitionId/schedule', api.UpdateAllTeamsDeleteSchedule);


module.exports = router;