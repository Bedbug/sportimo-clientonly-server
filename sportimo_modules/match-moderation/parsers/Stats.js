'use strict';

const scheduler = require('node-schedule');
const needle = require("needle");
const crypto = require("crypto-js");
const async = require('async');
const _ = require('lodash');
const moment = require('moment');
const winston = require('winston');
const mongoose = require('mongoose');
const matches = mongoose.models.scheduled_matches;
const MessagingTools = require.main.require('./sportimo_modules/messaging-tools');

const log = new (winston.Logger)({
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
// Settings for the development environment

// languageMapping maps Sportimo langage locale to Stats.com language Ids. For a list of ISO codes, see https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
const languageMapping = {
    "ar": "10", // arabic
    "en": "1", // english
    "yi": "28", // yiddish (hebrew)
    "ru": "16"

    // Add all required language mappings here from Stats.com
};


const statsComConfigDevelopment = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "http://api.stats.com/v1/stats/soccer/",
    apiKey: "mct9w8ws4fbpvj5w66se4tns",//"83839j82xy3mty4bf6459rnt",
    apiSecret: "53U7SH6N5x", //"VqmfcMTdQe",
    //gameServerUrlPrefix : "http://gameserverv2-56657.onmodulus.net/v1/",
    //gameServerTeamApi : "data/teams",
    //gameServerPlayerApi : "data/players",
    eventsInterval: 6000,  // how many milli seconds interval between succeeding calls to Stats API in order to get the refreshed match event feed.
    parserIdName: "Stats"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Settings for the production environment
const statsComConfigProduction = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "http://api.stats.com/v1/stats/soccer/",
    apiKey: "mct9w8ws4fbpvj5w66se4tns",//"83839j82xy3mty4bf6459rnt",
    apiSecret: "53U7SH6N5x", //"VqmfcMTdQe",
    eventsInterval: 3000,  // how many milli seconds interval between succeeding calls to Stats API in order to get the refreshed match event feed.
    parserIdName: "Stats"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Assign the settings for the current environment
const localConfiguration = statsComConfigDevelopment;


// Settings properties
const configuration = localConfiguration;


const supportedEventTypes = [2, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 28, 30, 31, 32, 33, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53];
const timelineEvents = {
    "2": "Yellow",
    "5": "Corner",
    "7": "Red",
    "8": "Foul",
    "11": "Goal",
    "14": "Injury",
    "16": "Offside",
    "17": "Penalty",
    "18": "Penalty",
    "19": "Shot_on_Goal",   // forcing simple shot events to be registered as Shot_on_Goal as well
    "20": "Shot_on_Goal",
    // "22": "Substitution",
    "28": "Own_Goal"
};

const penaltyShootOutEvents = [30, 41]; // 30: goal, 41: missed

const matchSegmentProgressionEventTypes = [21, 13, 35, 37, 38];


module.exports = Parser;

// Restrict to Only call this once in the lifetime of this object
function Parser(matchContext, feedServiceContext) {

    this.Name = configuration.parserIdName;
    this.isPaused = false;
    this.matchHandler = matchContext;
    this.feedService = feedServiceContext;
    this.recurringTask = null;
    this.scheduledTask = null;

    // determines whether the match is simulated from previously recorded events in all_events kept in matchfeedstatuses
    this.simulationStep = 0;
    this.isSimulated = false;

    // holder of the match events in the feed that are fetched by the most recent call to GetMatchEvents.
    this.eventFeedSnapshot = {};
    this.incompleteEventsLookup = {};
    // holder of all events from the last call. This is introduced as a layer bewteen calling the feed and parsing it.
    // The first call compares this with the new call, filters out events and parses it, then it stores the events here.
    this.eventsLastFeedRequest = [];
    
    // the parser upon initialization will inquire about all team players and their parserids.
    this.matchPlayersLookup = {};

    // the parser upon initialization will inquire about the 2 teams (home and away) parserids
    this.matchTeamsLookup = {};


    // the parser upon initialization will inquire about the match parserid
    this.matchParserId = this.feedService.parserid || this.matchHandler.parserids[configuration.parserIdName];

    if (!this.matchParserId || !this.matchHandler.competition)
        return; // new Error('Invalid or absent match parserids');

    if (this.feedService.active !== 'undefined' && this.feedService.active != null)
        this.isPaused = !this.feedService.active;

    this.ticks = 1;

    // all other state properties go here
    this.status = {
        currentSegment: 0,    // this will resolve when a new segment arrives, will not be dupped by same segment consequent events
        lastOwnGoalTime: 0,       // this records the time the last own_goal events came, in order to ignore a potential goal event on the same minute
        lastGoalTime: 0,          // this records the time of the last goal,  in order to ignore a potential goal event on the same minute
        homeTeamGoalEvents: [],
        awayTeamGoalEvents: [],
        penaltiesSegmentStarted: false,
        coolDownUntil: null     // this is a date-time, and if set we cease injecting artificial events (shot on target, cancelling goals, correcting the scoreline) until it expires
    };

    // the parser upon initialization will inquire about the competition mappings
    this.league = null;
}


Parser.prototype.init = function (cbk) {
    const that = this;
    var isActive = null;
    var startDate = null;

    // Execute multiple async functions in parallel getting the player ids and parserids mapping
    async.parallel([
        function (callback) {
            that.feedService.LoadTeam(that.matchHandler.home_team, function (error, response) {
                if (error)
                    return callback(error);

                response['matchType'] = 'home_team';
                if (!response.parserids)
                    return callback(new Error("No parserids[" + that.Name + "]  property in team id " + response.id + " document in Mongo. Aborting."));
                that.matchTeamsLookup[response.parserids[that.Name]] = response;
                callback(null);
            });
        },
        function (callback) {
            that.feedService.LoadTeam(that.matchHandler.away_team, function (error, response) {
                if (error)
                    return callback(error);

                response['matchType'] = 'away_team';
                if (!response.parserids)
                    return callback(new Error("No parserids[" + that.Name + "]  property in team id " + response.id + " document in Mongo. Aborting."));
                that.matchTeamsLookup[response.parserids[that.Name]] = response;
                callback(null);
            });
        },
        function (callback) {
            that.feedService.LoadParsedEvents(that.Name, that.matchHandler.id, function (error, parsed_eventids, incomplete_events, diffed_events, parser_status) {
                if (error)
                    return callback(error);

                if (parser_status)
                    that.status = parser_status;

                if (parsed_eventids && parsed_eventids.length > 0) {
                    _.forEach(parsed_eventids, function (eventid) {
                        that.eventFeedSnapshot[eventid] = true;
                    });
                    if (incomplete_events)
                        that.incompleteEventsLookup = incomplete_events;
                }
                callback(null);
            });
        },
        function (callback) {
            that.feedService.LoadCompetition(that.matchHandler.competition, function (error, response) {
                if (error)
                    return callback(error);

                that.league = response;

                // Get the state of the match, and accordingly try to schedule the timers for polling for the match events
                that.GetMatchStatus(that.league.parserids[that.Name], that.matchParserId, function (err, feedIsActive, matchStartDate) {
                    if (err)
                        return callback(err);

                    isActive = feedIsActive;
                    startDate = matchStartDate;

                    callback(null);
                });
            });
        },
        function (callback) {
            that.feedService.LoadPlayers(that.matchHandler.home_team._id, function (error, response) {
                if (error)
                    return callback(error);

                // if (!_.isArrayLike(response))
                //     return callback();

                _.forEach(response, function (item) {
                    if (item.parserids && item.parserids[that.Name] && !that.matchPlayersLookup[item.parserids[that.Name]])
                        that.matchPlayersLookup[item.parserids[that.Name]] = item;
                });

                callback(null);
            });
        },
        function (callback) {
            that.feedService.LoadPlayers(that.matchHandler.away_team._id, function (error, response) {
                if (error)
                    return callback(error);

                // if (!_.isArrayLike(response))
                //     return callback();

                _.forEach(response, function (item) {
                    if (item.parserids && item.parserids[that.Name] && !that.matchPlayersLookup[item.parserids[that.Name]])
                        that.matchPlayersLookup[item.parserids[that.Name]] = item;
                });

                callback(null);
            });
        }
    ], function (error) {
        if (error) {
            console.log(error.message);
            return cbk(error);
        }


        const scheduleDate = that.matchHandler.start || startDate;

        if (!scheduleDate)
            return cbk(new Error('No start property defined on the match to denote its start time. Aborting.'));

        const formattedScheduleDate = moment.utc(scheduleDate);
        formattedScheduleDate.subtract(300, 'seconds');

        // Test
        // formattedScheduleDate = moment.utc().add(60,'seconds');

        log.info('[Stats parser]: Scheduled Date: ' + formattedScheduleDate.toDate());
        // log.info(that.feedService.interval +" || "+ configuration.eventsInterval);
        var interval = that.feedService.interval || configuration.eventsInterval;
        if (interval < 1000)
            interval = 1000;
        log.info("Match tick interval set to: " + interval);
        var itsNow = moment.utc();
        // console.log((moment.utc(scheduleDate) < itsNow && isActive));
        // console.log((itsNow >= formattedScheduleDate && itsNow < moment.utc(scheduleDate)));
        // If the match has started already, then circumvent startTime, unless the match has ended (is not live anymore)
        if ((moment.utc(scheduleDate) < itsNow && isActive) || (itsNow >= formattedScheduleDate && itsNow < moment.utc(scheduleDate))) {
            log.info('[Stats parser]: Timer started for matchid %s', that.matchHandler.id);
            that.recurringTask = setInterval(Parser.prototype.TickMatchFeed.bind(that), interval);
        }
        else {
            // Schedule match feed event calls
            if (scheduleDate) {
                that.scheduledTask = scheduler.scheduleJob(that.matchHandler.id, formattedScheduleDate.toDate(), function () {
                    log.info('[Stats parser]: Timer started for matchid %s', that.matchHandler.id);
                    that.recurringTask = setInterval(Parser.prototype.TickMatchFeed.bind(that), interval);
                    MessagingTools.sendPushToAdmins({ en: 'Feed intervals started for matchid: ' + that.matchHandler.id });
                });
                if (that.scheduledTask) {
                    log.info('[Stats parser]: Timer scheduled successfully for matchid %s', that.matchHandler.id);
                    // MessagingTools.sendPushToAdmins({ en: 'Timer scheduled successfully for matchid: ' + that.matchHandler.id + ' at ' + formattedScheduleDate.toDate() });
                } else
                    if (!that.matchHandler.completed || that.matchHandler.completed == false) {
                        //        log.info('[Stats parser]: Fetching only once feed events for matchid %s', that.matchHandler.id);
                        //        that.TickMatchFeed();
                        that.isSimulated = true;
                        log.info('[Stats parser]: Simulated events stream Timer started for matchid %s', that.matchHandler.id);
                        that.recurringTask = setInterval(Parser.prototype.TickMatchFeed.bind(that), interval);
                    }

                // console.log(scheduler.scheduledJobs);
                var job = _.find(scheduler.scheduledJobs, { name: that.matchHandler.id })
                // console.log(job);
                // console.log(job.nextInvocation());
                //  console.log(moment(job.nextInvocation()).format());
                //    console.log(itsNow.format());
                var duration = moment.duration(moment(job.nextInvocation()).diff(itsNow));
                var durationAsHours = duration.asMinutes();
                if (job.nextInvocation())
                    log.info(`[Stats parser]: Match tick for ${that.matchParserId} will start in ${durationAsHours.toFixed(2)} minutes`);
            }
        }

        cbk(null);
    });
};

Parser.prototype.Pause = function() {
    this.isPaused = true;
}

Parser.prototype.Resume = function() {
    this.isPaused = false;
}


Parser.prototype.Terminate = function (callback) {
    // End recurring task
    clearInterval(this.recurringTask);

    // Cancel scheduled task, if existent
    if (this.scheduledTask)
        this.scheduledTask.cancel();

    this.isPaused = true;

    log.info('[Stats parser]: Terminated and closed down parser');

    this.matchHandler = null;
    this.feedService = null;

    if (callback)
        callback(null);
};

// Helper Methods

// Approximate calculation of season Year from current date
const GetSeasonYear = function () {
    const now = new Date();
    if (now.getMonth() > 6)
        return now.getFullYear();
    else return now.getFullYear() - 1;
};

const GetMatchEvents = function (leagueName, matchId, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/events/" + matchId + "?pbp=true&" + signature; // &box=true for boxing statistics

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));
            const events = response.body.apiResults[0].league.season.eventType[0].events[0].pbp;
            const teams = response.body.apiResults[0].league.season.eventType[0].events[0].teams;
            const matchStatus = response.body.apiResults[0].league.season.eventType[0].events[0].eventStatus;
            callback(null, events, teams, matchStatus, response.body);
        }
        catch (err) {
            console.log(err);
            if (callback)
                return callback(err);
        }
    });
};


