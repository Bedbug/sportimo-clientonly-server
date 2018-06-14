/* Author: ELias Kalapanidas (last update: 2017/11/30) */

'use strict';

const scheduler = require('node-schedule');
const amqp = require('amqplib/callback_api');
const needle = require("needle");
const crypto = require("crypto-js");
const async = require('async');
const _ = require('lodash');
const moment = require('moment');
const winston = require('winston');
const mongoose = require('mongoose');
const matches = mongoose.models.scheduled_matches;
const EventEmitter = require('events');
//var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');


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
// Settings for the development environment

// languageMapping maps Sportimo langage locale to Stats.com language Ids. For a list of ISO codes, see https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
var languageMapping = {
    "ar": "10", // arabic
    "en": "1", // english
    "yi": "28", // yiddish (hebrew)
    "ru": "16"

    // Add all required language mappings here from Stats.com
};


var statscoreConfigDevelopment = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "queue.softnetsport.com", // url prefix for the AMQP RabbitQueue service
    urlApiPrefix: "https://api.softnetsport.com/v2/", // url prefix for the Http API endpoints
    queueName: "gu-group",
    userName: "gu-group",
    apiKey: "132",  // actually, this is the client_id
    apiSecret: "3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh", 
    virtualHost: "statscore",
    eventsInterval: 6000,  // Rather obsolete. Used to be how many milli seconds interval between succeeding calls to Stats API in order to get the refreshed match event feed.
    parserIdName: "Statscore"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Settings for the production environment
var statscoreConfigProduction = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "queue.softnetsport.com", // url prefix for the AMQP RabbitQueue service
    urlApiPrefix: "https://api.softnetsport.com/v2/", // url prefix for the Http API endpoints
    queueName: "gu-group",
    userName: "gu-group",
    apiKey: "132",  // actually, this is the client_id
    apiSecret: "3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh",
    virtualHost: "statscore",
    eventsInterval: 6000,  // Rather obsolete. Used to be how many milli seconds interval between succeeding calls to Stats API in order to get the refreshed match event feed.
    parserIdName: "Statscore"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Assign the settings for the current environment
var localConfiguration = statscoreConfigDevelopment;


// Settings properties

let configuration = localConfiguration;

let rabbitConnection = null;
let activeMatchIds = [];

module.exports = Parser;


const SportimoTimelineEvents = {
    "419": "Yellow",
    "408": "Corner",
    "418": "Red",
    "410": "Foul",
    "413": "Goal",
    //"415": "Injury",  // not supported by Sportimo yet.
    "416": "Offside",
    "420": "Penalty",
    "421": "Goal",  // "Penalty-Goal"
    //"422": "Missed-Penalty",
    //"19": "Shot_off_Goal",   // forcing simple shot events to be registered as Shot_on_Goal as well
    "405": "Shot_on_Goal",
    // "414": "Substitution",
    "450": "Substitution",   // substitution out
    "452": "Substitution",   // substitution in
    "423": "Own_Goal",
    //"424": "Goal-Cancelled"
};
const SportimoGoalEvents = {
    "413": "Goal",
    "421": "Goal"  // "Penalty-Goal"
};

const SportimoSubstitutionEvents = {
    "450": "Substitution",   // substitution out
    "452": "Substitution",   // substitution in
};

const SegmentProgressionEvents = {
    '429': 'First-half started',
    '445': 'Halftime',
    '430': 'Second-half started',
    '437': 'Finished regular time',
    '431': 'Extra-time first-half started',
    '432': 'Extra-time second-half started',
    '433': 'Penalty shoot-out started',
    '434': 'Finished after extratime',
    '435': 'Finished after penalties'
};


const MatchTerminationEvent = 451; // To finish
const MatchTerminationStateIds = [
    //'finished',
    //'cancelled',
    //'deleted'
    3,  // cancelled
    7,  // abandoned
    11, // finished
    12, // finished awarded win
    13, // finished after penalties
    14 // finished after extra time
];

const envIsDev = !process.env.NODE_ENV || (process.env.NODE_ENV == "development") || false;


const Emitter = new EventEmitter();

// Statscore API authorization properties
let authToken = null;
let authTokenExpiration = new Date();

// Settings for logging incoming messages from the queue
let messagesLogged = 0;
const maxMessagesLogged = 20;

