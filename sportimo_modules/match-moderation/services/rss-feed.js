
/**
 * Services are attached to match-modules based on the configuration
 * of the scheduled-match. 
 * e.g. 
 * "moderation": [{
		"type": "rss-feed",
		"parserid": "15253",
		"interval": 500,
		"parsername": "Stats"
	}]
 * should add an rss-feed service with the above configurations. 
 * The service is then responsible to handle the moderation of
 * the scheduled-match. 
*/

var path = require('path'),
    fs = require('fs'),
    mongoose = require('../config/db.js'),
    EventEmitter = require('events'),
    util = require('util'),
    winston = require('winston'),
    _ = require('lodash'),
    async = require('async');


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

var parsers = {};

try {
    var servicesPath = path.join(__dirname, '../parsers');
    fs.readdirSync(servicesPath).forEach(function (file) {
        parsers[path.basename(file, ".js")] = require(servicesPath + '/' + file);
    });
}
catch (err) {
    console.error(err);
}

var modelsPath = path.join(__dirname, '../../models');
fs.readdirSync(modelsPath).forEach(function (file) {
    require(modelsPath + '/' + file);
});

var serviceType = "rss-feed";

function feedService(service) {
    // All services have a type attribute
    if (service.type != serviceType)
        return null;
    this.type = serviceType;

    // The parser name for this feed
    if (!service.parsername)
        return null;
    this.parsername = service.parsername || null;

    // The id of the corresponding event(match)
    this.parserid = service.parserid || 0;

    // The interval that the module will request an update
    this.interval = service.interval || 5000;

    this.active = service.active === 'undefined' || service.active == null ? true : service.active;

    // Should we log all events received from feed or just the last one
    this.logAllEvents = service.logAllEvents === 'undefined' || service.logAllEvents == null ? process.env.NODE_ENV == "development" ? true : false : service.logAllEvents;
    this.storeStatsRespponses = process.env.NODE_ENV == "development" ? true : false ;
    this.parser = null;
}



// Initialize feed and validate response
feedService.prototype.init = function (matchHandler, cbk) {
    var that = this;

    if (that.parsername == null)
        return cbk(new Error("No parser attached to service"));
    if (!parsers[that.parsername])
        return cbk(new Error("No parser with the name " + this.parsername + " can be found."));


    log.info("[Auto-Moderation] Initializing rss-feed service for match id " + matchHandler.id);

    try {
        var selectedParser = new parsers[that.parsername](matchHandler, that);
        that.parser = selectedParser;
        selectedParser.init(function (error) {
            if (error) {
                log.error(error);
                return cbk(error);
            }

            // Build a node.js event emitter (see: https://nodejs.org/api/events.html)
            var MyEmitter = function () {
                EventEmitter.call(that);
            };
            util.inherits(MyEmitter, EventEmitter);

            that.emitter = new MyEmitter();
            return cbk(null, that);
        });
    }
    catch (error) {
        log.error("Error while initializing feed_service module for match %s : %s", matchHandler.id, error.message);
        return cbk(error);
    }
};

feedService.prototype.updateMatchStats = function (leagueName, matchId, manualCallback) {
    // if (feedService.parsername == null)
    //     return "No parser attached to service";

    this.parser.GetMatchEventsWithBox(leagueName, matchId, manualCallback);
};


feedService.prototype.pause = function () {
    if (!this.parser || this.parsername == null)
        return "No parser attached to service";

    log.info('[Feed service]: Paused');

    this.parser.Pause();
    this.active = false;
};

feedService.prototype.resume = function () {
    if (!this.parser || this.parsername == null)
        return "No parser attached to service";

    log.info('[Feed service]: Resumed');

    this.parser.Resume();
    this.active = true;
};

feedService.prototype.isActive = function () {
    if (!this.parser || !this.parsername)
        return false;
    else
        return !this.parser.isPaused;
};


// Manage match events, simple proxy to match module
feedService.prototype.AddEvent = function (event) {
    if (this.active == false)
        return;

    feedService.prototype.queueCount++;
    log.info('[Feed service]: Sent a match event: %s\' %s ', event.data.time, event.data.type);
    this.emitter.emit('matchEvent', event);
};

