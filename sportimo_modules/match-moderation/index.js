/*
 *  Moderation Module
 *  Created by MasterBug on 28/11/15.
 *
 *  Module usage:
 *  This is a core module tha handles all things related to matches that are going to be live in the game.
 */

/*  Libraries   */
var path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    bodyParser = require('body-parser'),
    winston = require('winston'),
    mongoose = require('mongoose'),
    async = require('async');

var scheduler = require('node-schedule');
var moment = require('moment');

var MessagingTools = require('../messaging-tools');


//var memwatch = require('memwatch-next');
//memwatch.on('leak', function (info) {
//    console.log('Leak detected: ' + JSON.stringify(info));
//});
//memwatch.on('stats', function (stats) { console.log('Heap stats: ' + JSON.stringify(stats, null, '\t')); });

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

// Sportimo Moderation sub-Modules
var match_module = require('./lib/match-module.js');

/*Bootstrap models*/
var team = null,
    scheduled_matches = null,
    matches = mongoose.models.scheduled_matches,
    feedstatuses = mongoose.models.matchfeedStatuses,
    users = mongoose.models.users;

/**
 * Redis Pub/Sub Channels
 */
var RedisClientPub;
var RedisClientSub;


/** 
 * CORE MODERATION SERVICE
 * Handles outside interaction and hold the list
 * of active matches schedule.
 */

// Use for local instances in order to not interfere with live server
var shouldInitAutoFeed = true;