const StartQueueReceiver = function (matchParserId, callback) {
    const connString = `amqp://${configuration.queueName}:${configuration.apiSecret}@${configuration.urlPrefix}/${configuration.virtualHost}`;

    if (matchParserId && _.indexOf(activeMatchIds, matchParserId) == -1)
        activeMatchIds.push(matchParserId);

    if (rabbitConnection)
        return callback(null);

    amqp.connect(connString, function (err, conn) {

        if (err) {
            log.error('Error connecting: ' + err.message);
            return callback(err);
        }
        else {
            rabbitConnection = conn;
            log.info('About to create channel ...');
            conn.createChannel(function (chErr, ch) {
                if (chErr) {
                    log.error('Error creating channel: ' + chErr.message);
                    conn.close();
                    return callback(chErr);
                }
                else {
                    const queue = 'gu-group';
                    log.info('About to connect to queue ' + queue);
                    ch.checkQueue(queue, (existErr, existOk) => {
                        if (existErr) {
                            log.error(queue + ' queue does not exist: ' + existErr);
                            conn.close();
                            return callback(existErr);
                        }
                        else {
                            ch.consume(queue, (msg) => {
                                const msgString = msg.content.toString('utf8');
                                //console.log(msgString);
                                let msgObj = JSON.parse(msgString);

                                // Log incoming messages up to maxMessagesLogged to see if it is pertinent to booked match
                                if (messagesLogged < maxMessagesLogged) {
                                    log.debug(msgObj);
                                    messagesLogged++;
                                }

                                if (msgObj.data && msgObj.data.event && msgObj.data.event.sport_id == 5) {
                                    if (msgObj.data.event.id && _.indexOf(activeMatchIds, msgObj.data.event.id.toString()) > -1) {
                                        // Consume msg properly
                                        Emitter.emit('event', msgObj);
                                        // And ack this 
                                        //ch.ack(msg, false);
                                    }
                                    //else {
                                    //    msgObj = null;      // prepare msgObj for GC
                                    //    if (!envIsDev) 
                                    //        ch.ack(msg, false);
                                    //    else
                                    //        // And reject this but requeue it for other consumers (dev, production) to pick
                                    //        ch.reject(msg, true);
                                    //}
                                    if (messagesLogged == 1)
                                        ch.ack(msg, true);
                                    else
                                        ch.ack(msg, false);
                                }
                                else {
                                    msgObj = null;      // prepare msgObj for GC
                                    // And reject and do not requeue this
                                    ch.reject(msg, false);
                                }


                            }, { noAck: false }, (errConsume, consumeOk) => {
                                if (errConsume)
                                    log.error(errConsume);
                            });

                            return callback(null);
                        }
                    });


                    ch.on('error', (err) => {
                        log.error('Channel error: ' + err.stack);
                        //conn.close();
                    });
                }
            });
        }
    });
}


// Decided to NOT open a connection for the lifetime of the server, due to having conflicts between the 2 deployments over the messages to be processed
//if (!envIsDev)
//    StartQueueReceiver(null, (err) => {
//        if (err) {
//            log.error('[Statscore parser]: Error starting queue: ' + err.message);
//        } else {
//            log.info('[Statscore parser]: RabbitQueue Consumer started successfully');
//        }
//    });



// Restrict to Only call this once in the lifetime of this object
function Parser(matchContext, feedServiceContext) {

    this.Name = configuration.parserIdName;
    this.isPaused = false;
    this.matchHandler = matchContext;
    this.feedService = feedServiceContext;
    this.scheduledTask = null;

    this.allEventsQueue = [];
    this.sportimoEventIdsQueue = [];

    // determines whether the match is simulated from previously recorded events in all_events kept in matchfeedstatuses
    this.simulationStep = 0;
    this.isSimulated = false;
    
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

    // the parser upon initialization will inquire about the competition mappings
    this.league = null;

    this.status = {
        //homeTeamGoalEvents: [],
        //awayTeamGoalEvents: [],
        homeSubstitutions: [],
        awaySubstitutions: [],
        processedIncidentIds: [],   // keeps a list of incicent_id of all events that are sent to the feed service
        coolDownUntil: null     // this is a date-time, and if set we cease injecting artificial events (shot on target, cancelling goals, correcting the scoreline) until it expires
    }
    this.pendingMessages = [];    // list of messages that await persistence

    if (!this.matchHandler.completed || this.matchHandler.completed == false) {
        // Register to internal socket manager events
        Emitter.on('event', this.ConsumeMessage.bind(this));
    }

    //memwatch.on('leak', function (info) { log.debug(info); });
}