Parser.prototype.GetNextSimulatedEventStream = function (matchId, simulationStep, callback) {
    let that = this;

    // This is in case of a delayed execution of the method, after the current Parser object is Terminated
    if (!that.feedService)
        return callback(new Error('[Stats parser]: Delayed execution of a terminated parser'));

    const feedService = that.feedService;
    feedService.LoadAllEventsStream(that.Name, matchId, simulationStep, function (error, allEvents) {
        if (error || !allEvents) {
            // End match, do not keep perpetually the loop while looking for events that do not exist
            feedService.EndOfMatch(that.matchHandler);
            // Send an event that the match is ended.
            setTimeout(function () {
                that.Terminate();
                // }, that.feedService.queueCount * 1000);
            }, 1000);
        }

        return callback(error, allEvents, null, null, null);
    });
};

// Number of ticks before full data retrieval
const numberOfTicksBeforeBoxscore = 30;

Parser.prototype.GetMatchEventsWithBox = function (leagueName, matchId, manualCallback) {
    GetMatchEventsWithBox(leagueName, matchId, null, null, manualCallback);
}

const GetMatchEventsWithBox = function (leagueName, matchId, callback, context, manualCallback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/events/" + matchId + "?box=true&pbp=true&" + signature; // &box=true for boxing statistics

    needle.get(url, { timeout: 50000 }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));

            const events = response.body.apiResults[0].league.season.eventType[0].events[0].pbp;
            const teams = response.body.apiResults[0].league.season.eventType[0].events[0].teams;
            const matchStatus = response.body.apiResults[0].league.season.eventType[0].events[0].eventStatus;
            const boxscores = response.body.apiResults[0].league.season.eventType[0].events[0].boxscores;
            UpdateMatchStats(matchId, boxscores, context, manualCallback);

            if (callback)
                callback(null, events, teams, matchStatus);
        }
        catch (err) {
            if (callback)
                return callback(err);
            else
                return manualCallback(err);
        }
    });
};