var ModerationModule = {
    // MatchTimers: {
    //     Timers: {},
    //     get: function (id){
    //         var timer = Timers[id];
    //         if(!timer) {
    //             Timers[id] = null;
    //             timer = Timers[id];
    //         }
    //         return timer;
    //     }
    // },
    ModeratedMatches: [],

    testing: false,
    callback: null,
    mongoose: null,
    mock: false,
    count: function () {
        return _.size(this.ModeratedMatches);
    },
    init: function (done) {
        initModule(done);
    },
    SetupMongoDB: function (mongooseConnection) {

        if (!shouldInitAutoFeed) {
            console.log("---------------------------------------------------------------------------------------------");
            console.log("---- Warning: This server instance does not initialize the feed auto moderation feature -----");
            console.log("---------------------------------------------------------------------------------------------");
        }

        if (this.mock) return;
        this.mongoose = mongooseConnection;
        var modelsPath = path.join(__dirname, '../models');
        fs.readdirSync(modelsPath).forEach(function (file) {
            require(modelsPath + '/' + file);
        });
        team = this.mongoose.models.team;
        scheduled_matches = this.mongoose.models.scheduled_matches;
        // log.info("Connected to MongoDB");

        // Initialize the gamecards module
        var gamecards = require('../gamecards');
        gamecards.connect(this.mongoose, RedisClientPub, RedisClientSub);

    },
    SetupRedis: function (Pub, Sub, Channel) {

        if (this.mock) return;

        // Initialize and connect to the Redis datastore
        RedisClientPub = Pub;
        RedisClientSub = Sub;

        setInterval(function () {

            RedisClientPub.publish("socketServers", JSON.stringify({
                server: "[Moderation] Active matches: " + ModerationModule.ModeratedMatches.length
            }));

        }, 30000);

        RedisClientPub.on("error", function (err) {
            console.log("{''Error'': ''" + err + "''}");

            console.error(err.stack);
        });

        RedisClientSub.on("error", function (err) {
            log.error("{''Error'': ''" + err + "''}");
        });

        var countConnections = 0;
        RedisClientSub.on("subscribe", function (channel, count) {
            countConnections++;
            // log.info("[Moderation] Subscribed to Sportimo Events PUB/SUB channel - connections: " + countConnections);
        });

        RedisClientSub.on("unsubscribe", function (channel, count) {
            // log.info("[Moderation] Unsubscribed from Sportimo Events PUB/SUB channel");
        });

        RedisClientSub.on("end", function () {
            log.error("{Connection ended}");
        });

        // RedisClientSub.subscribe(Channel);

        RedisClientSub.on("message", function (channel, message) {
            if (JSON.parse(message).server)
                return;

            // log.info("[Redis] : Event has come through the channel.");
            // log.info("[Redis] :" + message);
        });
    },
    SetupAPIRoutes: function (server) {
        // Load up the Rest-API routes
        server.use(bodyParser.json());
        server.use(bodyParser.urlencoded({
            extended: true
        }));
        server.use(function (req, res, next) {

            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
            res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
            next();

        });


        // log.info("Setting up [Manual] moderation routes");
        var apiPath = path.join(__dirname, 'api');
        fs.readdirSync(apiPath).forEach(function (file) {
            server.use('/', require(apiPath + '/' + file)(ModerationModule));
        });
    },
    create: function (mongoMatchID) {
        if (!mongoMatchID)
            return new Error("Match ID cannot be empty");

        var oldMatch = ModerationModule.GetMatch(mongoMatchID);
        // safeguard for duplicates
        if (oldMatch) {
            log.info("Match with the same ID already exists. Hooking.");

            return oldMatch;
        } else {
            return ModerationModule.LoadMatchFromDB(mongoMatchID);
        }
    },
    ResetMatch: function (matchid, cbk) {
        scheduled_matches.findOne({
            _id: matchid
        }).exec(function (err, match) {
            match.stats = [];
            match.timeline = _.take(match.timeline);
            match.timeline[0].events = [];
            match.state = 0;
            match.time = 1;
            match.completed = false;
            match.away_score = 0;
            match.home_score = 0;
            match.save(function (err, result) {
                feedstatuses.find({ matchid: matchid }).remove().exec(function (err, opResult) {
                    cbk(opResult);
                });
            })
        });
    },
    ToggleMatchComplete: function (matchid, cbk) {
        scheduled_matches.findOne({
            _id: matchid
        }).exec(function (err, match) {
            match.completed = !match.completed;
            match.save(function (err, result) {
                cbk(result);
                // feedstatuses.find({ matchid: matchid }).remove().exec(function (err, opResult) {
                //     cbk(opResult);
                // });
            })
        });
    },
    ReleaseMatch: function (matchid, cbk) {
        MessagingTools.sendPushToUsers({}, { en: "A new match has been scheduled. Go play your preset cards now!" }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
        if (cbk)
            cbk("OK");
    },
    LoadMatchFromDB: function (matchid, cbk) {

        if (!this.mock) {
            scheduled_matches
                .findOne({
                    _id: matchid
                })
                .populate('home_team')
                .populate('away_team')
                .populate('competition')
                .exec(function (err, match) {
                    if (err)
                        return cbk(err);

                    if (!match) {
                        log.info(ModerationModule.count);
                        if (cbk)
                            return cbk("No match with this ID could be found in the database. There must be a match in the database already in order for it to be transfered to the Active matches", null);
                        else
                            return (null);
                    }

                    var foundMatch = _.find(ModerationModule.ModeratedMatches, { id: match.id });

                    if (foundMatch) {
                        // Terminate the active services on the match
                        foundMatch.Terminate(() => {
                            // Clear all timers that might be active
                            foundMatch.Timers.clear();
                            // remove match in case it already exists
                            _.remove(ModerationModule.ModeratedMatches, {
                                id: matchid
                            });
                            // Release to GC
                            foundMatch = null;

                            var hookedMatch = new match_module(match, RedisClientPub, RedisClientSub, shouldInitAutoFeed);

                            ModerationModule.ModeratedMatches.push(hookedMatch);
                            log.info("[Moderation] Found match with ID [" + hookedMatch.id + "]. Hooking on it.");

                            if (cbk)
                                return cbk(null, hookedMatch);
                            else
                                return hookedMatch;
                        });
                    }
                    else {
                        var hookedMatch = new match_module(match, RedisClientPub, RedisClientSub, shouldInitAutoFeed);

                        ModerationModule.ModeratedMatches.push(hookedMatch);
                        log.info("[Moderation] Found match with ID [" + hookedMatch.id + "]. Hooking on it.");

                        if (cbk)
                            return cbk(null, hookedMatch);
                        else
                            return hookedMatch;
                    }
                });
        } else {
            var match = new scheduled_matches(mockMatch);
            var hookedMatch = new match_module(match, RedisClientPub);
            ModerationModule.ModeratedMatches.push(hookedMatch);
            log.info("Found match with ID [" + hookedMatch.id + "]. Hooking on it.");

            return hookedMatch;
        }
    },
    GetMatch: function (matchID, cbk) {
        var match = _.find(ModerationModule.ModeratedMatches, { id: matchID });

        if (match) {
            if (cbk)
                cbk(null, match);
            else
                return match;
        } else {
            ModerationModule.LoadMatchFromDB(matchID, cbk);
        }
    }
    //    InjectEvent: function (evnt, res) {
    //        ModerationModule.GetMatch(evnt.id).AddEvent(evnt.data, res);
    //    },
};

ModerationModule.GetSchedule = function (cbk) {
    scheduled_matches
        .find({})
        .populate('home_team')
        .populate('away_team')
        .populate('competition')
        .exec(function (err, schedule) {
            if (err) {
                log.error(err);
                return cbk(err);
            }

            cbk(null, schedule);
        });
};

/**
 * Adds a new match to the schedule.
 */

var objectAssign = require('object-assign');

ModerationModule.AddScheduleMatch = function (match, cbk) {
    var matchTemplate = require('./mocks/empty-match');

    matchTemplate = objectAssign(matchTemplate, match);

    var newMatch = new scheduled_matches(matchTemplate);


    newMatch.save(function (er, saved) {

        if (er)
            return cbk(er);
        ModerationModule.LoadMatchFromDB(saved._id, function (err, match) {
            if (err)
                return cbk(err);

            cbk(null, match);
        });

    });
};



ModerationModule.ActivateMatch = function (id, state, cbk) {
    // Delete from database
    var match = ModerationModule.GetMatch(id);
    match.data.disabled = state;
    scheduled_matches.findOneAndUpdate({ _id: id }, { $set: { disabled: state } }, cbk);
};

/**
 * Adds a new match to the schedule.
 */
ModerationModule.UpdateScheduleMatch = function (match, cbk) {
    scheduled_matches.findOneAndUpdate({ _id: match._id }, match, { upsert: true }, cbk);
};

/**
 * Adds a new match to the schedule.
 */
ModerationModule.RemoveScheduleMatch = function (id, cbk) {
    // Delete from database
    ModerationModule.GetMatch(id).data.remove();
    // Remove from list in memory
    _.remove(ModerationModule.ModeratedMatches, { id: id });
    cbk();
};

/**
 * Matches cronjobs update info
 */
ModerationModule.updateMatchcronJobsInfo = function () {
    var itsNow = moment.utc();
    scheduled_matches
        .find({
            state: { $gt: -1 },
            completed: { $ne: true },
            $or: [{ 'moderation.0.type': 'rss-feed', 'moderation.0.active': true }, { 'moderation.1.type': 'rss-feed', 'moderation.1.active': true }]
        }, '_id moderation')
        .exec(function (err, matches) {

            _.each(matches, function (match) {
                var jobs = _.filter(scheduler.scheduledJobs, { name: match._id.toString() });
                var matchInMemory = _.find(ModerationModule.ModeratedMatches, { id: match._id.toString() }); 

                jobs.forEach(job => {
                    if (job && job.nextInvocation()) {
                        var duration = moment.duration(moment(job.nextInvocation()).diff(itsNow));
                        var durationAsHours = duration.asMinutes();
                        if (match.moderation[0].active) {
                            match.moderation[0].start = "in " + durationAsHours.toFixed(2) + " minutes";
                            match.moderation[0].scheduled = true;
                        }
                        if (match.moderation[1] && match.moderation[1].active) {
                            match.moderation[1].start = "in " + durationAsHours.toFixed(2) + " minutes";
                            match.moderation[1].scheduled = true;
                        }
                        log.info(`Match tick for ${matchInMemory ? matchInMemory.name + ' (' + match.id + ')' : match.id} will start in ${durationAsHours.toFixed(2)} minutes`);
                    } else {
                        // log.info("Match has not been picked up from scheduler");
                        match.moderation[0].start = "";
                        match.moderation[0].scheduled = false;
                        if (match.moderation[1]) {
                            match.moderation[1].start = "";
                            match.moderation[1].scheduled = false;
                        }
                    }
                    match.save(function (er, re) {
                        if (matchInMemory) {
                            matchInMemory.data.moderation[0].start = re.moderation[0].start;
                            matchInMemory.data.moderation[0].scheduled = re.moderation[0].scheduled;
                            // console.log("changed " +matchInMemory.data.moderation[0].start);                
                        }
                    });
                });

            });
        });
}


ModerationModule.matchStartWatcher = function () {
    try {
        var now = moment.utc();
        var fifteenMinsAfterNow = now.clone().add(16, 'm').toDate();
        scheduled_matches
            .find({
                state: { $gt: -1 },
                completed: { $ne: true },
                disabled: { $ne: true },
                start: { $lte: fifteenMinsAfterNow, $gt: now.toDate() },
            }, '_id start home_team away_team')
            .populate('_id home_team away_team', 'name')
            .exec(function (err, matches) {
                if (err) {
                    log.error(err);
                    return;
                }

                var matchesStartingInNext15 = _.filter(matches, function (m) {
                    var mStart = moment.utc(m.start);
                    return now.isAfter(mStart.clone().subtract(16, 'm')) && now.isBefore(mStart.clone().subtract(15, 'm')) ? true : false;
                });
                if (matchesStartingInNext15.length == 0)
                    return;
                var userGamecards = mongoose.models.userGamecards;

                async.waterfall([
                    function (cbk) {
                        return users.find({}, '_id', cbk);
                    },
                    function (allUsers, cbk) {

                        var allUserIds = _.map(allUsers, 'id');

                        if (matchesStartingInNext15.length == 0)
                            return async.setImmediate(() => { cbk(null, allUserIds); });
                        else {
                            // We have at least a match starting in the next 5 mins
                            // Irrespectively of which ones, find all userIds that did not play a card in the last 5, 10, 20 consecutive matches

                            var now = new Date();

                            return async.waterfall([
                                function (innerCbk) {

                                    // Find the last 5, 10 and 20 matches

                                    return scheduled_matches
                                        .find({
                                            completed: true,
                                            start: { $lt: now }
                                        }, '_id start')
                                        .sort({ start: -1 })
                                        .limit(20)
                                        .exec(innerCbk);
                                },
                                function (lastMatches, innerCbk) {
                                    var lastTwentyMatchesIds = _.map(lastMatches, 'id');
                                    var lastTenMatchesIds = _.take(lastTwentyMatchesIds, 10);
                                    var lastFiveMatchesIds = _.take(lastTwentyMatchesIds, 5);

                                    var tenDaysBefore = moment.utc(now).subtract(10, 'd').toDate();

                                    // and for these matches get all users having played a gamecard.

                                    async.parallel([
                                        function (innermostCbk) {
                                            userGamecards.find({
                                                matchid: { $in: lastTwentyMatchesIds }
                                            }, 'userid', innermostCbk);
                                        },
                                        function (innermostCbk) {
                                            userGamecards.find({
                                                matchid: { $in: lastTenMatchesIds }
                                            }, 'userid', innermostCbk);
                                        },
                                        function (innermostCbk) {
                                            userGamecards.find({
                                                matchid: { $in: lastFiveMatchesIds }
                                            }, 'userid', innermostCbk);
                                        },
                                        function (innermostCbk) {
                                            //userGamecards.find({
                                            //    creationTime: { gt: tenDaysBefore },
                                            //}, 'userid', innermostCbk);
                                            userGamecards.aggregate([
                                                {
                                                    $match: {
                                                        creationTime: { $gt: tenDaysBefore }
                                                    }
                                                },
                                                {
                                                    $group: {
                                                        _id: '$userid'
                                                    }
                                                }
                                            ], innermostCbk);
                                        },
                                        function (innermostCbk) {
                                            mongoose.models.scores.aggregate([
                                                {
                                                    $match: {
                                                        lastActive: { $gt: tenDaysBefore }
                                                    }
                                                },
                                                {
                                                    $group: {
                                                        _id: '$user_id',
                                                        totalScore: { $max: '$score' }
                                                    }
                                                },
                                                {
                                                    $match: {
                                                        $or: [{ totalScore: 0 }, { totalScore: null }]
                                                    }
                                                }
                                            ], innermostCbk);
                                        },
                                        function (innermostCbk) {
                                            mongoose.models.gameserversettings.findOne({}, innermostCbk);
                                        }
                                    ], function (err, gamecardResults) {
                                        if (err) {
                                            log.error('Failed to send notifications 15\' prior of match start: ' + err);
                                            return innerCbk(null, [], []);
                                        }

                                        // Then subtract their ids from allUserIds and get those that have not played a card in these consecutive matches
                                        // Then send them a message

                                        var lastTwentyMatchesUsers = gamecardResults[0];
                                        var lastTenMatchesUsers = gamecardResults[1];
                                        var lastFiveMatchesUsers = gamecardResults[2];
                                        var lastTenDaysCardUsers = gamecardResults[3];
                                        var lastTenDaysMatchVisitors = gamecardResults[4];
                                        var pushNotifications = gamecardResults[5].pushNotifications;

                                        var userIdsNotHavingPlayedLastTwentyMatches = [];
                                        var userIdsNotHavingPlayedLastTenMatches = [];
                                        var userIdsNotHavingPlayedLastFiveMatches = [];
                                        var userIdsNotHavingPlayedLastTenDays = [];

                                        if (lastTwentyMatchesUsers && lastTwentyMatchesUsers.length > 0) {
                                            var lastTwentyMatchesUserIds = _.uniq(_.map(lastTwentyMatchesUsers, 'userid'));
                                            userIdsNotHavingPlayedLastTwentyMatches = _.difference(allUserIds, lastTwentyMatchesUserIds);
                                        }
                                        if (lastTenMatchesUsers && lastTenMatchesUsers.length > 0) {
                                            var lastTenMatchesUserIds = _.uniq(_.map(lastTenMatchesUsers, 'userid'));
                                            userIdsNotHavingPlayedLastTenMatches = _.difference(allUserIds, lastTenMatchesUserIds);
                                        }
                                        if (lastFiveMatchesUsers && lastFiveMatchesUsers.length > 0) {
                                            var lastFiveMatchesUserIds = _.uniq(_.map(lastFiveMatchesUsers, 'userid'));
                                            userIdsNotHavingPlayedLastFiveMatches = _.difference(allUserIds, lastFiveMatchesUserIds);
                                        }
                                        if (lastTenDaysMatchVisitors && lastTenDaysMatchVisitors.length > 0) {
                                            userIdsNotHavingPlayedLastTenDays = _.map(lastTenDaysMatchVisitors, '_id');
                                        }
                                        if (lastTenDaysCardUsers && lastTenDaysCardUsers.length > 0) {
                                            var lastTenDaysUserIds = _.uniq(_.map(lastTenDaysCardUsers, 'userid'));
                                            userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, lastTenDaysUserIds);
                                        }

                                        userIdsNotHavingPlayedLastTenMatches = _.difference(userIdsNotHavingPlayedLastTenMatches, userIdsNotHavingPlayedLastTwentyMatches);
                                        userIdsNotHavingPlayedLastFiveMatches = _.difference(userIdsNotHavingPlayedLastFiveMatches, userIdsNotHavingPlayedLastTwentyMatches);
                                        userIdsNotHavingPlayedLastFiveMatches = _.difference(userIdsNotHavingPlayedLastFiveMatches, userIdsNotHavingPlayedLastTenMatches);
                                        userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastTwentyMatches);
                                        userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastTenMatches);
                                        userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastFiveMatches);

                                        var matchId = matchesStartingInNext15[0].id;

                                        var matchName = { en: '', ar: '' };

                                        if (matchesStartingInNext15[0].home_team && matchesStartingInNext15[0].home_team.name && matchesStartingInNext15[0].home_team.name.en)
                                            matchName.en += matchesStartingInNext15[0].home_team.name.en;
                                        else matchName.en += 'Home team';
                                        matchName.en += ' - ';
                                        if (matchesStartingInNext15[0].away_team && matchesStartingInNext15[0].away_team.name && matchesStartingInNext15[0].away_team.name.en)
                                            matchName.en += matchesStartingInNext15[0].away_team.name.en;
                                        else matchName.en += 'Away team';

                                        if (matchesStartingInNext15[0].home_team && matchesStartingInNext15[0].home_team.name && matchesStartingInNext15[0].home_team.name.ar)
                                            matchName.ar += matchesStartingInNext15[0].home_team.name.ar;
                                        else matchName.ar += 'Home team';
                                        matchName.ar += ' - ';
                                        if (matchesStartingInNext15[0].away_team && matchesStartingInNext15[0].away_team.name && matchesStartingInNext15[0].away_team.name.ar)
                                            matchName.ar += matchesStartingInNext15[0].away_team.name.ar;
                                        else matchName.ar += 'Away team';

                                        if (pushNotifications && pushNotifications.R4 && userIdsNotHavingPlayedLastTwentyMatches.length > 0) {
                                            log.info(`Sending reactivation R4 notification to users: ${userIdsNotHavingPlayedLastTwentyMatches}`);
                                            var msg = {
                                                en: `${matchName.en} kicks off in 15'! Start playing your cards NOW & make it on the leaderboard!`,
                                                ar: `مباراة ${matchName.ar} ستبدأ في 15دقيقة!
ابدأ بالعب بطاقاتك الآن وقد تكون المتصدر على قائمة المتسابقين!`
                                            };
                                            MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTwentyMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "all");
                                        }
                                        if (pushNotifications && pushNotifications.R3 && userIdsNotHavingPlayedLastTenMatches.length > 0) {
                                            log.info(`Sending reactivation R3 notification to users: ${userIdsNotHavingPlayedLastTenMatches}`);
                                            var msg = { 
												en: `Your name is missing from the leaderboard! Find a match you like and play your cards right 👍` ,
												ar: `اسمك غير موجود على قائمة المتصدرين! اختر مباراة تعجبك والعب بطاقاتك!`
											};
                                            MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTenMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "all");
                                        }
                                        if (pushNotifications && pushNotifications.R2 && userIdsNotHavingPlayedLastFiveMatches.length > 0) {
                                            log.info(`Sending reactivation R2 notification to users: ${userIdsNotHavingPlayedLastFiveMatches}`);
                                            var msg = { 
												en: `Where have you been champ? Join the ${matchName.en} and prove you know your stuff!` ,
												ar: `أين كنت يا بطل؟ شارك بمباراة ${matchName.ar} لتثبت أنك خبير باللعبة!`
											};
                                            MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastFiveMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "all");
                                        }
                                        if (pushNotifications && pushNotifications.R1 && userIdsNotHavingPlayedLastTenDays.length > 0) {
                                            log.info(`Sending reactivation R1 notification to users: ${userIdsNotHavingPlayedLastTenDays}`);
                                            var msg = { 
												en: `️⚽ ${matchName.en} is starting in 15'! Can you to rank in the top-10? Join the game and see!` ,
												ar: `مباراة  ${matchName.ar} ستبدأ في 15دقيقة!
هل ستكون مع أفضل 10؟ شارك باللعب لتعرف!`
											};
                                            MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTenDays, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "all");
                                        }

                                        return innerCbk(null);
                                    });
                                }
                            ], (err) => {
                                if (err)
                                    log.error(err.stack);

                                return cbk(null, allUserIds);
                            });
                        }
                    }//,
                    //function (allUserIds, cbk) {
                    //    if (matchesStartingInNext30.length == 0)
                    //        return async.setImmediate(() => { cbk(null, allUserIds); });
                    //    else {
                    //        // Find all user ids having logged in after X = 30 days
                    //        var lastLoginThreshold = moment.utc().subtract(30, 'd').toDate();
                    //        users.find({ lastLoginAt: { $gt: lastLoginThreshold } }, '_id', function (userErr, frequentUsers) {
                    //            if (userErr) {
                    //                log.error(userErr.stack);
                    //                return cbk(null);
                    //            }

                    //            if (frequentUsers && frequentUsers.length > 0) {
                    //                var frequentUserIds = _.map(frequentUsers, 'id');
                    //                // Now invert these users and get all users NOT having logged in the last X days
                    //                var infrequentUserIds = _.difference(allUserIds, frequentUserIds);
                    //                if (infrequentUserIds.length > 0) {
                    //                    var msgToUsersNotHavingLoggedIn = `We miss you! Play your cards right and climb the leaderboard`;
                    //                    MessagingTools.sendPushToUsers(infrequentUserIds, { en: msgToUsersNotHavingLoggedIn }, { "type": "view", "data": { "view": "match", "viewdata": matchesStartingInNext30[0].id } }, "all");
                    //                }
                    //                else
                    //                    return cbk(null);
                    //            }
                    //            else
                    //                return cbk(null);
                    //        });
                    //    }
                    //}
                ]);
            });
    }
    catch (err) {
        log.error(err);
    }
}