Parser.prototype.init = function (cbk) {
    var that = this;
    var isActive = null;
    var startDate = null;
    let isBooked = false;

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
            BookMatch(that.matchParserId, (bookErr, bookResult) => {
                if (bookErr) {
                }
                else
                    isBooked = true;

                return callback(null);
            });
        },
        function (callback) {
            that.feedService.LoadParsedEvents(that.Name, that.matchHandler.id, function (error, parsed_eventids, incomplete_events, diffed_events, parser_status) {
                if (error)
                    return callback(error);

                if (parsed_eventids && parsed_eventids.length > 0) {
                    that.sportimoEventIdsQueue = parsed_eventids;
                }
                else {
                    //that.feedService.LoadMatchEvents(that.Name, that.matchHandler.id, function (error, matchParserEventIds) {
                    //    if (error)
                    //        return callback(error);

                    //    that.sportimoEventIdsQueue = matchParserEventIds;
                    //});
                }
                if (parser_status)
                    that.status = parser_status;

                return callback(null);
            });
        },
        function (callback) {
            // Get the state of the match, and accordingly try to schedule the timers for receiving the match events
            GetEventStatus(that.matchParserId, (statusErr, eventStatus) => {
                if (statusErr)
                    return callback(statusErr);

                isActive = eventStatus;
                return callback(null, eventStatus);
            });
        },
        function (callback) {
            that.feedService.LoadCompetition(that.matchHandler.competition, function (error, response) {
                if (error)
                    return callback(error);

                that.league = response;
                callback(null);
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
            log.error(error.message);
            return cbk(error);
        }

        var scheduleDate = that.matchHandler.start;

        if (!scheduleDate)
            return cbk(new Error('No start property defined on the match to denote its start time. Aborting.'));

        var formattedScheduleDate = moment.utc(scheduleDate);
        formattedScheduleDate.subtract(300, 'seconds');

        log.info(`[Statscore on ${that.matchHandler.name}]: Scheduled Date is ${formattedScheduleDate.toDate()}`);

        var itsNow = moment.utc();

        // If the match has started already, then circumvent startTime, unless the match has ended (is not live anymore)
        if ((moment.utc(scheduleDate) <= itsNow && isActive) || (itsNow >= formattedScheduleDate && itsNow < moment.utc(scheduleDate))) {
            log.info(`[Statscore on ${that.matchHandler.name}]: Queue listener started immediately for matchid ${that.matchHandler.id}`);
            return async.parallel([
                (asyncCbk) => { return StartQueueReceiver(that.matchParserId, asyncCbk); },
                (asyncCbk) => { return BookMatch(that.matchParserId, asyncCbk); }
            ], cbk);
        }
        else {
            // Schedule match feed event calls
            if (isBooked) {

                that.scheduledTask = scheduler.scheduleJob(that.matchHandler.id, formattedScheduleDate.toDate(), function () {
                    log.info(`[Statscore on ${that.matchHandler.name}]: Scheduled queue listener started for matchid ${that.matchHandler.id}`);
                    StartQueueReceiver(that.matchParserId, () => { });
                    //MessagingTools.sendPushToAdmins({ en: 'Statscore scheduled feed listener started for matchid: ' + that.matchHandler.id });
                });

                if (that.scheduledTask) {
                    log.info(`[Statscore on ${that.matchHandler.name}]: Timer scheduled successfully for matchid ${that.matchHandler.id}`);

                    const job = _.find(scheduler.scheduledJobs, { name: that.matchHandler.id }); // that.scheduledTask;

                    const duration = moment.duration(moment(job.nextInvocation()).diff(itsNow));
                    const durationAsMinutes = duration.asMinutes();
                    if (job.nextInvocation())
                        log.info(`[Statscore on ${that.matchHandler.name}]: Queue listener for ${that.matchParserId} will start in ${durationAsMinutes.toFixed(2)} minutes`);

                } else
                    if (!that.matchHandler.completed || that.matchHandler.completed == false) {
                        //        log.info('[Statscore parser]: Fetching only once feed events for matchid %s', that.matchHandler.id);
                        //        that.TickMatchFeed();
                        that.isSimulated = true;
                        log.info(`[Statscore on ${that.matchHandler.name}]: Simulated events stream Timer started for matchid ${that.matchHandler.id}`);
                        that.StartQueueReplayer(that.matchParserId, that.sportimoEventIdsQueue);
                    }

                return cbk(null);
            }
            else
                return cbk(new Error(`[Statscore parser]: Failed to book match id ${that.matchHandler.id} (parser id ${that.matchParserId})`));
        }
    });
};




Parser.prototype.StartQueueReplayer = function (matchParserId, matchParserEventIds) {
    const that = this;
    const matchParserEventIdLookup = _.mapValues(matchParserEventIds, true);

    // Try to get feed data from matchfeedstatuses first

    GetPastEventFeed(matchParserId, (err, allEvents) => {
        if (err) {
            log.error(err.message);
            return;
        }

        // order events chronologically by its utc epoch (ut property)
        allEvents = _.sortBy(allEvents, 'ut');
        //allEvents = _.reverse(allEvents);

        allEvents = _.filter(allEvents, (e) => { return !matchParserEventIdLookup[TranslateEventMessageId(e)]; });

        //_.forEach(allEvents, (event) => {
        //    Emitter.emit('event', event);
        //});

        async.eachSeries(allEvents, (event, cbk) => {
            if (this.feedService)
                setTimeout(() => {
                    Emitter.emit('event', event);
                    cbk(null);
                }, 300);
            else
                cbk(null);
        });
    });
}


Parser.prototype.Pause = () => {
    this.isPaused = true;
}

Parser.prototype.Resume = () => {
    this.isPaused = false;
}