const UpdateMatchStats = function (matchId, boxscores, that, callback) {

    matches.findOne({ 'moderation.parserid': matchId }, function (err, match) {
        // find home_team in match stats and update to boxscores[0]
        const homeStats = _.find(match.stats, { "name": "home_team" });
        if (homeStats) {
            // homeStats = match.stats.push({"name": "home_team"});
            homeStats.possession = boxscores[0].teamStats.possessionPercentage;
            homeStats.shotsOnGoal = boxscores[0].teamStats.shotsOnGoal;
            homeStats.saves = boxscores[0].teamStats.saves;
            homeStats.crosses = boxscores[0].teamStats.crosses;
            homeStats.passes = boxscores[0].teamStats.touches.passes;
        }
        // find away_team in match stats and update to boxscores[1]
        var awayStats = _.find(match.stats, { "name": "away_team" });
        if (awayStats) {
            // awayStats = match.stats.push({"name": "away_team"});
            awayStats.possession = boxscores[1].teamStats.possessionPercentage;
            awayStats.shotsOnGoal = boxscores[1].teamStats.shotsOnGoal;
            awayStats.saves = boxscores[1].teamStats.saves;
            awayStats.crosses = boxscores[1].teamStats.crosses;
            awayStats.passes = boxscores[1].teamStats.touches.passes;
        }
        match.markModified('stats');
        match.save(function (err, result) {
            if (callback)
                callback(err, result);
            else
                console.log("[Stats.js:345]  Update of match stats handled succesfully");

            if (result._id)
                that.feedService.emitStats(result._id, result.stats);
        })
    });

}


Parser.prototype.GetMatchStatus = function (leagueName, matchId, callback) {
    const signature = "api_key=" + configuration.apiKey + "&sig=" + crypto.SHA256(configuration.apiKey + configuration.apiSecret + Math.floor((new Date().getTime()) / 1000));
    const url = configuration.urlPrefix + leagueName + "/scores/" + matchId + "?" + signature;

    needle.get(url, { timeout: 30000, headers: { accept: "application/json" } }, function (error, response) {
        if (error)
            return callback(error);
        try {
            if (response.statusCode != 200)
                return callback(new Error("Response code from " + url + " : " + response.statusCode));
            const status = response.body.apiResults[0].league.season.eventType[0].events[0].startDate[1];
            let isActive = response.body.apiResults[0].league.season.eventType[0].events[0].eventStatus.isActive;

            // If match is in between 1st and 2nd half, turn isActive true (from false)
            if (!isActive && response.body.apiResults[0].league.season.eventType[0].events[0].eventStatus.name == 'In-Progress')
                isActive = true;

            callback(null, isActive, status);
        }
        catch (err) {
            return callback(err);
        }
    });
};


