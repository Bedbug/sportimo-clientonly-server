'use strict';


var scheduler = require('node-schedule');
var needle = require("needle");
var crypto = require("crypto-js");
var async = require('async');
var _ = require('lodash');
var mongoose = require('../config/db.js');
var winston = require('winston');
var objectId = mongoose.mongoose.Schema.ObjectId;
var moment = require('moment');

// Settings for the development environment
var mongoDb = mongoose.mongoose.models;
//var mongoConn = mongoose.mongoose.connections[0];

var log = new (winston.Logger)({
    levels: {
        prompt: 6,
        debug: 5,
        info: 4,
        core: 3,
        warn: 1,
        error: 0
    },
    colors: {
        prompt: 'grey',
        debug: 'blue',
        info: 'green',
        core: 'magenta',
        warn: 'yellow',
        error: 'red'
    }
});

log.add(winston.transports.Console, {
    timestamp: true,
    level: process.env.LOG_LEVEL || 'debug',
    prettyPrint: true,
    colorize: 'level'
});

// languageMapping maps Sportimo langage locale to Stats.com language Ids. For a list of ISO codes, see https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
var languageMapping = {
    "ar": "10", // arabic
    "en": "1", // english
    "yi": "28", // yiddish (hebrew)
    "ru": "16" // russian
    // Add all required language mappings here from Stats.com
};

var statsComConfigDevelopment = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en", "ar", "ru"],
    urlPrefix: "http://api.stats.com/v1/stats/soccer/",
    apiKey: "mct9w8ws4fbpvj5w66se4tns",//"83839j82xy3mty4bf6459rnt",
    apiSecret: "53U7SH6N5x", //"VqmfcMTdQe",
    parserIdName: "Stats"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Settings for the production environment
var statsComConfigProduction = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "http://api.stats.com/v1/stats/soccer/",
    apiKey: "mct9w8ws4fbpvj5w66se4tns",//"83839j82xy3mty4bf6459rnt",
    apiSecret: "53U7SH6N5x", //"VqmfcMTdQe",
    parserIdName: "Stats"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Assign the settings for the current environment
//var localConfiguration = statsComConfigDevelopment;
var configuration = statsComConfigDevelopment;

var Parser = function () {
    // Settings properties
    //Parser.name = configuration.parserIdName;

    //update configuration settings with this object settings
    if (this.interval)
        configuration.eventsInterval = this.interval;
    if (this.parsername)
        configuration.parserIdName = this.parsername;

    // Restrict to Only call this once in the lifetime of this object
    this.init = _.once(function (feedServiceContext) {
    });

};



Parser.Configuration = configuration;
Parser.Name = configuration.parserIdName;
Parser.methodSchedules = {};

// Initialize scheduled tasks on (re)start, but wait 5 secs for the mongo connection to be established first.
setTimeout(function () {
    mongoDb.gameserversettings.findOne().exec(function (error, settings) {
        if (error)
            log.error('Failed to get the game server settings during offline_data Stats parser initialization');
        else {           
            if (settings) {              
                if (settings.scheduledTasks) {                    
                    _.forEach(settings.scheduledTasks, function (updateTeamSchedule) {
                        // if(updateTeamSchedule.competitionId != "56f4800fe4b02f2226646297") return;
                        let competitionId = updateTeamSchedule.competitionId;
                        let season = updateTeamSchedule.season;
                        let pattern = updateTeamSchedule.cronPattern;
                        let parser = updateTeamSchedule.parser;

                        if ((!parser || parser == Parser.Name) && !updateTeamSchedule.isDeleted) {
                            log.info('[' + Parser.Name + ']: Scheduling UpdateCompetitionStats for league %s (%s) with the pattern %s', competitionId, season, pattern);
                            Parser.methodSchedules['UpdateCompetitionStats'] = scheduler.scheduleJob(pattern, function () {
                                log.info('[' + Parser.Name + ']: Scheduled job is running for %s (%s) : %s', updateTeamSchedule.competitionId, updateTeamSchedule.season, updateTeamSchedule.cronPattern);
                                Parser.UpdateAllCompetitionStats(competitionId, season, function (error, data) {
                                    if (error)
                                        log.error(error.message);
                                });
                            });
                        }
                    });
                }
            }
        }

        // let competitionId = "56f4800fe4b02f2226646297";
        // let season = "2017";
        // let pattern = "45 16 * * *";

        // log.info('Scheduling UpdateCompetitionStats for season %s with the pattern %s', season, pattern);
        // Parser.methodSchedules['UpdateCompetitionStats'] = scheduler.scheduleJob(pattern, function () {
        //     log.info('Scheduled job is running for %s : %s : %s', updateTeamSchedule.competitionId, updateTeamSchedule.season, updateTeamSchedule.cronPattern);
        //     Parser.UpdateAllCompetitionStats(competitionId, season, function (error, data) {
        //         if (error)
        //             log.error(error.message);
        //     });
        // });
    });
}, 5000);

/* Uncomment when this parser becomes the default one
setTimeout(function () {
    setInterval(function () {
        var cutOffTime = moment.utc().subtract(3, 'hours').toDate();
        //mongoDb.scheduled_matches.find({ completed: false, guruStats: null, start: {$gte: cutOffTime} }, function(error, matches) {
        mongoDb.scheduled_matches.find({ completed: false, guruStats: null, guruStatsChecked: {$ne: true} }, '_id home_team away_team competition state time start', function (error, matches) {
            if (error)
                return;

            async.eachSeries(matches, function (match, cb) {
                setTimeout(function () {
                    Parser.UpdateGuruStats(match, function (err) {
                        if (err){
                            log.error('Failed saving the Guru-stats for match %s, due to: %s', match.id, err.message);
                        }

                        mongoDb.scheduled_matches.findByIdAndUpdate(match._id,{$set:{guruStatsChecked: true}},function(err,res){
                            log.info("Updated match so we don't have to test for Guru stats anymore.")
                        })

                        cb(null);
                    });
                }, 500);
            }, function (eachSeriesError) {

            });
        });
    }, 60000);
}, 5000);
*/

// Helper Methods

// Approximate calculation of season Year from current date
Parser.GetSeasonYear = function () {
    const now = new Date();

    if (now.getMonth() > 5)
        return now.getFullYear();
    else return now.getFullYear() - 1;
};


Parser.FindCompetitionByParserid = function (leagueName, callback) {
    var findQuery = { 'parserids.Stats': leagueName };

    var q = mongoDb.competitions.findOne(findQuery);

    q.exec(function (error, competition) {
        if (error)
            return callback(error);

        if (!competition)
            return callback(new Error('No competition found in database with this Id:' + leagueName));

        return callback(null, competition);
    });
}

// Helper method to retrieve a team based on the parser id
Parser.FindMongoTeamId = function (competitionId, parserid, fieldProjection, callback, teamId) {

    var findConditions = { competitionid: competitionId, "parserids.Stats": parserid };

    if (teamId)
        findConditions._id = teamId;

    var q = mongoDb.teams.findOne(findConditions);

    if (fieldProjection)
        q.select(fieldProjection);

    q.exec(function (err, team) {
        if (err)
            return callback(err);

        if (!team)
            return callback(new Error('No team found in database with this parserId:' + parserid));

        return callback(null, team);
    });
};

Parser.FindMongoTeamsInCompetition = function (competitionId, callback) {
    //mongoDb.teams.find({ competitionid: competitionId, parserids: { $ne: null } }, function (error, teams) {
    mongoDb.teams.find({ competitionid: competitionId, ['parserids.' + Parser.Name]: { $exists: true } }, function (error, teams) {
        if (error)
            return callback(error);
        callback(null, teams);
    });
};

// Stats.com Endpoint invocation Methods

// Get team stats. Always return the season stats.
Parser.UpdateTeamStats = function (leagueName, teamId, season, callback) {

    //soccer/epl/stats/players/345879?enc=true&
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/stats/teams/" + teamId + "?accept=json&season=" + season + "&" + signature;

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200 && response.statusCode != 404)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));

            var teamStats = response.statusCode == 404 ?
                TranslateTeamStats(null) :
                TranslateTeamStats(response.body.apiResults[0].league.teams[0].seasons[0].eventType[0].splits[0].teamStats[0]);

            return mongoDb.teams.findOne({ "parserids.Stats": teamId }, function (err, team) {
                if (err)
                    return callback(err);

                if (team) {
                    team.stats = teamStats;
                    team.markModified('stats');
                    team.save(function (err, result) {
                        if (err)
                            return callback(err);

                        return callback(null, teamStats);
                    });
                } else
                    return callback(null, teamStats);
            });

        }

        catch (err) {
            return callback(err);
        }
    });
};