Parser.prototype.ConsumeMessage = function (message) {
    const that = this;
    const now = !that.isSimulated ? moment.utc() : moment.unix(message.ut);

    if (message.data.event.id.toString() != that.matchParserId)
        // the message is not relevant to this match, return
        return;

    // Ignore messages that are already processed
    if (_.indexOf(that.sportimoEventIdsQueue, TranslateEventMessageId(message)) > -1)
        return;

    //let hd = new memwatch.HeapDiff();


    // reset coolDownUntil?
    if (that.status.coolDownUntil && now.isAfter(moment.utc(that.status.coolDownUntil)))
        that.status.coolDownUntil = null;

    let homeTeamResult = null;
    let awayTeamResult = null;
    // Make corrective actions about the match score, if possible, but not if the current event is a goal (that is going to change the score anyway)
    // Check the match score and see if it needs to be adjusted from the event, but only if the score in the feed is updated during the event (no value) and NOT at finish time (yes value)
    if (
        (!message.data.incident || !SportimoGoalEvents[message.data.incident.incident_id])
        && message.data.event && message.data.event.ft_only == 'no'
        && message.data.event.participants
        && message.data.event.participants.length >= 2
    ) {
        const homeTeamResult = _.find(message.data.event.participants[0].results, { id: 2 });
        const awayTeamResult = _.find(message.data.event.participants[1].results, { id: 2 });

        if (!that.status.coolDownUntil
            && that.matchHandler
            && homeTeamResult !== 'undefined'
            && homeTeamResult != null
            && homeTeamResult.value != null
            && awayTeamResult !== 'undefined'
            && awayTeamResult != null
            && awayTeamResult.value != null
        ) {
            if (homeTeamResult.value != that.matchHandler.home_score || awayTeamResult.value != that.matchHandler.away_score) {
                log.info(`[Statscore on ${that.matchHandler.name}]: A different match score line is observed in the incoming event: ${homeTeamResult.value} - ${awayTeamResult.value} (instead of the current ${that.matchHandler.home_score} - ${that.matchHandler.away_score})`);
                if (!that.isPaused && that.feedService) {
                    const matchEvent = {
                        type: 'Scoreline',
                        homeScore: homeTeamResult.value,
                        awayScore: awayTeamResult.value,
                        data: {
                            type: 'Scoreline',
                            match_id: that.matchHandler._id,
                            time: message.data.incident ? +(_.split(message.data.incident.event_time, ':')[0]) + 1 : 'unknown'
                        }
                    };
                    // Delay the event in the case a goal is coming right after this
                    setTimeout(() => {
                        if (!that.isPaused && that.feedService)
                            that.feedService.AddEvent(matchEvent);
                    }, 10000);
                    that.status.coolDownUntil = now.clone().add(30, 's').toDate();
                }
            }
        }
    }

    const eventState = message.data.event ? TranslateMatchState(message.data.event.status_id) : null;

    // Make corrective action about the match segment
    // if  we are not in cooldown period, compare the event's status_id against the match current state (segment), and correct if necessary
    if (that.matchHandler && !that.status.coolDownUntil && eventState != null && eventState > that.matchHandler.state && (!message.data.incident || !SegmentProgressionEvents[message.data.incident.incident_id]) ) {
        log.info(`[Statscore on ${that.matchHandler.name}]: Intercepted a Segment Advance event in event id ${message.data.event.id}`);
        if (!that.isPaused && that.feedService) {
            that.feedService.AdvanceMatchSegment(eventState);
            that.status.coolDownUntil = now.clone().add(90, 's').toDate();
        }
    }


    // from this point on, process only messages that are incidents (events in an active play)
    if (message.data.incident) {
        const incident = message.data.incident;

        if (incident.action == 'insert' || incident.action == 'update') {

            // Check against match termination event(s)
            // eventState >= 8 guarantees that the parser ends before the penalties stage of the match
            if (!that.status.isTerminated && (incident.incident_id == MatchTerminationEvent || _.indexOf(MatchTerminationStateIds, message.data.event.status_id) > -1 || eventState >= 8)) {
                log.info(`[Statscore on ${that.matchHandler.name}]: Intercepted a match Termination event.`);

                if (!that.isPaused && that.feedService) {
                    if (that.matchHandler.state == 3 || that.matchHandler.state == 7) {
                        // Add the finish event of the second half
                        that.feedService.AdvanceMatchSegment(that.matchHandler.state + 1);
                        that.status.coolDownUntil = now.clone().add(90, 's').toDate();
                        setTimeout(() => {
                            // Send an event that the match is ended.
                            that.feedService.EndOfMatch();
                        }, 5000);
                    }
                    else
                        that.feedService.EndOfMatch();
                }
                setTimeout(() => {
                    if (that.matchHandler)
                        that.Terminate();
                    // }, that.feedService.queueCount * 1000);
                }, 10000);

                if (!that.status.isTerminated)
                    that.status.isTerminated = true;
            }

            const isIncidentProcessed = _.indexOf(that.status.processedIncidentIds, incident.id) > -1 ? true : false;

            // Check against segment change (progression) events
            if (!that.status.coolDownUntil && !isIncidentProcessed && SegmentProgressionEvents[incident.incident_id]) {
                log.info(`[Statscore on ${that.matchHandler.name}]: Intercepted a Segment Advance event ${SegmentProgressionEvents[incident.incident_id]}`);
                that.status.processedIncidentIds.push(incident.id);
                if (!that.isPaused && that.feedService) {
                    that.feedService.AdvanceMatchSegment(eventState);
                    that.status.coolDownUntil = now.clone().add(90, 's').toDate();
                }
            }

            // If not segment change, check against mapped Sportimo timeline events then translate event and send to event queue
            else if (SportimoTimelineEvents[incident.incident_id]) {
                const translatedEvent = !SportimoSubstitutionEvents[incident.incident_id] ? that.TranslateMatchEvent(message.data) : that.TranslateSubstitutionEvent(message.data);
                if (translatedEvent) {

                    // Change event action from Update to Insert for never before appeared incident to be updated
                    if (!isIncidentProcessed && incident.action == 'update')
                        translatedEvent.type = 'Add';

                    // If it is a new Goal, add it to parser status and inject an artificial shoot on target event right before
                    if (!isIncidentProcessed && SportimoGoalEvents[incident.incident_id]) {
                        that.status.coolDownUntil = now.clone().add(30, 's').toDate();

                        if (incident.incident_id == 413 && !that.isPaused) {
                            let shootMessage = _.cloneDeep(message);
                            shootMessage.data.incident.incident_id = 405;
                            shootMessage.data.incident.id += '405';
                            shootMessage.ut -= 1;
                            const shootEvent = that.TranslateMatchEvent(shootMessage.data);
                            if (shootEvent && that.feedService)
                                that.feedService.AddEvent(shootEvent);
                        }
                    }
                    // If it is a Own Goal, switch the team id
                    else if (!isIncidentProcessed && incident.incident_id == 423) {
                        translatedEvent.data.team = translatedEvent.data.team == 'home_team' ? 'away_team' : 'home_team';
                        translatedEvent.data.team_id = translatedEvent.data.team == 'home_team' ? that.matchHandler.home_team.id : that.matchHandler.away_team.id;

                        let goalMessage = _.cloneDeep(message);
                        goalMessage.data.incident.incident_id = 413;
                        goalMessage.data.incident.id += '413';
                        goalMessage.ut += 1;
                        const goalEvent = that.TranslateMatchEvent(goalMessage.data);
                        if (!that.isPaused && goalEvent && that.feedService) {
                            setTimeout(() => {
                                that.feedService.AddEvent(goalEvent);
                                that.status.coolDownUntil = now.clone().add(30, 's').toDate();
                            }, 1000);
                        }
                    }
                    if (!that.isPaused && that.feedService)
                        that.feedService.AddEvent(translatedEvent);

                    // Add the processed incident id to the processedIncidentIds status list
                    that.status.processedIncidentIds.push(incident.id);
                }
            }
        }
        else
            if (incident.action == 'delete' && !SportimoSubstitutionEvents[incident.incident_id]) {

                const isIncidentProcessed = _.indexOf(that.status.processedIncidentIds, incident.id) > -1 ? true : false;

                if (isIncidentProcessed) {
                    const translatedEvent = that.TranslateMatchEvent(message.data);

                    if (translatedEvent) {

                        // Own goal? Delete the artificially injected Gaol event as well
                        if (incident.incident_id == 423) {
                            translatedEvent.data.team = translatedEvent.data.team == 'home_team' ? 'away_team' : 'home_team';
                            translatedEvent.data.team_id = translatedEvent.data.team == 'home_team' ? that.matchHandler.home_team.id : that.matchHandler.away_team.id;

                            let goalMessage = _.cloneDeep(message);
                            goalMessage.data.incident.incident_id = 413;
                            goalMessage.data.incident.id += '413';
                            goalMessage.ut += 1;
                            const goalEvent = that.TranslateMatchEvent(goalMessage.data);
                            if (!that.isPaused && goalEvent && that.feedService) {
                                setTimeout(() => {
                                    that.feedService.AddEvent(goalEvent);
                                }, 1000);
                            }
                        }

                        if (!that.isPaused && that.feedService) {
                            that.feedService.AddEvent(translatedEvent);
                        }
                    }
                }
            }

        // In any case, save event, except if this is a simulated session
        if (!that.isSimulated && that.feedService && (SportimoTimelineEvents[incident.incident_id] || SegmentProgressionEvents[incident.incident_id])) {
            //that.allEventsQueue.push(message); // this list considerably raises memory consumption until the end of the match, with an average of 500 messages held in-memory

            that.feedService.SaveParsedEvents(that.Name, that.matchHandler.id, that.sportimoEventIdsQueue, that.pendingMessages, null, [], that.status);
            that.pendingMessages = [];
        }
    }
    else {
        // Get generic information about the match, not timeline info, such as pitch conditions, weather, other event details
    }

    if (!that.isSimulated && that.feedService) {
        that.pendingMessages.push(message);

        // Add the id to known and processed event ids
        that.sportimoEventIdsQueue.push(TranslateEventMessageId(message));
    }
}