Parser.prototype.TranslateMatchEvent = function (parserEvent) {
    if (!parserEvent || !this.matchHandler || this.isPaused == true)
        return null;

    //Not supported event types
    if (_.indexOf(supportedEventTypes, parserEvent.playEvent.playEventId) == -1)
        return null;

    const offensivePlayer = parserEvent.offensivePlayer && this.matchPlayersLookup[parserEvent.offensivePlayer.playerId] ?
        {
            id: this.matchPlayersLookup[parserEvent.offensivePlayer.playerId].id,
            name: _.clone(this.matchPlayersLookup[parserEvent.offensivePlayer.playerId].name),
            team: this.matchPlayersLookup[parserEvent.offensivePlayer.playerId].teamId
        } : null;
    const defensivePlayer = parserEvent.defensivePlayer && this.matchPlayersLookup[parserEvent.defensivePlayer.playerId] ?
        {
            id: this.matchPlayersLookup[parserEvent.defensivePlayer.playerId].id,
            name: _.clone(this.matchPlayersLookup[parserEvent.defensivePlayer.playerId].name),
            team: this.matchPlayersLookup[parserEvent.defensivePlayer.playerId].teamId
        } : null;
    const replacedPlayer = parserEvent.replacedPlayer && this.matchPlayersLookup[parserEvent.replacedPlayer.playerId] ?
        {
            id: this.matchPlayersLookup[parserEvent.replacedPlayer.playerId].id,
            name: _.clone(this.matchPlayersLookup[parserEvent.replacedPlayer.playerId].name),
            team: this.matchPlayersLookup[parserEvent.replacedPlayer.playerId].teamId
        } : null;

    const isTimelineEvent = timelineEvents[parserEvent.playEvent.playEventId] ? true : false
    let eventName = isTimelineEvent == true ? timelineEvents[parserEvent.playEvent.playEventId] : parserEvent.playEvent.name;
    eventName = eventName.replace(/ /g, "_").replace(/-/g, "_"); // global string replacement
    const eventId = ComputeEventId(parserEvent);


    let translatedEvent = {
        type: 'Add',
        time: parserEvent.time.additionalMinutes ? parserEvent.time.minutes + parserEvent.time.additionalMinutes : parserEvent.time.minutes,   // Make sure what time represents. Here we assume time to be the match minute from the match start.
        data: {
            id: eventId,
            parserids: {},
            status: 'active',
            type: eventName,
            state: TranslateMatchPeriod(parserEvent.period, parserEvent.playEvent.playEventId),
            sender: this.Name,
            time: parserEvent.time.additionalMinutes ? parserEvent.time.minutes + parserEvent.time.additionalMinutes : parserEvent.time.minutes, // ToDo: replace with a translateTime method (take into acount additionalMinutes)
            timeline_event: isTimelineEvent,
            description: {},
            team: this.matchTeamsLookup[parserEvent.teamId] ? this.matchTeamsLookup[parserEvent.teamId].matchType : null,
            team_id: this.matchTeamsLookup[parserEvent.teamId] ? this.matchTeamsLookup[parserEvent.teamId].id : null,
            match_id: this.matchHandler._id,
            players: [],
            stats: {}
        },
        created: moment.utc().toDate() // ToDo: Infer creation time from match minute
    };

    translatedEvent.data.description['en'] = parserEvent.playText;

    // ToDo: In certain match events, we may want to split the event in two (or three)
    if (offensivePlayer)
        translatedEvent.data.players.push(offensivePlayer);
    // if (defensivePlayer)
    //     translatedEvent.data.players.push(defensivePlayer);
    if (parserEvent.playEvent.playEventId == 22 && replacedPlayer)
        translatedEvent.data.players.push(replacedPlayer);

    // Make sure that the value set here is the quantity for the event only, not for the whole match    
    translatedEvent.data.stats[eventName] = 1;
    translatedEvent.data.parserids[this.Name] = eventId;

    if (IsParserEventComplete(parserEvent) == true && (!this.incompleteEventsLookup[eventId]) == false) {
        translatedEvent.type = 'Update';
        delete this.incompleteEventsLookup[eventId];
    }

    return translatedEvent;
};


const TranslateMatchPeriod = function (statsPeriod, eventId) {
    switch (statsPeriod) {
        case 0: return 0;
        case 1: return 1;
        case 2: return 3;
        case 3: return 5;
        case 4:
            if (_.indexOf(penaltyShootOutEvents, eventId) > -1)
                return 9;
            else
                return 7;
    }
}

Parser.prototype.TranslateMatchSegment = function (parserEvent) {
    if (!parserEvent)
        return null;

    //Not supported event types
    const index = _.indexOf(matchSegmentProgressionEventTypes, parserEvent.playEvent.playEventId);
    if (index == -1)
        return null;

    if (parserEvent.playEvent.playEventId == this.status.currentSegment)
        return null;    // avoid changing segment when consecutive segment events arrive with the same playEventId

    this.status.currentSegment = parserEvent.playEvent.playEventId;
    return true;   // return anything but null
};

const IsParserEventComplete = function (parserEvent) {
    if (!parserEvent || !parserEvent.playEvent || !parserEvent.playEvent.playEventId)
        return false;

    if (!parserEvent.period || !parserEvent.time || parserEvent.time.minutes == null || parserEvent.time.minutes === undefined || parserEvent.time.seconds == null || parserEvent.time.seconds === undefined)
        return false;

    if (!parserEvent.teamId)
        return false;

    if (!parserEvent.offensivePlayer || !parserEvent.offensivePlayer.playerId)
        return false;

    return true;
};