// Manage match events, simple proxy to match module
feedService.prototype.emitStats = function (matchid, stats) {
    if (this.active == false)
        return;

    this.emitter.emit('emitStats', matchid, stats);
};

// Manage match segment advances, simple proxy to match module
feedService.prototype.AdvanceMatchSegment = function (state) {
    if (this.active == false)
        return;

    feedService.prototype.queueCount++;
    log.info('[Feed service]: Sent a nextMatchSegment event' + !state ? '' : (' to state ' + state));
    this.emitter.emit('nextMatchSegment', !state ? null : state);
};

feedService.prototype.EndOfMatch = function (matchInstance) {
    if (this.active == false)
        return;

    this.emitter.emit('endOfMatch');
    log.info('[Feed service]: Sent an endOfMatch event');

    // Try disposing all parser objects: This part is obsolete since cleaning up is now a task of the Terminate method
    //for (var key in this.parser.keys(require.cache)) {delete require.cache[key];}
    //this.parsername = null;
    //this.parser = null;
};

// The count of events added to queue
feedService.prototype.queueCount = 0;

feedService.prototype.Terminate = function (callback) {
    var that = this;
    that.active = false;

    if (that.parser) {
        that.parser.Terminate(function () {
            setTimeout(function () {
                that.parsername = null;
                that.parser = null;

                if (callback)
                    return callback(null);
            }, 300);
        });
    }
    else {
        that.parsername = null;
        that.parser = null;

        if (callback)
            callback(null);
    }
};

// Helper function that loads a team players from the mongoDb store
feedService.prototype.LoadPlayers = function (teamId, callback) {
    if (!mongoose)
        return callback(null);
    try {
        return mongoose.mongoose.models.players.find({ teamId: teamId }, callback);
    }
    catch (error) {
        log.error("Error while loading players from Mongo: %s", error.message);
        return callback(error);
    }
};


feedService.prototype.LoadTeam = function (teamId, callback) {
    if (!mongoose)
        return callback(null);
    try {
        return mongoose.mongoose.models.teams.findById(teamId, callback);
    }
    catch (error) {
        log.error("Error while loading team from Mongo: %s", error.message);
        return callback(error);
    }
};


feedService.prototype.LoadCompetition = function (competitionId, callback) {
    if (!mongoose)
        return callback(null);

    try {
        return mongoose.mongoose.models.competitions.findById(competitionId, callback);
    }
    catch (error) {
        log.error("Error while loading competition from Mongo: %s", error.message);
        return callback(error);
    }
};

feedService.prototype.SaveParsedEvents = function (parserName, matchId, eventIds, diffedEvents, allEvents, incompleteEvents, parserStatus) {
    if (!mongoose)
        return;

    try {
        if (this.logAllEvents == false){
            allEvents = null;
        }

        async.parallel(
            [
                function (pcbk) {
                    let updateQuery = { $set: { matchid: matchId } };
                    updateQuery['$set']['parsed_eventids.' + parserName] = eventIds;
                    updateQuery['$set']['incomplete_events.' + parserName] = incompleteEvents;
                    updateQuery['$set']['parser_status.' + parserName] = parserStatus;

                    if (diffedEvents && (_.isArray(diffedEvents) ? diffedEvents.length > 0 : true)) {
                        updateQuery['$push'] = {};
                        if (_.isArray(diffedEvents)) {
                            if (diffedEvents.length > 0) {
                                updateQuery['$push']['diffed_events.' + parserName] = { $each: diffedEvents };
                            }
                        }
                        else 
                            updateQuery['$push']['diffed_events.' + parserName] = diffedEvents;
                    }

                    return mongoose.mongoose.models.matchfeedStatuses.findOneAndUpdate({ matchid: matchId }, updateQuery, { upsert: true }, pcbk);
                },
                function (pcbk) {
                    if (!allEvents)
                        return async.setImmediate(function () {
                            pcbk(null);
                        });

                    let allEventsInstance = new mongoose.mongoose.models.matchRawEventsStreams({
                        matchid: matchId,
                        events_time: new Date(),
                        all_events: {}
                    });
                    allEventsInstance.all_events[parserName] = allEvents;
                    return allEventsInstance.save({ validateBeforeSave: false }, pcbk);
                }
            ],
            function (parallelError, results) {
                if (parallelError)
                    log.error("Error while saving parser eventIds in match moderation: %s", err.stack);
            });

    }
    catch (error) {
        log.error("Error while saving parser eventIds in Mongo: %s", error.message);
        return;
    }
};