// Get team stats. Always return the season stats.
Parser.UpdateTeamStatsFull = function (leagueName, teamId, season, outerCallback, mongoTeamId) {

    season = Parser.GetSeasonYear();

    //soccer/epl/stats/players/345879?enc=true&
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));

    // API Endpoint for season stats
    const stats_url = configuration.urlPrefix + leagueName + "/stats/teams/" + teamId + "?accept=json&season=" + season + "&" + signature;
    // API Endpoint for standing
    const standings_url = configuration.urlPrefix + leagueName + "/standings/teams/" + teamId + "?accept=json&season=" + season + "&" + signature;
    // API Endpoint for schedule
    const schedule_url = configuration.urlPrefix + leagueName + "/scores/teams/" + teamId + "?linescore=true&accept=json&season=" + season + "&" + signature;
    // AP Endpoint for team events
    const events_url = configuration.urlPrefix + leagueName + "/stats/teams/" + teamId + "/events/?accept=json&season=" + season + "&" + signature;
    // API Endpoint for top scorer
    const scorer_url = configuration.urlPrefix + leagueName + "/leaders/?teamId=" + teamId + "&accept=json&" + signature;

    var competitionId = null;

    async.waterfall(
        [
            function (callback) {
                Parser.FindCompetitionByParserid(leagueName, function (error, competition) {
                    if (error)
                        return callback(error);

                    competitionId = competition.id;
                    callback(null);
                });
            },
            function (callback) {
                return Parser.FindMongoTeamId(competitionId, teamId, false, callback, mongoTeamId);
            },

            // First let's update the stats for use in the client gamecard infos
            function (team, callback) {
                // if (team.nextmatch && team.nextmatch.eventdate >= Date.now())
                //     async.setImmediate(function () {
                //         return callback(new Error('Data are current. No need to update them yet.'), team);
                //     });

                needle.get(stats_url, { timeout: 50000 }, function (error, response) {
                    if (error)
                        return callback(error, team);
                    try {
                        // if (response.statusCode == 404)
                        //     return callback(null, team);

                        var teamStats = response.statusCode == 404 ?
                            TranslateTeamStats(null) :
                            TranslateTeamStats(response.body.apiResults[0].league.teams[0].seasons[0].eventType[0].splits[0].teamStats[0]);
                        team.stats = teamStats;

                        callback(null, team);
                    }
                    catch (err) {
                        log.error(err.stack);
                        return callback(err, team);
                    }
                });
            },

            // Secondly let's get the team standing in it's main league
            function (team, callback) {
                setTimeout(function () {
                    needle.get(standings_url, { timeout: 50000 }, function (error, response) {
                        if (error)
                            return callback(error, team);
                        try {
                            // if (response.statusCode == 404)
                            //     return callback(null, team);

                            var teamStanding = response.statusCode == 404 ? null : response.body.apiResults[0].league.season.eventType[0].conferences[0].divisions[0].teams[0];
                            team.standing = {
                                "rank": teamStanding && teamStanding.league ? teamStanding.league.rank : teamStanding && teamStanding.division ? teamStanding.division.rank : -1,
                                "teamName": team.name,
                                "teamId": team._id.toString(),
                                "points": teamStanding ? teamStanding.teamPoints : 0,
                                "pointsPerGame": teamStanding && teamStanding.teamPointsPerGame ? teamStanding.teamPointsPerGame : "0",
                                "penaltyPoints": teamStanding ? teamStanding.penaltyPoints : 0,
                                "wins": teamStanding ? teamStanding.record.wins : 0,
                                "losses": teamStanding ? teamStanding.record.losses : 0,
                                "ties": teamStanding ? teamStanding.record.ties : 0,
                                "gamesPlayed": teamStanding ? teamStanding.record.gamesPlayed : 0,
                                "goalsFor": teamStanding ? teamStanding.goalsFor.overall : 0,
                                "goalsAgainst": teamStanding ? teamStanding.goalsAgainst.overall : 0
                            };

                            team.markModified('standing');
                            callback(null, team);
                        }
                        catch (err) {
                            log.error(err.stack);
                            return callback(err, team);
                        }
                    });
                }, 500);
            },

            // Now let's do the difficult stuff and get the schedule
            function (team, callback) {
                setTimeout(function () {
                    // console.log(schedule_url);
                    needle.get(schedule_url, { timeout: 50000 }, function (error, response) {
                        if (error)
                            return callback(error, team);
                        try {
                            if (response.statusCode == 404) {
                                team.nextmatch = {
                                    "eventdate": moment().utc().add(1, 'd').toDate(),
                                };
                                return callback(null, team);
                            }

                            const itsNow = moment.utc();

                            const nextEvents = _.filter(response.body.apiResults[0].league.season.eventType[0].events, function (match) {
                                return itsNow.isBefore(moment.utc(match.startDate[1].full));
                            });
                            const oldEvents = _.filter(response.body.apiResults[0].league.season.eventType[0].events, function (match) {
                                return itsNow.isAfter(moment.utc(match.startDate[1].full));
                            });
                            const lastFiveEvents = _.takeRight(oldEvents, 5);
                            const nextMatch = _.first(nextEvents);
                            const lastMatch = _.last(oldEvents);

                            let lastFiveOutcomes = []; // W for Win, L for Loss, T for Tie
                            if (oldEvents.length > 0) {
                                lastFiveOutcomes = _.compact(_.map(lastFiveEvents, (match) => {
                                    if (match.teams && match.teams.length >= 2) {
                                        let matchOutcome;
                                        if (match.teams[0] && match.teams[0].teamId == teamId) {
                                            if (match.teams[0].score > match.teams[1].score)
                                                matchOutcome = 'W';
                                            else if ((match.teams[0].score < match.teams[1].score))
                                                matchOutcome = 'L';
                                            else
                                                matchOutcome = 'T';
                                        }
                                        else if (match.teams[1] && match.teams[1].teamId == teamId) {
                                            if (match.teams[0].score > match.teams[1].score)
                                                matchOutcome = 'L';
                                            else if ((match.teams[0].score < match.teams[1].score))
                                                matchOutcome = 'W';
                                            else
                                                matchOutcome = 'T';
                                        }
                                        return matchOutcome;
                                    }
                                    return null;
                                }));
                            }
                            team.recentForm = lastFiveOutcomes;

                            const teamData = _.pick(team, ['_id', 'name', 'logo']);

                            let lastMatchOponentId, nextMatchOponentId;
                            if (nextMatch) {
                                team.nextmatch = {
                                    "home": "",
                                    "away": "",
                                    "eventdate": moment.utc(nextMatch.startDate[1].full).toDate(),
                                    "homescore": 0,
                                    "awayscore": 0
                                };
                                if (nextMatch.teams[0] && nextMatch.teams[0].teamId == teamId) {
                                    if (nextMatch.teams[0].teamLocationType.teamLocationTypeId == 1)
                                        team.nextmatch.home = teamData;
                                    else if (nextMatch.teams[0].teamLocationType.teamLocationTypeId == 2)
                                        team.nextmatch.away = teamData;
                                }
                                else if (nextMatch.teams[1] && nextMatch.teams[1].teamId == teamId) {
                                    if (nextMatch.teams[1].teamLocationType.teamLocationTypeId == 1)
                                        team.nextmatch.home = teamData;
                                    else if (nextMatch.teams[1].teamLocationType.teamLocationTypeId == 2)
                                        team.nextmatch.away = teamData;
                                }
                                nextMatchOponentId = nextMatch.teams && nextMatch.teams.length >= 2
                                    ? (nextMatch.teams[0].teamId == teamId ? nextMatch.teams[1].teamId : nextMatch.teams[0].teamId)
                                    : null;
                            }
                            if (lastMatch) {
                                team.lastmatch = {
                                    "home": "",
                                    "away": "",
                                    "eventdate": moment.utc(lastMatch.startDate[1].full).toDate(),
                                    "homescore": 0,
                                    "awayscore": 0
                                };
                                const homeTeam = lastMatch.teams[0].teamLocationType.teamLocationTypeId == 1 ? lastMatch.teams[0] : lastMatch.teams[1];
                                const awayTeam = lastMatch.teams[1].teamLocationType.teamLocationTypeId == 2 ? lastMatch.teams[1] : lastMatch.teams[0];
                                if (homeTeam.teamId == teamId) {
                                    team.lastmatch.home = teamData;
                                    team.lastmatch.homescore = homeTeam.score;
                                    team.lastmatch.awayscore = awayTeam.score;
                                }
                                else if (awayTeam.teamId == teamId) {
                                    team.lastmatch.away = teamData;
                                    team.lastmatch.awayscore = awayTeam.score;
                                    team.lastmatch.homescore = homeTeam.score;
                                }
                                lastMatchOponentId = homeTeam.teamId == teamId ? awayTeam.teamId : (awayTeam.teamId == teamId ? homeTeam.teamId : null);
                            }

                            async.parallel([
                                (cbk) => {
                                    if (nextMatchOponentId)
                                        return Parser.FindMongoTeamId(competitionId, nextMatchOponentId, 'name logo', cbk);
                                    else
                                        return async.setImmediate(() => { return cbk(null); });
                                },
                                (cbk) => {
                                    if (lastMatchOponentId)
                                        return Parser.FindMongoTeamId(competitionId, lastMatchOponentId, 'name logo', cbk);
                                    else
                                        return async.setImmediate(() => { return cbk(null); });
                                }
                            ], (parallelErr, parallelResults) => {
                                if (!parallelErr) {
                                    const nextMatchOpponent = parallelResults[0];
                                    const lastMatchOpponent = parallelResults[1];

                                    if (nextMatchOpponent) {
                                        const nextMatchOpponentData = _.pick(nextMatchOpponent, ['_id', 'name', 'logo']);
                                        if (team.nextmatch.home || team.nextmatch.away) {
                                            if (team.nextmatch.home == "")
                                                team.nextmatch.home = nextMatchOpponentData;
                                            else
                                                team.nextmatch.away = nextMatchOpponentData;
                                        }
                                        team.markModified('nextmatch');
                                    }
                                    if (lastMatchOpponent) {
                                        const lastMatchOpponentData = _.pick(lastMatchOpponent, ['_id', 'name', 'logo']);
                                        if (team.lastmatch.home || team.lastmatch.away) {
                                            if (team.lastmatch.home == "")
                                                team.lastmatch.home = lastMatchOpponentData;
                                            else
                                                team.lastmatch.away = lastMatchOpponentData;
                                        }
                                        team.markModified('lastmatch');
                                    }

                                    return callback(null, team);
                                }
                                else {
                                    log.error(parallelErr.stack);
                                    return callback(null, team);
                                }
                            });
                                //Parser.FindMongoTeamId(competitionId, nextMatch.teams[0].teamId, 'name logo', function (err, home_team) {
                                //    if (!err)
                                //        team.nextmatch.home = home_team ? home_team : { name: { en: nextMatch.teams[0].displayName } };

                                //    Parser.FindMongoTeamId(competitionId, nextMatch.teams[1].teamId, 'name logo', function (err, away_team) {
                                //        if (!err)
                                //            team.nextmatch.away = away_team ? away_team : { name: { en: nextMatch.teams[1].displayName } };

                                //        callback(null, team);
                                //    });
                                //});
                            //}
                            //else
                            //    callback(null, team);
                        }
                        catch (err) {
                            log.error(err.stack);
                            return callback(err, team);
                        }
                    });
                }, 500);
            },

            /*
            // It's time to go for the last match entry and recent form
            function (team, callback) {
                setTimeout(function () {
                    needle.get(events_url, { timeout: 50000 }, function (error, response) {
                        if (error)
                            return callback(error, team);
                        try {
                            if (response.statusCode != 200)
                                return callback(null, team);

                            var lastFiveEvents = _.takeRight(response.body.apiResults[0].league.teams[0].seasons[0].eventType[0].splits[0].events, 5);
                            var lastEvent = _.takeRight(response.body.apiResults[0].league.teams[0].seasons[0].eventType[0].splits[0].events)[0];

                            team.recentform = _.map(lastFiveEvents, function (o) {
                                return o.outcome.name;
                            });

                            // Now let's retrieve the last match data
                            team.lastmatch = {
                                "home": "",
                                "away": "",
                                "eventdate": moment.utc(lastEvent.startDate[1].full).toDate(),
                                "homescore": 0,
                                "awayscore": 0
                            };

                            Parser.FindMongoTeamId(competitionId, lastEvent.opponentTeam.teamId, 'name logo', function (teamError, opponent_team) {
                                if (teamError)
                                    return callback(teamError, team);

                                if (!opponent_team)
                                    opponent_team = {
                                        _id: "",
                                        name: { en: lastEvent.opponentTeam.displayName }
                                    };

                                if (lastEvent.team.teamLocationType.name == 'away') {
                                    team.lastmatch.away = _.pick(team, ['_id', 'name', 'logo']);
                                    team.lastmatch.awayscore = lastEvent.outcome.teamScore;
                                    team.lastmatch.home = opponent_team;
                                    team.lastmatch.homescore = lastEvent.outcome.opponentTeamScore;
                                } else {

                                    team.lastmatch.home = _.pick(team, ['_id', 'name', 'logo']);
                                    team.lastmatch.homescore = lastEvent.outcome.teamScore;
                                    team.lastmatch.away = opponent_team;
                                    team.lastmatch.awayscore = lastEvent.outcome.opponentTeamScore;
                                }
                                return callback(null, team);
                            });
                        }
                        catch (err) {
                            return callback(err, team);
                        }
                    });
                }, 500);
            },
            */

            // Ok, now let's finish it with a drumroll. Get that awesome top scorer dude!
            function (team, callback) {

                try {
                    var q = mongoDb.players.find({ "teamId": team.id });
                    q.sort({ "stats.season.assistsTotal": -1 });
                    q.limit(1);
                    q.select('name uniformNumber pic stats.season.assistsTotal');
                    q.exec(function (err, players) {
                        if (err)
                            return callback(err, team);

                        if (players.length == 0)
                            return callback(null, team, null);

                        team.topassister = players[0]._id.toString();

                        return callback(null, team, players[0]);
                    });
                }
                catch (err) {
                    log.error(err.stack);
                    return callback(null, team);
                }

            },
            // Ok, now let's finish it with a drumroll. Get that awesome top scorer dude!
            function (team, assistPlayer, callback) {
                try {
                    var q = mongoDb.players.find({ "teamId": team.id });
                    q.sort({ "stats.season.goalsTotal": -1 });
                    q.limit(1);
                    q.select('name uniformNumber pic stats.season.goalsTotal');
                    q.exec(function (err, players) {
                        if (err)
                            return callback(err, team);

                        if (players.length == 0)
                            return callback(null, team, assistPlayer, null);

                        team.topscorer = players[0]._id.toString();

                        return callback(null, team, assistPlayer, players[0]);
                    });
                }
                catch (err) {
                    log.error(err.stack);
                    return callback(null, team, assistPlayer);
                }
            }],

        function (error, team, assistPlayer, player) {
            if (error) {
                log.error(error.stack);
                return outerCallback(error);
            }

            team.save(function (err, result) {
                if (err)
                    return outerCallback(err);

                result = result.toObject();

                if (!player || !player.stats || !player.stats.season || !player.stats.season.goalsTotal)
                    delete result.topscorer;
                else
                    result.topscorer = player;

                if (!assistPlayer || !assistPlayer.stats || !assistPlayer.stats.season || !assistPlayer.stats.season.assistsTotal)
                    delete result.topassister;
                else
                    result.topassister = assistPlayer;
                return outerCallback(null, result);
            });
        }

    );


};