const IsTimelineEvent = function (parserEvent) {
    // Return true if not a timeline event
    if (_.indexOf(_.keys(timelineEvents), parserEvent.playEvent.playEventId.toString()) > -1)
        return true;
    else
        return false;
};


const IsSegmentEvent = function (parserEvent) {
    if (_.indexOf(matchSegmentProgressionEventTypes, parserEvent.playEvent.playEventId) > -1 || parserEvent.playEvent.playEventId == 10)
        return true;
    else
        return false;
};

// and now, the functions that can be called from outside modules.
Parser.prototype.TickMatchFeed = function () {
    const that = this;
    try {
        if (!that.matchHandler || !that.matchParserId || !that.feedService) {
            console.log('Invalid call of TickMatchFeed before binding to a Stats-supported match');
            return;
        }

        const leagueName = that.league.parserids[that.Name];

        // ----------
        // Requested that possession is removed so no need to create overhead with this
        // ----------
        // if (that.ticks % numberOfTicksBeforeBoxscore == 0) {
        //     GetMatchEventsWithBox(leagueName, that.matchParserId, that.TickCallback.bind(that), that);
        //     that.ticks = 1;
        // } else {

        if (!that.isSimulated)
            GetMatchEvents(leagueName, that.matchParserId, that.TickCallback.bind(that));
        else 
            that.GetNextSimulatedEventStream(that.matchHandler.id, that.simulationStep++, that.TickCallback.bind(that));

        // log.info('[Match module] Tick to match stats: '+ (numberOfTicksBeforeBoxscore-that.ticks));
        // that.ticks++;
        // }

    }
    catch (methodError) {
        log.error('Stats parser tick error: ' + methodError.message);
    }
};


const ComputeEventMatchTime = function (parsedEvent) {
    if (!parsedEvent.period || !parsedEvent.time || parsedEvent.time.minutes == null || parsedEvent.time.minutes === 'undefined' || parsedEvent.time.seconds == null || parsedEvent.time.seconds === 'undefined')
        return 0;
    return (parsedEvent.period * 100 + parsedEvent.time.minutes) * 60 + (parsedEvent.time.additionalMinutes ? parsedEvent.time.additionalMinutes * 60 : 0) + parsedEvent.time.seconds;
};

const ComputeEventId = function (parsedEvent) {
    // const idObject = {
    //     type: parsedEvent.playEvent.playEventId,
    //     state: parsedEvent.period,
    //     min: parsedEvent.time.minutes + parsedEvent.time.additionalMinutes ? parsedEvent.time.additionalMinutes : 0,
    //     sec: parsedEvent.time.seconds
    // };

    // return JSON.stringify(idObject);

    const eventTypeFactor = 1000000 * parsedEvent.playEvent.playEventId;

    if (!parsedEvent.period || !parsedEvent.time || parsedEvent.time.minutes == null || parsedEvent.time.minutes === 'undefined' || parsedEvent.time.seconds == null || parsedEvent.time.seconds === 'undefined')
        return eventTypeFactor;
    return eventTypeFactor + (parsedEvent.period * 100 + parsedEvent.time.minutes) * 60 + (parsedEvent.time.additionalMinutes ? parsedEvent.time.additionalMinutes * 60 : 0) + parsedEvent.time.seconds;
};