feedService.prototype.LoadParsedEvents = function (parserName, matchId, callback) {
    if (!mongoose)
        return;

    try {
        var projection = {};
        projection['parsed_eventids.' + parserName] = 1;
        projection['incomplete_events.' + parserName] = 1;
        projection['parser_status.' + parserName] = 1;
        mongoose.mongoose.models.matchfeedStatuses.findOne({ matchid: matchId }, projection, function (err, result) {
        if (err) {
            log.error("Error while loading parser eventIds in match moderation: %s", err.message);
            return callback(err);
        }
        if (!result)
            return callback(null, null, null, null, null);

        callback(
            null,
            !result.parsed_eventids ? null : result.parsed_eventids[parserName],
            !result.incomplete_events ? null : result.incomplete_events[parserName],
            !result.diffed_events ? null : result.diffed_events[parserName],
            !result.parser_status ? null : result.parser_status[parserName]);
        });
    }
    catch (error) {
        log.error("Error while loading parser eventIds from Mongo: %s", error.message);
        return callback(error);
    }
};


// Loads from the scheduled_matches collection and from the specified matchId document, the parser eventIds that are contained in the timeline object property
feedService.prototype.LoadMatchEvents = function (parserName, matchId, callback) {
    if (!mongoose)
        return;

    try {
        mongoose.mongoose.models.scheduled_matches.findById(matchId, 'timeline', (mongoErr, match) => {
            if (mongoErr) {
                log.error(`Error while loading parser eventIds from match id ${matchId} Mongo: \n${mongoErr.stack}`);
                return callback(error);
            }

            if (!match || !match.timeline || match.timeline.length == 0)
                return callback(null);

            const timelineEvents = _.flatMap(match.timeline, (segment) => { return segment.events; });
            const timelineEventIds = _.map(timelineEvents, 'parserids.' + parserName);
            return callback(null, timelineEventIds);
        });
    }
    catch (error) {
        log.error(`Error while loading parser eventIds from match id ${matchId} Mongo: ${error.message}`);
        return callback(error);
    }
}

feedService.prototype.LoadAllEventsStream = function (parserName, matchId, stepNo, callback) {
    if (!mongoose)
        return;

    if (!stepNo)
        stepNo = 0;

    try {
        let projection = {
            incomplete_events: 0,
            parsed_eventids: 0,
            parser_status: 0
        };
        projection['diffed_events.' + parserName] = { $slice: [stepNo, 1] };
        mongoose.mongoose.models.matchfeedStatuses.findOne({ matchid: matchId }, projection, function (err, result) {
            if (err) {
                log.error("Error while loading raw events stream in match moderation: %s", err.message);
                return callback(err);
            }
            if (!result || !result.diffed_events || !result.diffed_events[parserName])
                return callback(null);

            callback(null, _.isArray(result.diffed_events[parserName]) && result.diffed_events[parserName].length > 0 ? result.diffed_events[parserName][0] : result.diffed_events[parserName]);
        });

        //mongoose.mongoose.models.matchRawEventsStreams.findOne({ matchid: matchId }).sort({ events_time: 1 }).skip(stepNo).limit(1).exec(function (err, result) {
        //    if (err) {
        //        log.error("Error while loading raw events stream in match moderation: %s", err.message);
        //        return callback(err);
        //    }
        //    if (!result || !result.all_events || !result.all_events[parserName] || result.all_events[parserName].length == 0)
        //        return callback(null);

        //    callback(null, result.all_events[parserName]);
        //});
    }
    catch (error) {
        log.error("Error while loading raw events stream from Mongo: %s", error.message);
        return callback(error);
    }
};

module.exports = feedService;