Parser.prototype.Terminate = function (callback) {

    // Cancel scheduled task, if existent
    if (this.scheduledTask) {
        this.scheduledTask.cancel();
        this.scheduledTask = null;
    }

    this.isPaused = true;

    log.info(`[Statscore on ${this.matchHandler.name}]: Terminated and closed down parser`);
    
    // Decide whether the rabbitQueue should be disconnected
    if (activeMatchIds.length > 0) {
        activeMatchIds.splice(activeMatchIds.indexOf(this.matchParserId), 1);
        if (activeMatchIds.length == 0) {
            //if (rabbitConnection) {
            //    rabbitConnection.close();
            //    rabbitConnection = null;
            //}

            log.info(`[Statscore on ${this.matchHandler.name}]: No current active or scheduled matches`);
        }
    }
    // Unregister and detouch from event emitter
    Emitter.removeListener('event', this.ConsumeMessage.bind(this));

    this.matchHandler = null;
    this.feedService = null;

    if (callback)
        callback(null);
};





// Helper Methods
const TranslateMatchState = function (statusId) {
    let matchState = null;

    switch (statusId) {
        case 1:         // not started
            matchState = 0;
            break;
        case 33:        // first half started
            matchState = 1;
            break;
        case 9:         // halftime
            matchState = 2;
            break;
        case 34:        // second half started
            matchState = 3;
            break;
        case 11:        // (normal time) finished
        case 48:        // waiting for extra time
            matchState = 4;
            break;
        case 35:        // extra time first half
            matchState = 5;
            break;
        case 37:        // extra time half-time
            matchState = 6;
            break;
        case 36:        // extra time second half
            matchState = 7;
            break;
        case 14:        // finished after extra time
        case 142:       // waiting for penalty
            matchState = 8;
            break;
        case 141:       // penalty shootout
        case 13:        // finished after penalties
        case 152:       // to finish
            matchState = 9;
            break;
        // Not used event_status_id codes:
        // 2: Interrupted
        // 3: Cancelled
        // 5: Postponed
        // 6: Start delayed
        // 7: Abandoned
        // 12: Finished awarded win
    }

    return matchState;
}