// Get player stats. If season is null, then return the career stats, else the stats for the given season.
Parser.GetPlayerStats = function (leagueName, playerId, season, callback) {
    let isCareer = false;
    if (!season) {
        isCareer = true;
    }

    //soccer/epl/stats/players/345879?enc=true&
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/stats/players/" + playerId + (isCareer ? "?accept=json&enc=true&careerOnly=true&" : "?accept=json&season=" + season + "&") + signature;

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode == 404)
                return callback(null, null);
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));

            var playerStats = response.body.apiResults[0].league.players[0].seasons[0].eventType[0].splits[0].playerStats;
            return callback(null, playerStats);
        }
        catch (err) {
            return callback(err);
        }
    });
};

Parser.GetPlayerInTeamStats = function (leagueName, teamId, playerId, callback) {
    //soccer/epl/stats/players/345879?enc=true&
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/stats/players/" + playerId + "/teams/" + teamId + "?accept=json&" + signature;

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode == 404)
                return callback(null, null);
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));

            var playerStats = response.body.apiResults[0].league.players[0].seasons[0].eventType[0].splits[0].playerStats;
            return callback(null, playerStats);
        }
        catch (err) {
            return callback(err);
        }
    });
};

Parser.GetTeamPlayers = function (leagueName, languageId, callback) {
    //soccer/epl/participants/teams/6154?languageId=19
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/participants/?" + signature + "&languageId=" + languageId;

    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));

            var players = response.body.apiResults[0].league;
            callback(null, players);
        }
        catch (err) {
            return callback(err);
        }
    });
};

Parser.GetLeagueTeams = function (leagueName, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/teams/?" + signature;

    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            var teams = response.body.apiResults[0].league.season.conferences[0].divisions[0].teams;
            callback(null, teams);
        }
        catch (err) {
            return callback(err);
        }
    });
};

Parser.GetLeagueStandings = function (leagueName, season, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/standings/?live=false&eventTypeId=1&" + (season ? "season=" + season + "&" : "") + signature;

    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error) {
            return callback(error);
        }
        if (!response.body.apiResults)
            log.error(response.body.message || response.body);
        try {
            var standings = response.body.apiResults[0].league.season.eventType[0].conferences[0].divisions[0].teams;
            var season = response.body.apiResults[0].league.season.season;
            callback(null, standings, season);
        }
        catch (err) {
            return callback();
        }
    });

};


Parser.GetLeagueSeasonFixtures = function (leagueName, seasonYear, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/scores/?" + signature + "&season=" + seasonYear; // or + GetSeasonYear();
    // console.log(url);
    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error)
            return callback(error);

        if (response.body.status != 'OK' || response.body.recordCount == 0)
            return callback(new Error(JSON.stringify(response.body)));

        try {
            let fixtures = [];
            _.forEach(response.body.apiResults[0].league.season.eventType, function (category) {
                fixtures = _.concat(fixtures, category.events);
            });
            callback(null, fixtures);
        }
        catch (err) {
            return callback(err);
        }
    });

};