Parser.prototype.TickCallback = function (error, events, teams, matchStatus, feedResponse) {
    if (error) {
        console.log('error in TickMatchFeed: ' + error.message);
        return;
    }

    const that = this;

    /**
     *  revision in order to introduce a new layer between getting feeds and parsing them
     */
    // we find if there are events missing from the previous call
    let removedEvents = _.differenceBy(that.eventsLastFeedRequest, events, 'sequenceNumber');
    // we remove from the last feed call the elements missing from the new. Now we are free to parse it.
    that.eventsLastFeedRequest = _.without(that.eventsLastFeedRequest, removedEvents);
    // we make clone copies so we don't have to change anything else in the following code
    var currentEvents = _.cloneDeep(events);
    // we substitute the events Array with the clone of the previous call
    events = _.cloneDeep(that.eventsLastFeedRequest);
    // And we store the current call to be parsed in the next tick
    if (that.eventsLastFeedRequest.length == 0) {
        that.eventsLastFeedRequest = currentEvents;                 
        setTimeout(function(){
            that.TickMatchFeed()
        }, 2000);
    }
    that.eventsLastFeedRequest = currentEvents;

    // compute last match time in eventFeedSnapshot
    var lastMatchTime = 0;
    _.forEach(that.eventFeedSnapshot, function (parsedEvent) {
        var itemMatchTime = ComputeEventMatchTime(parsedEvent);
        if (itemMatchTime > lastMatchTime)
            lastMatchTime = itemMatchTime;
    });

    // Produce the diff with eventFeedSnapshot, select all from events that do not exist in eventFeedSnapshot
    let eventId = null;
    const eventsDiff = _.filter(events, function (item) {
        eventId = ComputeEventId(item);
        // Debugging code follows:
        //   if (IsSegmentEvent(item) == false && IsParserEventComplete(item) == false && IsTimelineEvent(item) == true)
        //       log.info('Incomplete event with eventId ' + eventId);
        return !that.eventFeedSnapshot[eventId] && (IsSegmentEvent(item) == true || (ComputeEventMatchTime(item) >= lastMatchTime && !that.incompleteEventsLookup[eventId]) || (IsParserEventComplete(item) == true && (!that.incompleteEventsLookup[eventId]) == false));
    });
    var isTimelineEvent = false;
    _.forEach(events, function (event) {
        // Check if event is timeline event.
        isTimelineEvent = IsTimelineEvent(event);
        eventId = ComputeEventId(event);

        // Check if event is complete, otherwise do not add it to eventFeedSnapshot, unless its waitTime is over
        if (IsSegmentEvent(event) == true || IsTimelineEvent(event) == false || IsParserEventComplete(event) == true)
            that.eventFeedSnapshot[eventId] = event;
        else {
            if (!that.incompleteEventsLookup[eventId])
                that.incompleteEventsLookup[eventId] = event;
        }
    });

    //if (Math.random() < 0.03)
    //    log.info('[Feed Stats Parser]: Stats call returned ' + events.length + ' events from the feed');

    // Nothing to add
    if (eventsDiff.length == 0)
        return;

    _.orderBy(eventsDiff, function (ev) {
        return ComputeEventMatchTime(ev);
    });

    if (that.matchHandler) {
        // that.feedService.SaveParsedEvents(that.Name, that.matchHandler._id, _.keys(that.eventFeedSnapshot), eventsDiff, events, that.incompleteEventsLookup);
        that.feedService.SaveParsedEvents(that.Name, that.matchHandler._id, _.keys(that.eventFeedSnapshot), eventsDiff, !that.isSimulated ? events : null, that.incompleteEventsLookup, that.status);
    }

    if (that.isPaused != true) {
        const now = moment.utc();

        // reset coolDownUntil?
        if (that.status.coolDownUntil && now.isAfter(moment.utc(that.status.coolDownUntil)))
            that.status.coolDownUntil = null;

        // Translate all events in eventsDiff and send them to feedService
        _.forEach(eventsDiff, function (event) {

            // First try parsing a normal event
            const translatedEvent = that.TranslateMatchEvent(event);
            if (translatedEvent && translatedEvent.data && translatedEvent.data.team_id) {
                // Determine if the event is a Goal and is coming right after an own goal (in this case just ignore it)
                if (event.playEvent && event.playEvent.playEventId && event.playEvent.playEventId == 11 && that.status.lastOwnGoalTime > 0) {
                    that.HandleGoalAfterOwnGoal(event, translatedEvent, now);
                }
                // Determine if the event is a Goal and is coming right after another goal
                else if (event.playEvent && event.playEvent.playEventId && event.playEvent.playEventId == 11) {
                    that.HandleGoal(event, translatedEvent, now);
                }
                // Determine if the event is an Own_Goal in this case inverse the team and team_id
                else if (event.playEvent && event.playEvent.playEventId && event.playEvent.playEventId == 28) {
                    translatedEvent.data.team = translatedEvent.data.team == "home_team" ? "away_team" : "home_team";
                    translatedEvent.data.team_id = translatedEvent.data.team == "home_team" ? that.matchHandler.home_team.id : that.matchHandler.away_team.id;
                    that.feedService.AddEvent(translatedEvent);
                }
                else
                    that.feedService.AddEvent(translatedEvent);

                // Determine if the event is a successful penalty, in this case create an extra Goal event
                if (event.playEvent && event.playEvent.playEventId && event.playEvent.playEventId == 17) {
                    that.HandleSuccessfulPenalty(event, now);
                }
                // Determine if the event is an own goal, in this case create an extra Goal event for the opposite team
                if (event.playEvent && event.playEvent.playEventId && event.playEvent.playEventId == 28) {
                    that.HandleOwnGoal(event, now);
                }
                // Check the match score and see if it needs to be adjusted from the event
                if (!that.status.coolDownUntil && event.homeScore < that.matchHandler.home_score && that.status.homeTeamGoalEvents.length > 0) {
                    // Decrease the home team score by the last home goal
                    //const lastHomeGoal = that.status.homeTeamGoalEvents.pop();
                    //lastHomeGoal.type = 'Delete';
                    //log.info('[Stats parser]: A Goal rollback is observed in the incoming event for the home team.');
                    //that.status.coolDownUntil = now.clone().add(60, 's').toDate();
                    //setTimeout(() => {
                    //    that.feedService.AddEvent(lastHomeGoal);
                    //}, 500);
                }
                else if (!that.status.coolDownUntil && event.awayScore < that.matchHandler.away_score && that.status.awayTeamGoalEvents.length > 0) {
                    // Decrease the home team score by the last home goal
                    //const lastAwayGoal = that.status.awayTeamGoalEvents.pop();
                    //lastAwayGoal.type = 'Delete';
                    //log.info('[Stats parser]: A Goal rollback is observed in the incoming event for the away team.');
                    //that.status.coolDownUntil = now.clone().add(60, 's').toDate();
                    //setTimeout(() => {
                    //    that.feedService.AddEvent(lastAwayGoal);
                    //}, 500);
                }
                // Determine if we have difference between the feed event-reported score line and the match's one
                if (!that.status.coolDownUntil && (event.homeScore != that.matchHandler.home_score || event.awayScore != that.matchHandler.away_score)) {
                    that.HandleScorelineDifference(event, now);
                }
                // Determine if the event includes a deflected post, in this case create a deflected post event
                if (event.saveType && event.saveType.saveTypeId == 17) // Deflected around post
                {
                    that.HandleDeflectedPost(event);
                }
                // Determine if the Penalties Segment has just started (in this case, advance the segment)
                if (translatedEvent.data.state == 9) {
                    if (!that.status.penaltiesSegmentStarted) {
                        that.status.penaltiesSegmentStarted = true;
                        that.feedService.AdvanceMatchSegment(that.matchHandler);
                    }
                }
            } else // Game Over?
                if (event.playEvent.playEventId == 10) { //|| (matchStatus.name && matchStatus.name == "Final")) {
                    that.HandleMatchTermination(event, now);
                }
                else {
                    // Then try to parse a match segment advancing event
                    const translatedMatchSegment = that.TranslateMatchSegment(event);
                    if (translatedMatchSegment) {
                        log.info('[Stats parser]: Intercepted a Segment Advance event.');
                        that.feedService.AdvanceMatchSegment();
                    }
                }
        });
    }

};