Parser.prototype.TranslateSubstitutionEvent = function (parserEvent) {
    const incident = parserEvent.incident;
    let substitutionIsComplete = false;

    // Basic event validation
    if (!parserEvent || !incident || !incident.incident_id || !this.matchHandler)// || this.isPaused == true)
        return null;

    // Validation for not supported event types
    if (!SportimoTimelineEvents[incident.incident_id])
        return null;

    // Validation for mapped Sportimo team id
    if (!this.matchTeamsLookup[incident.participant_id])
        return null;

    const eventTime = +(_.split(incident.event_time, ':')[0]) + 1;    // e.g. 77
    const teamType = this.matchTeamsLookup[incident.participant_id].matchType;  // 'home_team' or 'away_team'
    const player = incident.subparticipant_id && this.matchPlayersLookup[incident.subparticipant_id] ?
        {
            id: this.matchPlayersLookup[incident.subparticipant_id].id,
            name: this.matchPlayersLookup[incident.subparticipant_id].name,
            team: this.matchPlayersLookup[incident.subparticipant_id].teamId
        } : null;

    if (!player)
        return null;

    let incompleteSubstitution = null;
    if (teamType == 'home_team') {
        incompleteSubstitution = _.find(this.status.homeSubstitutions, { time: eventTime });
    } else if (teamType == 'away_team') {
        incompleteSubstitution = _.find(this.status.awaySubstitutions, { time: eventTime });
    }


    if (!incompleteSubstitution) {
        const isTimelineEvent = true;
        const eventName = SportimoTimelineEvents[incident.incident_id];
        // No need to do that since names are inside our pre-defined SportimoTimelineEvents dictionary, but keep it for other events in the future:
        const eventId = incident.id;
        let matchState = TranslateMatchState(incident.event_status_id);

        var translatedEvent = {
            type: 'Add',
            time: eventTime,   // Make sure what time represents. Here we assume time to be the match minute from the match start.
            data: {
                id: eventId,
                parserids: {},
                status: 'active',
                type: eventName,
                state: matchState,
                sender: this.Name,
                time: eventTime,
                timeline_event: isTimelineEvent,
                description: {},
                team: teamType,
                team_id: this.matchTeamsLookup[incident.participant_id].id,
                match_id: this.matchHandler._id,
                players: [],
                stats: {}
            },
            created: moment.utc().toDate() // ToDo: Infer creation time from match minute
        };

        translatedEvent.data.description['en'] = (incident.subparticipant_name ? (incident.subparticipant_name + ' ') : '') + incident.participant_name + ' ' + incident.incident_name;

        if (incident.incident_id == 452)    // substitution in
            translatedEvent.data.players.push(player);
        else if (incident.incident_id == 450) {    // substitution out
            translatedEvent.data.players.push(null);
            translatedEvent.data.players.push(player);
        }

        // Make sure that the value set here is the quantity for the event only, not for the whole match    
        translatedEvent.data.stats[eventName] = 1;
        translatedEvent.data.parserids[this.Name] = eventId;

        if (teamType == 'home_team')
            this.status.homeSubstitutions.push(translatedEvent);
        else if (teamType == 'away_team')
            this.status.awaySubstitutions.push(translatedEvent);
    } else {
        if (incident.incident_id == 450 && incompleteSubstitution.data.players.length == 2) {
            incompleteSubstitution.data.players[1] = player;
        } else if (incident.incident_id == 452) {
            incompleteSubstitution.data.players[0] = player;
        }

        if (incompleteSubstitution.data.players.length == 2 && incompleteSubstitution.data.players[0])
            substitutionIsComplete = true;
    }

    if (substitutionIsComplete) {
        const completeSubstitutionEvent = _.cloneDeep(incompleteSubstitution);
        // Remove incompleteSubstitution - that is now complete - from the match status before returning the complete translated event
        if (teamType == 'home_team') {
            this.status.homeSubstitutions.splice(_.indexOf(this.status.homeSubstitutions, incompleteSubstitution), 1);
        } else if (teamType == 'away_team') {
            this.status.awaySubstitutions.splice(_.indexOf(this.status.awaySubstitutions, incompleteSubstitution), 1);
        }
        return completeSubstitutionEvent;
    }
    else
        return null;
}