Parser.GetTeamSeasonFixtures = function (leagueName, teamId, seasonYear, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/scores/teams/" + teamId + "?" + signature + "&season=" + seasonYear + "&linescore=false";

    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error)
            return callback(error);

        if (response.body.status != 'OK' || response.body.recordCount == 0)
            return callback(new Error(response.body));

        try {
            let fixtures = [];
            _.forEach(response.body.apiResults[0].league.season.eventType, function (category) {
                fixtures = _.concat(fixtures, category.events);
            });
            callback(null, fixtures);
        }
        catch (err) {
            return callback(err);
        }
    });

};


Parser.GetMatchEvents = function (leagueName, matchId, callback) {
    var signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    var url = configuration.urlPrefix + leagueName + "/events/" + matchId + "?pbp=true&" + signature; // &box=true for boxing statistics

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));
            var events = response.body.apiResults[0].league.season.eventType[0].events[0].pbp;
            var teams = response.body.apiResults[0].league.season.eventType[0].events[0].teams;
            var matchStatus = response.body.apiResults[0].league.season.eventType[0].events[0].eventStatus;
            callback(null, events, teams, matchStatus);
        }
        catch (err) {
            console.log(err);
            if (callback)
                return callback(err);
        }
    });
};

// Parser methods that other modules may call:

Parser.UpdateCompetitionTeamsStats = function (competitionId, season, callback) {
    mongoDb.competitions.findById(competitionId, function (competitionError, competition) {
        if (competitionError)
            return callback(competitionError);

        if (!competition.parserids || !competition.parserids[Parser.Name])
            return callback(new Error('No proper parserids found in selected competition with id ' + competitionId));

        Parser.FindMongoTeamsInCompetition(competitionId, function (error, teams) {
            if (error)
                return callback(error);

            async.eachSeries(teams, function (team, cbk) {
                setTimeout(function () {
                    Parser.UpdateTeamStats(competition.parserids[Parser.Name], team.parserids[Parser.Name], season, function (teamError, updateOutcome) {
                        if (teamError)
                            log.error(teamError.message);
                        cbk(null);
                    })
                }, 1000);
            }, function (seriesErr) {
                if (seriesErr)
                    log.error(seriesErr.message);

                callback(null);
            });
        });
    });

};

Parser.GetCompetitionTeamsStatsSchedule = function (competitionId, callback) {
    var schedule = Parser.methodSchedules['UpdateCompetitionStats'];
    return callback(null, schedule);
};


Parser.CreateCompetitionTeamsStatsSchedule = function (competitionId, season, schedulePattern, callback) {
    if (Parser.methodSchedules['UpdateCompetitionStats']) {
        log.info('Deleting existing UpdateCompetitionStats schedule to replace it with a new one');
        Parser.methodSchedules['UpdateCompetitionStats'].cancel();

    }

    log.info('Scheduling UpdateCompetitionStats for season %s with the pattern %s', season, schedulePattern);
    Parser.methodSchedules['UpdateCompetitionStats'] = scheduler.scheduleJob(schedulePattern, function () {
        log.info('Scheduled job is running for %s', Parser.methodSchedules['UpdateCompetitionStats']);
        Parser.UpdateCompetitionTeamsStats(competitionId, season, function (error, data) {
            if (error)
                log.error(error.message);

        });
    });

    let newSetting = {
        competitionId: competitionId,
        season: season,
        cronPattern: schedulePattern
    };

    mongoDb.gameserversettings.findOne({}, function (findError, settings) { //{'scheduledTasks.updateTeamStats.competitionId': competitionId, 'scheduledTasks.updateTeamStats.season': season}, {$pull: {'scheduledTasks.updateTeamStats' : { 'scheduledTasks.updateTeamStats.competitionId': competitionId, 'scheduledTasks.updateTeamStats.season': season} } }, { safe: true }, function(removeError, settings) {
        if (findError)
            return callback(findError);

        if (settings && settings.scheduledTasks)
            // let instanceToBeRemoved = _.find(settings.scheduledTasks.updateTeamStats, { competitionId: competitionId, season: season });
            // if (instanceToBeRemoved)
            _.remove(settings.scheduledTasks, { competitionId: competitionId, season: season });
        if (settings)
            settings.scheduledTasks.push(newSetting);
        if (!settings) {
            settings = new mongoDb.gameserversettings({
                scheduledTasks: []
            });
            settings.scheduledTasks.push(newSetting);
        }
        settings.markModified('scheduledTasks');

        settings.save(function (saveError) {
            if (saveError)
                return callback(saveError);

            callback(null, Parser.methodSchedules['UpdateCompetitionStats']);
        });
    });
};


Parser.DeleteCompetitionTeamsStatsSchedule = function (competitionId, season, schedulePattern, callback) {
    if (Parser.methodSchedules['UpdateCompetitionStats']) {
        log.info('Deleting existing UpdateCompetitionStats schedule');
        Parser.methodSchedules['UpdateCompetitionStats'].cancel();
    }
    callback(null);
};