Parser.prototype.HandleGoalAfterOwnGoal = function (event, translatedEvent, now) {
    const that = this;

    const goalTime = ComputeEventMatchTime(event);
    if (that.status.lastOwnGoalTime + 60 < goalTime && that.status.lastGoalTime + 90 < goalTime) {
        that.feedService.AddEvent(translatedEvent);
        that.status.coolDownUntil = now.clone().add(60, 's').toDate();
        that.status.lastGoalTime = goalTime;
        if (translatedEvent.data && translatedEvent.data.team) {
            if (translatedEvent.data.team == 'home_team')
                that.status.homeTeamGoalEvents.push(translatedEvent);
            else if (translatedEvent.data.team == 'away_team')
                that.status.awayTeamGoalEvents.push(translatedEvent);
        }
    } else {
        log.info("Ignoring GOAL event. An own goal has been registered in the game less than the required elapsed time ")
    }
}

Parser.prototype.HandleGoal = function (event, translatedEvent, now) {
    const that = this;

    const goalTime = ComputeEventMatchTime(event);
    if (that.status.lastGoalTime + 90 < goalTime) {
        that.feedService.AddEvent(translatedEvent);
        that.status.coolDownUntil = now.clone().add(60, 's').toDate();
        that.status.lastGoalTime = goalTime;
        if (translatedEvent.data && translatedEvent.data.team) {
            if (translatedEvent.data.team == 'home_team')
                that.status.homeTeamGoalEvents.push(translatedEvent);
            else if (translatedEvent.data.team == 'away_team')
                that.status.awayTeamGoalEvents.push(translatedEvent);
        }
    }
    else {
        log.info("Ignoring GOAL event. An Goal has already been registered in the game less than the required elapsed time ")
    }
}

Parser.prototype.HandleSuccessfulPenalty = function (event, now) {
    const that = this;

    let goalEvent = _.cloneDeep(event);
    goalEvent.playEvent.playEventId = 11;
    goalEvent.playEvent.name = 'Goal';
    const eventId = ComputeEventId(goalEvent);
    if (!that.eventFeedSnapshot[eventId]) {
        that.status.lastGoalTime = ComputeEventMatchTime(event);
        that.status.coolDownUntil = now.clone().add(60, 's').toDate();

        setTimeout(function () {
            // Check if event is complete, otherwise do not add it to eventFeedSnapshot, unless its waitTime is over
            if (IsSegmentEvent(goalEvent) == true || IsTimelineEvent(goalEvent) == false || IsParserEventComplete(goalEvent) == true)
                that.eventFeedSnapshot[eventId] = goalEvent;
            else {
                if (!that.incompleteEventsLookup[eventId])
                    that.incompleteEventsLookup[eventId] = goalEvent;
            }
            const translatedGoalEvent = that.TranslateMatchEvent(goalEvent);
            if (translatedGoalEvent.data && translatedGoalEvent.data.team) {
                if (translatedGoalEvent.data.team == 'home_team')
                    that.status.homeTeamGoalEvents.push(translatedGoalEvent);
                else if (translatedGoalEvent.data.team == 'away_team')
                    that.status.awayTeamGoalEvents.push(translatedGoalEvent);
            }
            that.feedService.AddEvent(translatedGoalEvent);
        }, 1000);
    }
}

Parser.prototype.HandleOwnGoal = function (event, now) {
    const that = this;

    let goalEvent = _.cloneDeep(event);
    goalEvent.playEvent.playEventId = 11;
    goalEvent.playEvent.name = 'Goal';

    const eventId = ComputeEventId(goalEvent);
    if (!that.eventFeedSnapshot[eventId]) {
        that.status.lastOwnGoalTime = ComputeEventMatchTime(event);
        that.status.lastGoalTime = that.status.lastOwnGoalTime;
        that.status.coolDownUntil = now.clone().add(60, 's').toDate();

        setTimeout(function () {
            // Check if event is complete, otherwise do not add it to eventFeedSnapshot, unless its waitTime is over
            if (IsSegmentEvent(goalEvent) == true || IsTimelineEvent(goalEvent) == false || IsParserEventComplete(goalEvent) == true)
                that.eventFeedSnapshot[eventId] = goalEvent;
            else {
                if (!that.incompleteEventsLookup[eventId])
                    that.incompleteEventsLookup[eventId] = goalEvent;
            }
            const translatedGoalEvent = that.TranslateMatchEvent(goalEvent);

            if (translatedGoalEvent) {
                //translatedGoalEvent.data.team = translatedGoalEvent.data.team == 'home_team' ? 'away_team' : 'home_team';
                //translatedGoalEvent.data.team_id = translatedGoalEvent.data.team == 'home_team' ? that.matchHandler.home_team.id : that.matchHandler.away_team.id;
                if (translatedGoalEvent.data.players && translatedGoalEvent.data.players.length > 0) {
                    if (translatedGoalEvent.data.players[0].name && translatedGoalEvent.data.players[0].name.en)
                        translatedGoalEvent.data.players[0].name.en = translatedGoalEvent.data.players[0].name.en + " (own)";
                }
                if (translatedGoalEvent.data && translatedGoalEvent.data.team) {
                    if (translatedGoalEvent.data.team == 'home_team')
                        that.status.homeTeamGoalEvents.push(translatedGoalEvent);
                    else if (translatedGoalEvent.data.team == 'away_team')
                        that.status.awayTeamGoalEvents.push(translatedGoalEvent);
                }
                that.feedService.AddEvent(translatedGoalEvent);
            }
        }, 1000);
    }
}


Parser.prototype.HandleScorelineDifference = function (event, now) {
    const that = this;

    // Modify the match score line
    const matchEvent = {
        type: 'Scoreline',
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        data: {
            type: 'Scoreline',
            match_id: that.matchHandler._id,
            time: event.time.additionalMinutes ? event.time.minutes + event.time.additionalMinutes : event.time.minutes
        }
    };
    that.feedService.AddEvent(matchEvent);
    log.info(`[Stats parser]: A different match score line is observed in the incoming event: ${event.homeScore} - ${event.awayScore} (instead of the current ${that.matchHandler.home_score} - ${that.matchHandler.away_score})`);
    that.status.coolDownUntil = now.clone().add(60, 's').toDate();
}