Parser.prototype.TranslateMatchEvent = function (parserEvent) {
    const that = this;

    const incident = parserEvent.incident;

    // Basic event validation
    if (!parserEvent || !incident || !incident.incident_id || !this.matchHandler)// || this.isPaused == true)
        return null;

    // Validation for not supported event types
    if (!SportimoTimelineEvents[incident.incident_id])
        return null;

    // Validation for mapped Sportimo team id
    if (!this.matchTeamsLookup[incident.participant_id])
        return null;

    var offensivePlayer = incident.subparticipant_id && this.matchPlayersLookup[incident.subparticipant_id] ?
        {
            id: this.matchPlayersLookup[incident.subparticipant_id].id,
            name: this.matchPlayersLookup[incident.subparticipant_id].name,
            team: this.matchPlayersLookup[incident.subparticipant_id].teamId
        } : null;

    const isTimelineEvent = true;
    const eventName = SportimoTimelineEvents[incident.incident_id];
    // No need to do that since names are inside our pre-defined SportimoTimelineEvents dictionary, but keep it for other events in the future:
    //eventName = eventName.replace(/ /g, "_").replace(/-/g, "_"); // global string replacement
    const eventId = incident.id;
    const eventTimeFromMatchStart = +(_.split(incident.event_time, ':')[0]) + 1;    // get number conversion of the first part from a value such as "77:00"
    let matchState = TranslateMatchState(incident.event_status_id);

    var translatedEvent = {
        type: 'Add',
        time: eventTimeFromMatchStart,   // Make sure what time represents. Here we assume time to be the match minute from the match start.
        data: {
            id: eventId,
            parserids: {},
            status: 'active',
            type: eventName,
            state: matchState,
            sender: this.Name,
            time: eventTimeFromMatchStart,
            timeline_event: isTimelineEvent,
            description: {},
            team: this.matchTeamsLookup[incident.participant_id].matchType,
            team_id: this.matchTeamsLookup[incident.participant_id].id,
            match_id: this.matchHandler._id,
            players: [],
            stats: {}
        },
        created: moment.utc().toDate() // ToDo: Infer creation time from match minute
    };

    translatedEvent.data.description['en'] = (incident.subparticipant_name ? (incident.subparticipant_name + ' ') : '') + incident.participant_name + ' ' + incident.incident_name;

    if (offensivePlayer)
        translatedEvent.data.players.push(offensivePlayer);

    // Make sure that the value set here is the quantity for the event only, not for the whole match    
    translatedEvent.data.stats[eventName] = 1;
    translatedEvent.data.parserids[that.Name] = eventId;

    if (incident.action == 'update') 
        translatedEvent.type = 'Update';
    else if (incident.action == 'delete')
        translatedEvent.type = 'Delete';

    return translatedEvent;
};


const TranslateEventMessageId = function (message) {
    const firstPart = message.data.incident ? message.data.incident.id : '';
    const secondPart = message.id;
    const thirdPart = message.ut;

    return `${firstPart}:${secondPart}:${thirdPart}`;
}

// Statscore API methods for booking and un-booking a match feed

const Authenticate = function (callback) {
    const url = configuration.urlApiPrefix + "oauth.xml?client_id=" + configuration.apiKey + "&secret_key=" + configuration.apiSecret;
    needle.get(url, function (error, response) {
        if (error)
            return callback(error);

        if (response.statusCode != 200)
            return callback(new Error('[Statscore]: failed to get the authorization token.'));

        /* parse xml response of the type (example)

            <api ver="2.94" timestamp="1510163874">
	            <method name="oauth" details="https://softnet.atlassian.net/wiki/display/APS/oauth" total_items="" previous_page="" next_page="">
		            <parameter name="client_id" value="132"/>
		            <parameter name="secret_key" value="3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh"/>
	            </method>
	            <data>
		            <oauth client_id="132" token="ee8f93068ed00972542d9a214ae52745" token_expiration="1510250274"/>
	            </data>
            </api>
        */

        // get the oAuth token
        authToken = response.body.api.data.oauth['$'].token.toString();
        authTokenExpiration = new Date(response.body.api.data.oauth['$'].token_expiration);
        return callback(null, authToken);
    });
}



const BookMatch = function(statscoreMatchId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            const url = `${configuration.urlApiPrefix}booked-events?token=${authToken}&product=scoutsfeed&event_id=${statscoreMatchId}`; 

            needle.post(url, { timeout: 60000 }, function (error, response) {
                if (error) {
                    log.error(error.stack);
                    return cbk(error);
                }

                if (response && response.body && response.body.api && response.body.api.data && response.body.api.data.length > 0) {
                    log.info(`[Statscore]: Successfully booked match id ${statscoreMatchId}`);
                    return cbk(null);
                }
                else {
                    let errorMsg = `Failed booking event ${statscoreMatchId} `;
                    if (response && response.body && response.body.api && response.body.api.error) {
                        if (response.body.api.error.internal_code !== 'undefined' && response.body.api.error.internal_code == 4 && response.body.api.error.status == 400) {
                            // The match is already booked, do not throw error, return normally to start the match
                            log.info(`[Statscore]: The match id ${statscoreMatchId} is already booked`);
                            return cbk(null);
                        }
                        if (response.body.api.error.message)
                            errorMsg += ': ' + response.body.api.error.message;
                    }

                    return cbk(new Error(errorMsg));
                }
            });
        }
    ], callback);
}

/* Sample return from booking a match:

{
	"api": {
		"ver": "2.99",
		"timestamp": 1515401415,
		"method": {
			"parameters": {
				"client_id": 132,
				"product_id": 8,
				"product": "scoutsfeed",
				"event_id": "2200274",
				"token": "c1a0c3f781e5c5dee00cae2bf4cfd0ec"
			},
			"name": "booked-events.store",
			"details": "https:\/\/softnet.atlassian.net\/wiki\/display\/APS\/booked-events.store",
			"total_items": 1,
			"previous_page": "",
			"next_page": ""
		},
		"data": [{
				"id": 2200274,
				"client_event_id": "",
				"booked_by": null,
				"name": "Apollon Smirnis - Atromitos",
				"source": 1351,
				"relation_status": "not_started",
				"start_date": "2018-01-08 17:30",
				"ft_only": "no",
				"coverage_type": "from_tv",
				"scoutsfeed": "yes",
				"status_id": 1,
				"status_name": "Not started",
				"status_type": "scheduled",
				"sport_id": 5,
				"sport_name": "Soccer",
				"day": "16",
				"clock_time": null,
				"clock_status": "stopped",
				"winner_id": null,
				"progress_id": null,
				"bet_status": "suspended",
				"neutral_venue": "no",
				"item_status": "active",
				"ut": 1515155694,
				"old_event_id": null,
				"slug": "apollon-smirnis_atromitos,2200274",
				"area_id": 60,
				"area_name": "Greece",
				"competition_id": 2186,
				"competition_short_name": "Super League",
				"season_id": 29956,
				"season_name": "Super League 2017\/18",
				"stage_id": 84819,
				"stage_name": "Regular Season",
				"verified_result": "no",
				"round_id": 16,
				"round_name": "Round 16"
			}
		]
	}
}
*/