Parser.UpdateTeams = function (competitionId, callback) {
    mongoDb.competitions.findById(competitionId, function (err, competition) {
        if (err)
            return callback(err);

        const leagueName = competition.parserids[Parser.Name];
        const leagueId = competition.id;

        if (!leagueName || !leagueId)
            return callback(new Error('No league name or league Id is defined in call'));

        if (!Parser.Configuration.supportedLanguages)
            return callback(new Error('No supported languages are defined in parser&apos;s configuration'));

        if (_.indexOf(Parser.Configuration.supportedLanguages, "en") < 0)
            return callback(new Error('The default english language ("en") is NOT set amongst the supported languages in parser&apos;s configuration.'));


        // get all teams, and then collect all teamIds and query for the related players
        mongoDb.teams.find({ competitionid: leagueId }, function (teamError, existingTeams) {
            if (teamError)
                return callback(teamError);

            let existingTeamIds = _.map(existingTeams, function (team) { return team.id; });

            let existingTeamsLookup = {};
            _.forEach(existingTeams, function (team) {
                if (team.parserids && team.parserids[Parser.Name] && !existingTeamsLookup[team.parserids[Parser.Name]])
                    existingTeamsLookup[team.parserids[Parser.Name]] = team;
            });

            mongoDb.players.find({ teamId: { '$in': existingTeamIds } }, function (playerError, existingPlayers) {
                if (playerError)
                    return callback(playerError);

                let languageData = {};


                let existingPlayersLookup = {};
                _.forEach(existingPlayers, function (player) {
                    if (player.parserids[Parser.Name] && !existingPlayersLookup[player.parserids[Parser.Name]])
                        existingPlayersLookup[player.parserids[Parser.Name]] = player;
                });

                async.eachSeries(Parser.Configuration.supportedLanguages, function (language, cbk) {
                    if (languageMapping[language]) {
                        Parser.GetTeamPlayers(leagueName, languageMapping[language], function (error, data) {
                            if (error)
                                return cbk(error);

                            languageData[language] = data;
                            cbk();
                        });
                    }
                    else {
                        async.setImmediate(function () {
                            cbk(new Error('language ' + language + ' is not found amongst languageMapping dictionary.'));
                        });
                    }
                },
                    function (error) {
                        if (error && !languageData["en"])
                            return callback(error);


                        let parsedTeams = {};
                        let parsedPlayers = {};
                        let teamsToAdd = [];
                        let teamsToUpdate = [];
                        let playersToAdd = [];
                        let playersToUpdate = [];
                        //let playersToRemove = [];

                        let creationDate = new Date();

                        // Find the players that exist in existingPlayersLookup but not in languageData["en"].players and add them to playersToUpdate after unlinking them from their team
                        // Similarly find the teams that exist in existingTeamsLookup but not in languageData["en"].players and add them to teamsToUpdate after unlinking them from their competition
                        let updatedPlayersLookup = {};
                        let updatedTeamsLookup = {};
                        _.forEach(languageData["en"].players, function (player) {
                            if (!updatedPlayersLookup[player.playerId])
                                updatedPlayersLookup[player.playerId] = true;
                            if (!updatedTeamsLookup[player.team.teamId])
                                updatedTeamsLookup[player.team.teamId] = true;
                        });
                        _.forEach(existingTeams, function (team) {
                            if (!updatedTeamsLookup[team.parserids[Parser.Name]]) {
                                team.competitionId = null;
                                teamsToUpdate.push(team);
                            }
                        });
                        _.forEach(_.values(existingPlayersLookup), function (lookup) {
                            if (!updatedPlayersLookup[lookup.parserids[Parser.Name]]) {
                                lookup.teamId = null;
                                playersToUpdate.push(lookup);
                                //playersToRemove.push(lookup);
                            }
                        });

                        // Scan the english data to get all teams
                        _.forEach(languageData["en"].players, function (player) {
                            if (player.team && player.team.teamId) {
                                if (!parsedTeams[player.team.teamId]) {
                                    // If new team, add to teamsToAdd collection
                                    if (!existingTeamsLookup[player.team.teamId]) {
                                        var newTeam = new mongoDb.teams();
                                        //newTeam.name_en = player.team.displayName;
                                        newTeam.name = { "en": player.team.displayName };
                                        newTeam.name["abbr"] = player.team.abbreviation;
                                        newTeam.logo = null;
                                        //newTeam.league = leagueName;
                                        newTeam.created = creationDate;
                                        newTeam.parserids = {};
                                        newTeam.parserids[Parser.Name] = player.team.teamId;
                                        newTeam.competitionid = leagueId;

                                        parsedTeams[player.team.teamId] = newTeam;
                                        newTeam.save();
                                        teamsToAdd.push(newTeam);
                                    }
                                    else {
                                        var oldTeam = existingTeamsLookup[player.team.teamId];
                                        if (!oldTeam.name)
                                            oldTeam.name = {};
                                        oldTeam.name["en"] = player.team.displayName;
                                        oldTeam.name["abbr"] = player.team.abbreviation;
                                        if (!oldTeam.logo)
                                            oldTeam.logo = null; // leave this property untouched to what it was
                                        if (!oldTeam.parserids)
                                            oldTeam.parserids = {};
                                        oldTeam.parserids[Parser.Name] = player.team.teamId;
                                        oldTeam.competitionid = leagueId;

                                        parsedTeams[player.team.teamId] = oldTeam;
                                        teamsToUpdate.push(oldTeam);
                                    }
                                }

                                if (player.playerId && !parsedPlayers[player.playerId]) {
                                    // If new player, add to playersToAdd collection
                                    if (!existingPlayersLookup[player.playerId]) {
                                        var newPlayer = new mongoDb.players();
                                        if (player.firstName)
                                            newPlayer.firstName = { "en": player.firstName };
                                        if (player.lastName)
                                            newPlayer.lastName = { "en": player.lastName };
                                        newPlayer.name = { "en": (player.firstName ? player.firstName + " " : "") + player.lastName };
                                        newPlayer.uniformNumber = player.uniform;
                                        newPlayer.position = player.positions[0].name;
                                        newPlayer.personalData = {
                                            height: player.height,
                                            weight: player.weight,
                                            birth: player.birth,
                                            nationality: player.nationality
                                        };
                                        newPlayer.parserids = {};
                                        newPlayer.parserids[Parser.Name] = player.playerId;
                                        newPlayer.created = creationDate;

                                        if (parsedTeams[player.team.teamId]._id)
                                            newPlayer.teamId = parsedTeams[player.team.teamId].id;

                                        parsedPlayers[player.playerId] = newPlayer;
                                        playersToAdd.push(newPlayer);
                                    }
                                    else {
                                        var oldPlayer = existingPlayersLookup[player.playerId];
                                        if (!oldPlayer.firstName)
                                            oldPlayer.firstName = {};
                                        if (player.firstName)
                                            oldPlayer.firstName["en"] = player.firstName;
                                        oldPlayer.lastName_en = player.lastName;
                                        if (!oldPlayer.lastName)
                                            oldPlayer.lastName = {};
                                        if (player.lastName)
                                            oldPlayer.lastName["en"] = player.lastName;
                                        if (!oldPlayer.name)
                                            oldPlayer.name = {};
                                        oldPlayer.name["en"] = (player.firstName ? player.firstName + " " : "") + player.lastName;
                                        oldPlayer.uniformNumber = player.uniform;
                                        oldPlayer.position = player.positions[0].name;
                                        oldPlayer.personalData = {
                                            height: player.height,
                                            weight: player.weight,
                                            birth: player.birth,
                                            nationality: player.nationality
                                        };
                                        if (!oldPlayer.parserids)
                                            oldPlayer.parserids = {};
                                        oldPlayer.parserids[Parser.Name] = player.playerId;

                                        if (parsedTeams[player.team.teamId]._id)
                                            oldPlayer.teamId = parsedTeams[player.team.teamId].id;

                                        parsedPlayers[player.playerId] = oldPlayer;
                                        playersToUpdate.push(oldPlayer);

                                    }
                                }
                            }
                        });


                        // Now merge other languages data with english ones, based on their id.
                        _.forEach(languageData, function (value, key, val) {
                            _.forEach(value.players, function (player) {
                                if (parsedTeams[player.team.teamId])
                                    parsedTeams[player.team.teamId].name[key] = player.team.displayName;

                                if (parsedPlayers[player.playerId]) {
                                    if (player.firstName) {
                                        if (!parsedPlayers[player.playerId].firstName)
                                            parsedPlayers[player.playerId].firstName = {};
                                        parsedPlayers[player.playerId].firstName[key] = player.firstName;
                                    }
                                    parsedPlayers[player.playerId].lastName[key] = player.lastName;
                                    parsedPlayers[player.playerId].name[key] = (player.firstName ? player.firstName + " " : "") + player.lastName;
                                }
                            });
                        });

                        // Try Upserting in mongo all teams and players
                        try {
                            async.parallel([
                                function (innerCallback) {
                                    if (teamsToAdd && teamsToAdd.length > 0) {
                                        async.each(teamsToAdd, function (teamToAdd, cbk1) {
                                            return teamToAdd.save(cbk1);
                                        }, innerCallback);
                                    }
                                    else
                                        innerCallback(null);
                                },
                                function (innerCallback) {
                                    if (playersToAdd && playersToAdd.length > 0) {
                                        async.each(playersToAdd, function (playerToAdd, cbk2) {
                                            return playerToAdd.save(cbk2);
                                        }, innerCallback);
                                    }
                                    else
                                        innerCallback(null);
                                },
                                function (innerCallback) {
                                    if (teamsToUpdate && teamsToUpdate.length > 0) {
                                        async.each(teamsToUpdate, function (teamToUpdate, cbk3) {
                                            return teamToUpdate.save(cbk3);
                                        }, innerCallback);
                                    }
                                    else
                                        innerCallback(null);
                                },
                                function (innerCallback) {
                                    if (playersToUpdate && playersToUpdate.length > 0) {
                                        async.each(playersToUpdate, function (playerToUpdate, cbk4) {
                                            return playerToUpdate.save(cbk4);
                                        }, innerCallback);
                                    }
                                    else
                                        innerCallback(null);
                                }
                            ], function (parallelError, parallelResults) {
                                if (parallelError)
                                    return callback(parallelError);

                                callback(null, teamsToAdd, teamsToUpdate, playersToAdd, playersToUpdate);
                            });

                        }
                        catch (err) {
                            return callback(err);
                        }


                        //callback(null, teamsToAdd, teamsToUpdate, playersToAdd, playersToUpdate);
                    });
            });

        }); // competitionid: leagueId
    });
};


var GetLeagueFromMongo = function (leagueId, callback) {
    mongoDb.competitions.findById(leagueId, function (error, competition) {
        if (error)
            return callback(error);

        if (!competition.parserids || !competition.parserids[Parser.Name])
            return callback(new Error('The selected competition (id:' + leagueId + ') does not have a valid ' + Parser.Name + ' parser id.'));

        callback(null, competition);
    });
};


Parser.UpdateLeagueStandings = function (competitionDocument, leagueId, season, outerCallback) {
    leagueId = competitionDocument ? competitionDocument.id : leagueId;
    //statsLeagueId = competitionDocument.parserids[Parser.Name] || statsLeagueId;

    if (!leagueId)
        return outerCallback(new Error('No league id is defined in call'));

    // Schedule cascading callback functions: 
    // get competition, 
    // get teams for this competition and build a lookup dictionary
    // get standings for this competition and fill in team ids from lookup dictionary
    async.waterfall(
        [
            function (callback) {
                console.log("Starting standings waterfall");
                if (competitionDocument && competitionDocument.parserids && competitionDocument.parserids[Parser.Name])
                    return async.setImmediate(function () {
                        return callback(null, competitionDocument);
                    });
                GetLeagueFromMongo(leagueId, function (error, competition) {
                    if (error)
                        return callback(error);
                    return callback(null, competition);
                });
            },
            function (competition, callback) {
                var parserQuery = 'parserids.' + Parser.Name;                
                mongoDb.teams.find().ne(parserQuery, null).where('competitionid', leagueId).exec(function (teamError, teams) {
                    if (teamError)
                        return callback(teamError);

                    var existingTeamIds = {};
                    _.forEach(teams, function (team) {
                        if (team.parserids[Parser.Name] && !existingTeamIds[team.parserids[Parser.Name]])
                            existingTeamIds[team.parserids[Parser.Name]] = team;
                    });

                    return callback(null, competition, existingTeamIds);
                });
            },
            function (competition, existingTeamIds, callback) {
                var statsLeagueId = competition.parserids[Parser.Name];                 
                Parser.GetLeagueStandings(statsLeagueId, season, function (error, standings, seasonYear) {
                    if (error)
                        return callback(error);

                    callback(null, competition, existingTeamIds, standings, seasonYear);
                });

            },
            function (competition, existingTeamIds, standings, seasonYear, callback) {
                mongoDb.standings.where('season', seasonYear).where('competitionid', competition.id).exec(function (error, standing) {
                    if (error)
                        return callback(error);

                    callback(null, competition, existingTeamIds, standings, seasonYear, standing ? standing[0] : null);
                });
            }
        ], function (error, competition, existingTeamIds, standings, seasonYear, standing) {
            if (error) {
                log.error(error);
                if (outerCallback)
                    return outerCallback(error);
            }

            if (!standings)
                if (outerCallback)
                    return outerCallback(null, null);

            // Translate the global properties and then iterate over the team properties inside the teams array.
            var newStandings = null;
            if (standing)
                newStandings = standing;
            else
                newStandings = new mongoDb.standings();

            newStandings.competitionid = leagueId;
            newStandings.name = competition.name;
            newStandings.identity = Parser.Name;
            newStandings.season = seasonYear;
            newStandings.teams = [];
            newStandings.lastupdate = new Date();
           

            standings.forEach(function (teamStanding) {
                if (existingTeamIds[teamStanding.teamId]) {
                    var team = {
                        rank: teamStanding.league.rank,
                        teamName: existingTeamIds[teamStanding.teamId].name,
                        teamId: existingTeamIds[teamStanding.teamId].id,
                        points: teamStanding.teamPoints,
                        pointsPerGame: teamStanding.teamPointsPerGame || "0",
                        penaltyPoints: teamStanding.penaltyPoints,
                        wins: teamStanding.record.wins,
                        losses: teamStanding.record.losses,
                        ties: teamStanding.record.ties,
                        gamesPlayed: teamStanding.record.gamesPlayed,
                        goalsFor: teamStanding.goalsFor.overall,
                        goalsAgainst: teamStanding.goalsAgainst.overall
                    };

                    newStandings.teams.push(team);
                }
            });

            //newStandings.teams.markModified();
            newStandings.save(function (err,data) {
                if (err)
                    return outerCallback(err);

                if (outerCallback)
                    outerCallback(null, leagueId);
            });
        });

};