function initModule(done) {
    if (!this.mock) {
        /* We load all scheduled/active matches from DB on server initialization */
        scheduled_matches
            .find({
                state: { $gt: -1 },
                completed: { $ne: true }
            })
            .populate('home_team')
            .populate('away_team')
            .populate('competition')
            .exec(function (err, matches) {
                if (err)
                    return ModerationModule.callback ? ModerationModule.callback(err) : log.error(err);
                if (matches) {

                    // Adding wait index of 1sec in order to bypass the limitation of STATS that prevents overload of calls
                    var waitIndex = 0;

                    /*For each match found we hook platform specific functionality and add it to the main list*/
                    _.forEach(matches, function (match) {
                        setTimeout(function () {
                            var hookedMatch = new match_module(match, RedisClientPub, RedisClientSub, shouldInitAutoFeed);
                            ModerationModule.ModeratedMatches.push(hookedMatch);
                            log.info("[Moderation] Found match with ID [" + hookedMatch.id + "]. Creating match instance");
                        }, 2000 * waitIndex);
                        waitIndex++;
                    });
                } else {
                    log.warn("No scheduled matches could be found in the database.");
                }

                // Callback we are done for whomever needs it
                if (ModerationModule.callback != null)
                    ModerationModule.callback();

            });


    } else {


        var match = new scheduled_matches(mockMatch);

        var hookedMatch = new match_module(match, RedisClientPub, RedisClientSub);
        this.ModeratedMatches.push(hookedMatch);
        log.info("Mock match created with ID [" + hookedMatch.id + "].");

        // Callback we are done for whomever needs it
        if (ModerationModule.callback != null)
            ModerationModule.callback();
    }

    // Here we will create a job in interval where we check for feed matches, if theit timers are set and update accordingly the time until initiation
    ModerationModule.cronJobsUpdateInterval = setInterval(ModerationModule.updateMatchcronJobsInfo, 60000);

    // Here we create a job executed in 5min intervals, that will send the notifications: 
    // The match is about to start 15 mins before the start, and 2 reactivation motivations 5 mins before the start
    ModerationModule.matchStartNotificationInterval = setInterval(ModerationModule.matchStartWatcher, 60 * 1000);
};

// A Mock Match object in case we need it for testing
var mockMatch = require('./mocks/mock-match');


module.exports = ModerationModule;