const UnbookMatch = function (statscoreMatchId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            const url = `${configuration.urlApiPrefix}booked-events/${statscoreMatchId}?token=${authToken}&product=scoutsfeed`;

            needle.delete(url, { timeout: 60000 }, function (error, response) {
                if (error) {
                    log.error(error.stack);
                    return cbk(error);
                }

                if (response && response.body && response.body.api && response.body.api.data && response.body.api.data.id)
                    return cbk(null);
                else {
                    let errorMsg = `Failed booking event ${statscoreMatchId} `;
                    if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
                        errorMsg += ': ' + response.body.api.error.message;
                    }

                    return cbk(new Error(errorMsg));
                }
            });
        }
    ], callback);
}


const GetPastEventFeedPage = function(statscoreMatchId, page, callback) {
    const url = `${configuration.urlApiPrefix}feed/${statscoreMatchId}?token=${authToken}&limit=500&page=${page}`;

    needle.get(url, { timeout: 60000 }, function (error, response) {
        if (error) {
            log.error(error.stack);
            return callback(error);
        }

        let totalItems = null;
        let totalPages = 0;

        if (response && response.body && response.body.api && response.body.api.data && _.isArray(response.body.api.data)) {
            if (response && response.body && response.body.api && response.body.api.method && response.body.api.method.total_items) {
                totalItems = response.body.api.method.total_items;
                totalPages = Math.trunc(totalItems / 500) + 1;
            }

            return callback(null, response.body.api.data, totalPages);
        }
        else {
            let errorMsg = `Failed fetching event feed ${statscoreMatchId} `;
            if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
                errorMsg += ': ' + response.body.api.error.message;
            }

            return callback(new Error(errorMsg));
        }
    });
}

const GetPastEventFeed = function (statscoreMatchId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            let allEvents = [];

            GetPastEventFeedPage(statscoreMatchId, 1, (firstPageErr, firstPageResults, totalPages) => {
                if (firstPageErr)
                    return cbk(firstPageErr);

                allEvents = allEvents.concat(firstPageResults);


                if (totalPages > 1) {
                    const pageRange = _.range(2, totalPages + 1);
                    return async.each(pageRange, (page, asyncCbk) => {
                        GetPastEventFeedPage(statscoreMatchId, page, (pageErr, pageResults, totPages) => {
                            if (pageErr) {
                                log.error(pageErr);
                            } else {
                                allEvents = allEvents.concat(pageResults);
                            }
                            return asyncCbk(null, allEvents);
                        });
                    }, (asyncErr) => {
                        if (asyncErr)
                            return cbk(asyncErr);

                        return cbk(null, allEvents);
                    });
                }
                else
                    return cbk(null, allEvents);
            });


            //const url = `${configuration.urlApiPrefix}feed/${statscoreMatchId}?token=${authToken}&limit=500`;
            //needle.get(url, { timeout: 60000 }, function (error, response) {
            //    if (error) {
            //        log.error(error.stack);
            //        return cbk(error);
            //    }


            //    if (response && response.body && response.body.api && response.body.api.data && _.isArray(response.body.api.data))
            //        return cbk(null, response.body.api.data);
            //    else {
            //        let errorMsg = `Failed booking event ${statscoreMatchId} `;
            //        if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
            //            errorMsg += ': ' + response.body.api.error.message;
            //        }

            //        return cbk(new Error(errorMsg));
            //    }
            //});
        }
    ], callback);
}


const GetEventStatus = function (statscoreMatchId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            const url = `${configuration.urlApiPrefix}events/${statscoreMatchId}?token=${authToken}`;

            needle.get(url, { timeout: 60000 }, function (error, response) {
                if (error) {
                    log.error(error.stack);
                    return cbk(error);
                }


                if (!(
                    !response.body
                    || !response.body.api
                    || !response.body.api.data
                    || !response.body.api.data.competition
                    || !response.body.api.data.competition.season
                    || !response.body.api.data.competition.season.stage
                    || !response.body.api.data.competition.season.stage.group
                    || !response.body.api.data.competition.season.stage.group.event
                )) {
                    const event = response.body.api.data.competition.season.stage.group.event;
                    const status = _.indexOf(MatchTerminationStateIds, event.status_id) > -1 ? false : true;
                    return cbk(null, status);
                }
                else {
                    let errorMsg = `Failed booking event ${statscoreMatchId} `;
                    if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
                        errorMsg += ': ' + response.body.api.error.message;
                    }

                    return cbk(new Error(errorMsg));
                }
            });
        }
    ], callback);
}