Parser.UpdateStandings = function (season, callback) {

    let leagueStandingsUpdated = [];

    // Get all competitions from Mongo
    mongoDb.competitions.find({}, function (competitionError, leagues) {
        if (competitionError)
            return callback(competitionError, leagueStandingsUpdated);

        async.eachLimit(leagues, 1, function (league, cbk) {
            // Get all teams foreach competition
            setTimeout(function () {
                console.log("Requesting UpdateLeagueStandings for " + league.id);
                Parser.UpdateLeagueStandings(league, league.id, season, function (error, leagueid) {
                    if (error)
                        return cbk(error);
                    if (leagueid)
                        leagueStandingsUpdated.push(leagueid);
                    cbk();
                });
            }, 1000)
        }, function (asyncError) {
            if (asyncError)
                return callback(asyncError, leagueStandingsUpdated);

            callback(null, leagueStandingsUpdated);
        });
    });
};


Parser.GetCompetitionFixtures = function (competitionId, seasonYear, outerCallback) {
    if (!competitionId)
        return outerCallback(new Error('No competition id parameter is included in the request.'));

    const season = seasonYear || Parser.GetSeasonYear();

    // Get competition from Mongo
    // Get teams from Mongo and build the team lookup dictionary
    // Get the fixtures
    // Filter the fixtures for the ones scheduled in the future, and return the results
    async.waterfall([
        function (callback) {
            GetLeagueFromMongo(competitionId, function (error, competition) {
                if (error)
                    return callback(error);
                return callback(null, competition);
            });
        },
        function (competition, callback) {
            let parserQuery = 'parserids.' + Parser.Name;

            mongoDb.teams.find().ne(parserQuery, null).where('competitionid', competitionId).select('parserids competitionid logo name').exec(function (teamError, teams) {
                if (teamError)
                    return callback(teamError);

                let existingTeamIds = {};
                _.forEach(teams, function (team) {
                    if (team.parserids[Parser.Name] && !existingTeamIds[team.parserids[Parser.Name]])
                        existingTeamIds[team.parserids[Parser.Name]] = team;
                });

                return callback(null, competition, existingTeamIds);
            });
        },
        function (competition, existingTeamIds, callback) {
            let statsLeagueId = competition.parserids[Parser.Name];

            Parser.GetLeagueSeasonFixtures(statsLeagueId, competition.season || season, function (error, fixtures) {
                if (error)
                    return callback(error);

                callback(null, competition, existingTeamIds, fixtures);
            });
        },
    ], function (asyncError, competition, existingTeamIds, fixtures) {
        if (asyncError)
            return outerCallback(asyncError);

        const now = new Date();
        let futureFixtures = _.filter(fixtures, function (fixture) {
            if (!fixture.startDate || fixture.startDate.length < 2)
                return false;
            if (fixture.eventStatus.isActive)
                return false;

            const startDateString = fixture.startDate[1].full;
            const startDate = Date.parse(startDateString);

            return startDate > moment().subtract(5, 'h');
        });

        var futureSchedules = _.map(futureFixtures, function (fixture) {
            try {
                let homeTeam, awayTeam;
                if (fixture.teams[0].teamLocationType.teamLocationTypeId == 1)
                    homeTeam = fixture.teams[0];
                if (fixture.teams[0].teamLocationType.teamLocationTypeId == 2)
                    awayTeam = fixture.teams[0];
                if (fixture.teams[1].teamLocationType.teamLocationTypeId == 1)
                    homeTeam = fixture.teams[1];
                if (fixture.teams[1].teamLocationType.teamLocationTypeId == 2)
                    awayTeam = fixture.teams[1];
                let homeTeamObj, awayTeamObj = null;
                if (existingTeamIds[homeTeam.teamId]) {
                    homeTeamObj = _.pick(existingTeamIds[homeTeam.teamId], ['name', 'logo']);
                    homeTeamObj._id = existingTeamIds[homeTeam.teamId].id;
                }
                if (existingTeamIds[awayTeam.teamId]) {
                    awayTeamObj = _.pick(existingTeamIds[awayTeam.teamId], ['name', 'logo']);
                    awayTeamObj._id = existingTeamIds[awayTeam.teamId].id;
                }

                let schedule = {
                    sport: 'soccer',
                    home_team: homeTeamObj,
                    away_team: awayTeamObj,
                    name: `${existingTeamIds[homeTeam.teamId] ? existingTeamIds[homeTeam.teamId].name.en : ''} - ${existingTeamIds[awayTeam.teamId] ? existingTeamIds[awayTeam.teamId].name.en : ''}`,
                    competitionId: competition.id,
                    competitionName: competition.name,
                    home_score: 0,
                    away_score: 0,
                    time: null,
                    parserids: {},
                    moderation: [],
                    start: moment.utc(fixture.startDate[1].full).toDate(),
                    state: 0
                };

                //schedule.parserids["Stats"] = fixture.eventId;
                schedule.moderation.push({
                    type: 'rss-feed',
                    parsername: Parser.Name,
                    active: false,
                    parserid: fixture.eventId
                });

                return schedule;
            }
            catch (err) {
                return;
            }
        });

        outerCallback(null, futureSchedules);
    });
};


// Approximate calculation of season Year from current date
var GetSeasonYear = function () {
    var now = new Date();
    if (now.getMonth() > 6)
        return now.getFullYear();
    else return now.getFullYear() - 1;
};

Parser.UpdateTeamPlayersCareerStats = function (teamId, seasonYear, outerCallback) {
    // Schedule the following cascading callbacks:
    // 1. Get the team from Mongo by the teamId
    // 2. Get the linked competition
    // 3. Get the team's linked players in mongo and build a dictionary of their ids as keys
    // 4. Call for each player having a valid parserids["Stats"] id, the stats endpoint for the player career stats
    // 5. Finally, update each player's document and save back in Mongo

    if (!seasonYear)
        seasonYear = GetSeasonYear();

    async.waterfall([
        function (callback) {
            return mongoDb.teams.findById(teamId, callback);
        },
        function (team, callback) {
            GetLeagueFromMongo(team.competitionid, function (error, competition) {
                if (error)
                    return callback(error);
                callback(null, team, competition);
            });
        },
        function (team, competition, callback) {
            mongoDb.players.find({ teamId: teamId }, function (error, data) {
                if (error)
                    return callback(error);

                let playersLookup = {};
                _.forEach(data, function (player) {
                    if (player.parserids && player.parserids[Parser.Name] && !playersLookup[player.parserids[Parser.Name]])
                        playersLookup[player.parserids[Parser.Name]] = player;
                });

                callback(null, team, competition, playersLookup);
            });
        }
    ], function (error, team, competition, playersLookup) {
        if (error)
            return outerCallback(error);


        let playerStatIds = _.keys(playersLookup);
        let updatedPlayerStats = 0;

        async.eachSeries(playerStatIds, function (playerId, innerCallback) {
            async.waterfall([
                // first waterfall step: get the player's stats while in the team
                function (callback) {
                    if (!team.parserids[Parser.Name])
                        async.setImmediate(function () {
                            callback(null);
                        });
                    // wait for .5 sec, to anticipate the service's throttling
                    setTimeout(function () {
                        Parser.GetPlayerInTeamStats(competition.parserids[Parser.Name], team.parserids[Parser.Name], playerId, function (statsError, stats) {
                            if (statsError) {
                                log.warn('Error while calling team GetPlayerInTeamStats for player %s', playerId);
                                return callback();
                            }

                            let playerDocInstance = playersLookup[playerId];
                            if (!playerDocInstance.stats)
                                playerDocInstance.stats = {};
                            playerDocInstance.stats["team"] = TranslatePlayerStats(stats);

                            callback(null);
                        });
                    }, 500);
                },
                // next waterfall step: get the player's career stats
                function (callback) {
                    // wait for .5 sec, to anticipate the service's throttling
                    setTimeout(function () {
                        Parser.GetPlayerStats(competition.parserids[Parser.Name], playerId, null, function (statsError, stats) {
                            if (statsError) {
                                log.warn('Error while calling career GetPlayerInTeamStats for player %s', playerId);
                                return callback();
                            }

                            let playerDocInstance = playersLookup[playerId];
                            if (!playerDocInstance.stats)
                                playerDocInstance.stats = {};
                            playerDocInstance.stats["career"] = TranslatePlayerStats(stats);

                            callback(null);
                        });
                    }, 500);
                },
                // next waterfall step: get the player's last season stats
                function (callback) {
                    // wait for .5 sec, to anticipate the service's throttling
                    setTimeout(function () {
                        Parser.GetPlayerStats(competition.parserids[Parser.Name], playerId, seasonYear, function (statsError, stats) {
                            if (statsError) {
                                log.warn('Error while calling season GetPlayerInTeamStats for player %s', playerId);
                                return callback();
                            }

                            let playerDocInstance = playersLookup[playerId];
                            if (!playerDocInstance.stats)
                                playerDocInstance.stats = {};
                            playerDocInstance.stats["season"] = TranslatePlayerStats(stats);

                            callback(null);
                        });
                    }, 500);
                },
            ],
                function (inneError) {
                    innerCallback();
                });
        }, function (outerError) {
            if (outerError)
                return outerCallback(outerError);

            // save all documents in playersLookup
            //     // Save playerDocInstance document back in Mongo
            //     playerDocInstance.save(innerCallback);
            //     updatedPlayerStats++;
            let allPlayers = _.values(playersLookup);
            _.forEach(allPlayers, function (onePlayer) {
                onePlayer.markModified('stats');
                onePlayer.save();
            });

            outerCallback(null, updatedPlayerStats);
        });

        //outerCallback(null, results);
    });
};