Parser.prototype.HandleDeflectedPost = function (event, now) {
    const that = this;

    let goalEvent = _.cloneDeep(event);
    goalEvent.playEvent.playEventId = 53; // out of the timeline id range
    goalEvent.playEvent.name = 'Deflected_on_Post';
    const translatedDeflectionEvent = that.TranslateMatchEvent(goalEvent);
    if (translatedDeflectionEvent)
        that.feedService.AddEvent(translatedDeflectionEvent);
}


Parser.prototype.HandleMatchTermination = function (event, now) {
    const that = this;

    log.info('[Stats parser]: Intercepted a match Termination event.');

    that.feedService.EndOfMatch(that.matchHandler);
    // Send an event that the match is ended.
    setTimeout(function () {
        that.Terminate();
        // }, that.feedService.queueCount * 1000);
    }, 1000);
}


    /* 
    // Annex
    
    // This is just for reference, depicts all Stats.com event ids and their name
    var eventTypes = [
        {
            "playEventId": 1,
            "name": "Ball Location"
        }, {
            "playEventId": 2,
            "name": "Caution"   // yellow card
        }, {
            "playEventId": 3,
            "name": "Clear"
        }, {
            "playEventId": 4,
            "name": "Comments"
        }, {
            "playEventId": 5,
            "name": "Corner Kick"
        }, {
            "playEventId": 6,
            "name": "Cross"
        }, {
            "playEventId": 7,
            "name": "Expulsion" // red card
        }, {
            "playEventId": 8,
            "name": "Foul"
        }, {
            "playEventId": 9,
            "name": "Free Kick"
        }, {
            "playEventId": 10,
            "name": "Game Over"
        }, {
            "playEventId": 11,
            "name": "Goal"
        }, {
            "playEventId": 12,
            "name": "Goalkeeper Punt"
        }, {
            "playEventId": 13,
            "name": "Half Over"
        }, {
            "playEventId": 14,
            "name": "Injury"
        }, {
            "playEventId": 15,
            "name": "New Player"
        }, {
            "playEventId": 16,
            "name": "Offside"
        }, {
            "playEventId": 17,
            "name": "Penalty Kick - Good"
        }, {
            "playEventId": 18,
            "name": "Penalty Kick - No Good"
        }, {
            "playEventId": 19,
            "name": "Shot"
        }, {
            "playEventId": 20,
            "name": "Shot on Goal"
        }, {
            "playEventId": 21,
            "name": "Start Half"
        }, {
            "playEventId": 22,
            "name": "Substitution"
        }, {
            "playEventId": 23,
            "name": "Starting Lineups - Home"
        }, {
            "playEventId": 24,
            "name": "Starting Lineups - Visit"
        }, {
            "playEventId": 25,
            "name": "Coach - Home"
        }, {
            "playEventId": 26,
            "name": "Coach - Visit"
        }, {
            "playEventId": 27,
            "name": "Game Info"
        }, {
            "playEventId": 28,
            "name": "Own Goal"
        }, {
            "playEventId": 29,
            "name": "Goalie Change"
        }, {
            "playEventId": 30,
            "name": "Shootout Goal"
        }, {
            "playEventId": 31,
            "name": "Shootout Save"
        }, {
            "playEventId": 32,
            "name": "Hand Ball Foul"
        }, {
            "playEventId": 33,
            "name": "Shootout"
        }, {
            "playEventId": 34,
            "name": "Game Start"
        }, {
            "playEventId": 35,
            "name": "Half-Time"
        }, {
            "playEventId": 36,
            "name": "End of Regulation"
        }, {
            "playEventId": 37,
            "name": "Begin Overtime"
        }, {
            "playEventId": 38,
            "name": "End Overtime"
        }, {
            "playEventId": 39,
            "name": "Save (Shot off Target)"
        }, {
            "playEventId": 40,
            "name": "Save (Shot on Target)"
        }, {
            "playEventId": 41,
            "name": "Shootout Miss"
        }, {
            "playEventId": 42,
            "name": "Left Flank Attack"
        }, {
            "playEventId": 43,
            "name": "Center Flank Attack"
        }, {
            "playEventId": 44,
            "name": "Right Flank Attack"
        }, {
            "playEventId": 45,
            "name": "Long Ball Attack"
        }, {
            "playEventId": 46,
            "name": "Goal Kick"
        }, {
            "playEventId": 47,
            "name": "Throw-In"
        }, {
            "playEventId": 48,
            "name": "Manager Expulsion"
        }, {
            "playEventId": 49,
            "name": "Defensive Action"
        }, {
            "playEventId": 50,
            "name": "Pass"
        }, {
            "playEventId": 51,
            "name": "Run With Ball"
        }, {
            "playEventId": 52,
            "name": "Tackle"
        }, {
            "playEventId": 53,
            "name": "Deflection"
        }, {
            "playEventId": 54,
            "name": "Clock Start"
        }, {
            "playEventId": 55,
            "name": "Clock Stop"
        }, {
            "playEventId": 56,
            "name": "Clock Inc"
        }, {
            "playEventId": 57,
            "name": "Clock Dec"
        }, {
            "playEventId": 58,
            "name": "Abandoned"
        }, {
            "playEventId": 59,
            "name": "Delayed"
        }, {
            "playEventId": 60,
            "name": "10-Yard"
        }, {
            "playEventId": 61,
            "name": "Back-Pass"
        }, {
            "playEventId": 62,
            "name": "Time"
        }, {
            "playEventId": 65,
            "name": "Delay Over"
        }, {
            "playEventId": 66,
            "name": "Injury Time"
        }];
    */