// Execute all update functions that bring back team and player stats for a given competition and season
Parser.UpdateAllCompetitionStats = function (competitionId, season, outerCallback) {

    // TODO: We should check if next match date < Date.now and then call for stats update to team and players, otherwise it is not needed.
    var competitionTeams = [];
    var competition;
    var itsNow = moment.utc();
    async.waterfall(
        [
            function (callback) {
                mongoDb.competitions.findById(competitionId, function (error, comp) {
                    if (error)
                        return callback(error);
                    competition = comp;
                    callback(null);
                });
            },
            function (callback) {
                Parser.UpdateTeams(competitionId, function (error, teamsAdded, playersAdded, teamsUpdated, playersUpdated) {
                    if (error)
                        return callback(error);
                    callback(null);
                });
            },
            function (callback) {
                Parser.FindMongoTeamsInCompetition(competitionId, function (error, teams) {
                    if (error)
                        return callback(error);

                    // Filter teams for the ones that should be updated, the ones that their next match date has already passed.
                    competitionTeams = _.filter(teams, function (ateam) {
                        return (!ateam.nextmatch || !ateam.nextmatch.eventdate || moment.utc(ateam.nextmatch.eventdate).isBefore(itsNow));
                    });
                    callback(null);
                });
            },
            function (callback) {
                if (!competition.parserids || !competition.parserids.Stats)
                    async.setImmediate(function () {
                        callback(null);
                    });
                else {
                    log.info('Now on to updating team standings for competition %s', competition.name.en);
                    Parser.UpdateLeagueStandings(competition, competition.id, season, function (standingsError) {
                        callback(null);
                    });
                }
            },
            function (callback) {
                async.eachSeries(competitionTeams, function (team, innerCallback) {
                    return Parser.UpdateTeamPlayersCareerStats(team.id, season, innerCallback);
                }, function (seriesError) {
                    if (seriesError)
                        log.error(seriesError.message);
                    //return callback(seriesError);
                    callback(null);
                });
            },
            function (callback) {
                //return Parser.UpdateCompetitionTeamsStats(competitionId, season, callback);
                async.eachSeries(competitionTeams, function (team, cbk) {
                    setTimeout(function () {
                        Parser.UpdateTeamStats(competition.parserids[Parser.Name], team.parserids[Parser.Name], season, function (teamError, updateOutcome) {
                            if (teamError)
                                log.error(teamError.message);
                            cbk(null);
                        })
                    }, 1000);
                }, function (seriesErr) {
                    if (seriesErr)
                        log.error(seriesErr.message);

                    callback(null);
                });

            },
            function (callback) {
                async.eachSeries(competitionTeams, function (team, innerCallback) {
                    if (!competition.parserids || !team.parserids || !competition.parserids.Stats || !team.parserids.Stats)
                        async.setImmediate(function () {
                            innerCallback(null);
                        });
                    else {
                        log.info('Now on to updating full stats for team %s', team.name.en);

                        Parser.UpdateTeamStatsFull(competition.parserids.Stats, team.parserids.Stats, season, function (teamStatsError) {
                            innerCallback(null);
                        });

                    }
                }, callback);
            }
        ], function (error) {
            if (error) {
                log.error('Error while updating all stats for competition %s and season %d: %s', competitionId, season, error.message);
                return outerCallback(error);
            }
            log.info('Terminated updating teams and players statistics with success for competition %s', competitionId);
            outerCallback(null);
        });
};


Parser.TestGuruStats = function (callback) {
    mongoDb.scheduled_matches.findById('57ea626c7b588100f9d9551c', function (err, match) {
        if (err)
            return callback(err);
        return Parser.UpdateGuruStats(match, callback);
    });
};

// Used properties from scheduledMatch: competition, home_team, away_team
Parser.UpdateGuruStats = function (scheduledMatch, outerCallback) {
    if (
        //!scheduledMatch.moderation || scheduledMatch.moderation.length == 0 || !scheduledMatch.moderation[0].parserid
        !scheduledMatch.home_team || !scheduledMatch.away_team)
        return outerCallback(null);

    //let parserid = scheduledMatch.moderation[0].parserid;
    let competitionid = scheduledMatch.competition;
    let homeTeamId = scheduledMatch.home_team;
    let awayTeamId = scheduledMatch.away_team;

    let leagueName;
    let homeTeamParserId, awayTeamParserId;
    let season;
    // Get competition parser id, and the parser ids from the 2 teams
    async.parallel([
        function (callback) {
            mongoDb.competitions.findById(competitionid, 'parserids season', function (compError, competition) {
                if (compError)
                    return callback(compError);
                leagueName = competition.parserids[Parser.Name];
                season = competition.season;
                callback(null, leagueName);
            });
        },
        function (callback) {
            mongoDb.teams.findById(homeTeamId, 'parserids', function (teamError, team) {
                if (teamError)
                    return callback(teamError);

                if (team.parserids && team.parserids[Parser.Name])
                    homeTeamParserId = team.parserids[Parser.Name];

                callback(null, homeTeamParserId);
            });
        },
        function (callback) {
            mongoDb.teams.findById(awayTeamId, 'parserids', function (teamError, team) {
                if (teamError)
                    return callback(teamError);

                if (team.parserids && team.parserids[Parser.Name])
                    awayTeamParserId = team.parserids[Parser.Name];
                callback(null, awayTeamParserId);
            });
        }
    ], function (error) {
        if (error)
            return outerCallback(error);
        if (!homeTeamParserId || !awayTeamParserId)
            return outerCallback();

        async.parallel([
            function (callback) {
                return Parser.GetTeamSeasonFixtures(leagueName, homeTeamParserId, season, callback);
            },
            function (callback) {
                setTimeout(function () {
                    return Parser.GetTeamSeasonFixtures(leagueName, awayTeamParserId, season, callback);
                }, 400);
            }
        ], function (innerError, results) {
            if (innerError)
                return outerCallback(innerError);

            let cutOffTime = moment.utc().add(3, 'hours');

            let homeTeamMatches = _.take(_.orderBy(_.filter(results[0], function (result) { return cutOffTime.isAfter(moment.utc(result.startDate[1].full)); }), ['startDate[1].full'], ['desc']), 10);
            let awayTeamMatches = _.take(_.orderBy(_.filter(results[1], function (result) { return cutOffTime.isAfter(moment.utc(result.startDate[1].full)); }), ['startDate[1].full'], ['desc']), 10);
            let homeTeamMatchParserIds = _.map(homeTeamMatches, 'eventId');
            let awayTeamMatchParserIds = _.map(awayTeamMatches, 'eventId');

            let interestingEventIds = [2, 5, 11, 20];
            // "2": "Yellow",
            // "5": "Corner",
            // "7": "Red",
            // "8": "Foul",
            // "11": "Goal",
            // "14": "Injury",
            // "16": "Offside",
            // "17": "Penalty",
            // "18": "Penalty",
            // "20": "Shot_on_Goal",
            // // "22": "Substitution",
            // "28": "Own_Goal"

            let guruStats = {
                Yellow: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Corner: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Goal: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Shot_On_Goal: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                }
            };

            let homeTeamMatchesCount = 0;
            let awayTeamMatchesCount = 0;
            // first dimension is 0 for the total stats for both teams, 1 for home team, 2 for away team.
            // second dimension is the 10 minutes match period.
            // each cell holds the average per event type (0 for Yellow, 1 for Corner, 2 for Goal, 3 for Shot on Goal)
            let index = 0;
            async.series([
                function (s1cbk) {
                    async.each(homeTeamMatchParserIds, function (parserId, callback) {
                        setTimeout(function () {
                            Parser.GetMatchEvents(leagueName, parserId, function (err, events, teams, matchStatus) {
                                if (err) {
                                    log.warn(err.message + '\nError while getting match %s events while computing Guru stats. Continuing with next one...', parserId);
                                    return callback(null);
                                }

                                homeTeamMatchesCount++;
                                let interestingEvents = _.filter(events, function (event) {
                                    return _.indexOf(interestingEventIds, event.playEvent.playEventId) > -1 && (event.teamId == homeTeamParserId);
                                });
                                _.forEach(interestingEvents, function (event) {
                                    if (!event.time || !event.time.minutes)
                                        return;

                                    let timeIndex = event.time.minutes >= 90 ? 8 : Math.floor(event.time.minutes / 10);

                                    switch (event.playEvent.playEventId) {
                                        case 2:
                                            if (!guruStats.Yellow.homeTeam[timeIndex])
                                                guruStats.Yellow.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Yellow.homeTeam[timeIndex]++;
                                            break;
                                        case 5:
                                            if (!guruStats.Corner.homeTeam[timeIndex])
                                                guruStats.Corner.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Corner.homeTeam[timeIndex]++;
                                            break;
                                        case 11:
                                            if (!guruStats.Goal.homeTeam[timeIndex])
                                                guruStats.Goal.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Goal.homeTeam[timeIndex]++;
                                            break;
                                        case 20:
                                            if (!guruStats.Shot_On_Goal.homeTeam[timeIndex])
                                                guruStats.Shot_On_Goal.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Shot_On_Goal.homeTeam[timeIndex]++;
                                            break;
                                    }
                                });
                                callback(null);
                            });
                        }, index++ * 500);
                    }, s1cbk);
                },
                function (s2cbk) {
                    index = 0;
                    async.each(awayTeamMatchParserIds, function (parserId, callback) {
                        setTimeout(function () {
                            Parser.GetMatchEvents(leagueName, parserId, function (err, events, teams, matchStatus) {
                                if (err) {
                                    log.warn(err.message + '\nError while getting match %s events while computing Guru stats. Continuing with next one...', parserId);
                                    return callback(null);
                                }

                                awayTeamMatchesCount++;
                                let interestingEvents = _.filter(events, function (event) {
                                    return _.indexOf(interestingEventIds, event.playEvent.playEventId) > -1 && (event.teamId == awayTeamParserId);
                                });
                                _.forEach(interestingEvents, function (event) {
                                    if (!event.time || !event.time.minutes)
                                        return;

                                    let timeIndex = event.time.minutes >= 90 ? 8 : Math.floor(event.time.minutes / 10);

                                    switch (event.playEvent.playEventId) {
                                        case 2:
                                            if (!guruStats.Yellow.awayTeam[timeIndex])
                                                guruStats.Yellow.awayTeam[timeIndex] = 1;
                                            else
                                                guruStats.Yellow.awayTeam[timeIndex]++;
                                            break;
                                        case 5:
                                            if (!guruStats.Corner.awayTeam[timeIndex])
                                                guruStats.Corner.awayTeam[timeIndex] = 1;
                                            else
                                                guruStats.Corner.awayTeam[timeIndex]++;
                                            break;
                                        case 11:
                                            if (!guruStats.Goal.awayTeam[timeIndex])
                                                guruStats.Goal.awayTeam[timeIndex] = 1;
                                            else
                                                guruStats.Goal.awayTeam[timeIndex]++;
                                            break;
                                        case 20:
                                            if (!guruStats.Shot_On_Goal.awayTeam[timeIndex])
                                                guruStats.Shot_On_Goal.awayTeam[timeIndex] = 1;
                                            else
                                                guruStats.Shot_On_Goal.awayTeam[timeIndex]++;
                                            break;
                                    }
                                });
                                callback(null);
                            });
                        }, index++ * 500);
                    }, s2cbk);
                }
            ], function (seriesError) {
                if (seriesError) {
                    //log.error('Failed to save Guru stats due to: %s', seriesError.message);
                    return outerCallback(seriesError);
                }

                // Calc totals and averages
                for (let i = 0; i < 9; i++) {
                    guruStats.Yellow.total[i] = (guruStats.Yellow.homeTeam[i] + guruStats.Yellow.awayTeam[i]);
                    guruStats.Corner.total[i] = (guruStats.Corner.homeTeam[i] + guruStats.Corner.awayTeam[i]);
                    guruStats.Goal.total[i] = (guruStats.Goal.homeTeam[i] + guruStats.Goal.awayTeam[i]);
                    guruStats.Shot_On_Goal.total[i] = (guruStats.Shot_On_Goal.homeTeam[i] + guruStats.Shot_On_Goal.awayTeam[i]);
                }

                mongoDb.scheduled_matches.update({ _id: scheduledMatch._id }, { guruStats: guruStats }, function (updateError) {
                    if (updateError)
                        return outerCallback(updateError);

                    outerCallback(null, guruStats);
                });
            }
            );

        });

    });
};


var TranslatePlayerStats = function (stats) {
    return {
        gamesPlayed: stats ? stats.gamesPlayed : 0,
        gamesStarted: stats ? stats.gamesStarted : 0,
        minutesPlayed: stats ? stats.minutesPlayed : 0,
        goalsTotal: stats && stats.goals && stats.goals.total ? stats.goals.total : 0,
        goalsGameWinning: stats && stats.goals && stats.goals.gameWinning ? stats.goals.gameWinning : 0,
        goalsOwn: stats && stats.goals && stats.goals.goalsOwn ? stats.goals.goalsOwn : 0,
        goalsHeaded: stats && stats.goals && stats.goals.headed ? stats.goals.headed : 0,
        goalsKicked: stats && stats.goals && stats.goals.kicked ? stats.goals.kicked : 0,
        assistsTotal: stats && stats.assists && stats.assists.total ? stats.assists.total : 0,
        assistsGameWinning: stats && stats.assists && stats.assists.gameWinning ? stats.assists.gameWinning : 0,
        shots: stats ? stats.shots : 0,
        shotsOnGoal: stats ? stats.shotsOnGoal : 0,
        crosses: stats ? stats.crosses : 0,
        penaltyKicksShots: stats && stats.penaltyKicks && stats.penaltyKicks.shots ? stats.penaltyKicks.shots : 0,
        penaltyKicksGoals: stats && stats.penaltyKicks && stats.penaltyKicks.goals ? stats.penaltyKicks.goals : 0,
        foulsCommitted: stats ? stats.foulsCommitted : 0,
        foulsSuffered: stats ? stats.foulsSuffered : 0,
        yellowCards: stats ? stats.yellowCards : 0,
        redCards: stats ? stats.redCards : 0,
        offsides: stats ? stats.offsides : 0,
        cornerKicks: stats ? stats.cornerKicks : 0,
        clears: stats ? stats.clears : 0,
        goalMouthBlocks: stats ? stats.goalMouthBlocks : 0,
        touchesTotal: stats && stats.touches && stats.touches.total ? stats.touches.total : 0,
        touchesPasses: stats && stats.touches && stats.touches.passes ? stats.touches.passes : 0,
        touchesInterceptions: stats && stats.touches && stats.touches.interceptions ? stats.touches.interceptions : 0,
        touchesBlocks: stats && stats.touches && stats.touches.blocks ? stats.touches.blocks : 0,
        tackles: stats ? stats.tackles : 0,
        attacks: stats ? stats.attacks : 0,
        overtimeShots: stats && stats.overtime && stats.overtime.shots ? stats.overtime.shots : 0,
        overtimeGoals: stats && stats.overtime && stats.overtime.goals ? stats.overtime.goals : 0,
        overtimeAssists: stats && stats.overtime && stats.overtime.assists ? stats.overtime.assists : 0,
        suspensions: stats ? stats.suspensions : 0
    };
};

// TODO: Team stat names should be the same as the events referenced through out the game.
var TranslateTeamStats = function (stats) {
    return {
        gamesPlayed: stats && stats.gamesPlayed ? stats.gamesPlayed : 0,
        Goal: stats && stats.goals.total ? stats.goals.total : 0,
        Shot_On_Goal: stats && stats.shotsOnGoal ? stats.shotsOnGoal : 0,
        Crosses: stats && stats.crosses ? stats.crosses : 0,
        Penalty: stats && stats.penaltyKicks && stats.penaltyKicks.shots ? stats.penaltyKicks.shots : 0,
        Foul: stats && stats.foulsCommitted ? stats.foulsCommitted : 0,
        Yellow: stats && stats.yellowCards ? stats.yellowCards : 0,
        Red: stats && stats.redCards ? stats.redCards : 0,
        Offside: stats && stats.offsides ? stats.offsides : 0,
        Corner: stats && stats.cornerKicks ? stats.cornerKicks : 0,
        Clear: stats && stats.clears ? stats.clears : 0
    };
};

module.exports = Parser;