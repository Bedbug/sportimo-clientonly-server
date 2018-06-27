/*
 * ***********************************************************************
 * Gamecards Module
 *
 * @description :: The Gamecards Module is repsonsible for handling
 * cards in the game. It is repsonsible for holding the list of active
 * cards and handle their destruction or winnings.
 * 
 * At its core there is the gamecards class that handles 
 * all card types, saving to the database, managing their states through the lifetime of each one, checking for winning conditions, etc.
 * 
 * It also creates API routes that instruct the module to ADD cards
 * from clients. Once the call has been received and a new gamecard
 * has been created the class handles everything else (activation /
 * destruction / db connections)
 * 
 * **********************************************************************
 */

"use strict"

var path = require('path'),
    fs = require('fs'),
    express = require('express'),
    moment = require('moment'),
    async = require('async'),
    winston = require('winston'),
    _ = require('lodash'),
    bodyParser = require('body-parser'),
    mongoose = require('mongoose'),
    achievements = require('../bedbugAchievements');

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

/* Module to handle user feedback */
var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');

/* Mongoose model
Used to access wildcards store in database*/
var UserGamecard;


/*Main module*/
var gamecards = {};

/*The database connection*/
var db = null;

/*The redis pub/sub chanel for publishing*/
var redisPublish = null;
var redisSubscribe = null;

/*The tick handler*/
var tickSchedule = null;


/************************************
 * Perform initialization functions */
gamecards.connect = function (dbconnection, redisPublishChannel, redisSubscribeChannel) {
    if (!db) {
        db = dbconnection;
        UserGamecard = db.models.userGamecards;
    }

    //if (!redisPublish)
    // Enforce re-registering the redisPublish object, to ensure proper initialization
    redisPublish = redisPublishChannel;

    if (!redisSubscribe) {
        redisSubscribe = redisSubscribeChannel;

        if (redisSubscribe) {
            redisSubscribe.on("error", function (err) {
                log.error("{''Error'': ''" + err + "''}");
            });

            redisSubscribe.on("subscribe", function (channel, count) {
                log.info("[Gamecards] Subscribed to Sportimo Events PUB/SUB channel");
            });

            redisSubscribe.on("unsubscribe", function (channel, count) {
                log.info("[Gamecards] Unsubscribed from Sportimo Events PUB/SUB channel");
            });

            redisSubscribe.on("end", function () {
                log.error("[Gamecards] Connection ended");
            });

            redisSubscribe.subscribe("socketServers");

            redisSubscribe.on("message", function (channel, message) {
                let msg = JSON.parse(message);
                if (msg.payload && msg.payload.type && (msg.payload.type == 'socket_stats' || msg.payload.type == 'Stats_changed')) {
                    // log.info("[Redis] : Event has come through the channel.");
                    // log.info("[Redis] :" + JSON.stringify(msg.payload));

                }
            });
        }
    }
};


/*
gamecards.init = function (dbconnection, redisPublishChannel, redisSubscribeChannel, match) {
    gamecards.connect(dbconnection, redisPublishChannel, redisSubscribeChannel);

    if (db == null || UserGamecard == null) {
        log.error("No active database connection found. Aborting.");
        return new Error('No active database connection found. Aborting.');
    }

    if (!tickSchedule)
        tickSchedule = setInterval(gamecards.Tick, 3000);

    // Check if match has gamecardDefinitions written in mongo from the gamecardTemplates and if their appearanceConditions are met, if not, create them.
    async.waterfall([
        function (callback) {
            db.models.gamecardTemplates.find({ isActive: true }, function (error, templates) {
                if (error)
                    return callback(error);
                callback(null, templates);
            });
        },
        function (templates, callback) {
            db.models.gamecardDefinitions.find({ matchid: match._id.toString() }, function (error, definitions) {

                if (error)
                    return callback(error);

                if (templates == null || templates.length == 0)
                    return callback(null);
                //callback(null, definitions);
                let usedTemplateIds = [];
                _.forEach(definitions, function (definition) {
                    if (_.indexOf(usedTemplateIds, definition.gamecardTemplateId))
                        usedTemplateIds.push(definition.gamecardTemplateId);
                });

                // Now instantiate all not found templates into new gamecardDefinitions
                _.forEach(templates, function (template) {
                    if (_.indexOf(usedTemplateIds, template.id) == -1) {
                        gamecards.createDefinitionFromTemplate(template, match);
                    }
                });
            });
        }
    ], function (error, result) {
        if (error)
            log.error('Error while initializing gamecards module: ' + error.message);
    });


};
*/


/************************************
 *          Gamecards API           *
 ***********************************/

gamecards.testAwardsHandling = function (callback) {
    gamecards.HandleUserCardRewards('576d77fb8c410cfa009130d8', '5749c6afcbfeeaf500d4aba9', 'Instant', null, 0, 150, callback);
}

gamecards.getTemplates = function (callback) {
    return db.models.gamecardTemplates.find({}, callback);
};

gamecards.createMatchDefinitions = function (matchid, callback) {
    // Check if match has gamecardDefinitions written in mongo from the gamecardTemplates and if their appearanceConditions are met, if not, create them.
    async.waterfall([
        function (callback) {
            var q = db.models.scheduled_matches.findById(matchid);
            q.populate('home_team away_team', 'name');
            q.exec(function (error, match) {
                if (error)
                    return callback(error);

                callback(null, match);
            });
        },
        function (match, callback) {
            db.models.gamecardTemplates.find({}, function (error, templates) {
                if (error)
                    return callback(error);
                callback(null, templates, match);
            });
        },
        function (templates, match, callback) {
            db.models.gamecardDefinitions.find({ matchid: match._id }, function (error, definitions) {

                if (error)
                    return callback(error);

                if (templates == null || templates.length == 0)
                    return callback(null);
                //callback(null, definitions);
                let usedTemplateIds = [];
                _.forEach(definitions, function (definition) {
                    if (_.indexOf(usedTemplateIds, definition.gamecardTemplateId))
                        usedTemplateIds.push(definition.gamecardTemplateId);
                });

                // Now instantiate all not found templates into new gamecardDefinitions
                _.forEach(templates, function (template) {
                    if (_.indexOf(usedTemplateIds, template.id) == -1) {
                        gamecards.createDefinitionFromTemplate(template, match);
                    }
                });

                callback(null, 'done')
            });
        }
    ], function (error, result) {
        if (error)
            log.error('Error while initializing gamecards module: ' + error.message);

        return callback(error, result);
    });

    // callback(null,"Done");
};




gamecards.upsertTemplate = function (template, callback) {
    let processedTemplate = null;
    try {
        if (template._id) {
            db.models.gamecardTemplates.findByIdAndUpdate(template._id, template, { new: true }, function (err, result) {
                if (err)
                    return callback(err);

                callback(null, result);
            });


        }
        else {
            processedTemplate = new db.models.gamecardTemplates(template);
            processedTemplate.save(function (error, done) {
                if (error)
                    return callback(error);

                callback(null, done);
            });
        }



    }
    catch (error) {
        return callback(error);
    }

};

gamecards.removeTemplate = function (templateId, callback) {
    db.models.gamecardTemplates.findByIdAndRemove(templateId, function (err, result) {
        if (!err) {
            return callback(err);
        } else {
            return callback(null, result);
        }
    })
}

gamecards.getDefinitions = function (state, callback) {
    if (!state || typeof (state) == 'function') {
        callback = state;
        state = 1; // get active ones
    }

    db.models.gamecardDefinitions.find({ state: state, isVisible: true, isActive: true }, function (error, data) {
        if (error)
            return callback(error);
        callback(null, data);
    });
};

// Added a new method because the old one returned only active ones and there was no sign of match id filtering
gamecards.getMatchDefinitions = function (mid, callback) {

    db.models.gamecardDefinitions.find({ matchid: mid }, function (error, data) {
        if (error)
            return callback(error);
        callback(null, data);
    });
};

gamecards.deleteMatchDefinition = function (gamecardId, callback) {
    db.models.gamecardDefinitions.findByIdAndRemove(gamecardId, function (error, result) {
        if (error)
            return callback(error);

        return callback(null, result);
    });
};

// Aris: Added a new method to post new match definitions in order to proceed
gamecards.addMatchDefinition = function (gamecard, callback) {

    var newDef = new db.models.gamecardDefinitions({
        matchid: gamecard.matchid,
        text: gamecard.text,
        title: gamecard.title,
        image: gamecard.image,
        primaryStatistic: gamecard.primaryStatistic,
        activationTime: gamecard.activationTime,
        duration: gamecard.duration,
        appearConditions: gamecard.appearConditions,
        winConditions: gamecard.winConditions,
        terminationConditions: gamecard.terminationConditions,
        options: gamecard.options,
        startPoints: gamecard.startPoints,
        endPoints: gamecard.endPoints,
        pointsPerMinute: gamecard.pointsPerMinute,
        maxUserInstances: gamecard.maxUserInstances,
        isVisible: gamecard.isVisible || false,
        isActive: gamecard.isActive || false,
        cardType: gamecard.cardType,
        status: 0
    });

    newDef.save(function (error, done) {
        if (error)
            return callback(error);
        callback(null, newDef);

        redisPublish.publish("socketServers", JSON.stringify({
            sockets: true,
            payload: {
                type: "Message",
                room: gamecard.matchid,
                data: {
                    icon: "gamecard",
                    message: { "en": "A new game card has been created for your enjoyment." }
                }
            }
        }));
    });
}

// Aris: Added a new method to update match definitions in order to proceed
gamecards.updateMatchDefinition = function (gamecard, callback) {
    if (gamecard._id) {
        db.models.gamecardDefinitions.findByIdAndUpdate(gamecard._id, gamecard, function (err, result) {
            if (!err)
                return callback(null, result);
            else
                return callback(err);
        })
    } else {
        return callback('bad request: The body does not contain a gamecard ID.');
    }
}


gamecards.upsertDefinition = function (gamecard, callback) {
    let processedDefinition = null;
    try {
        if (gamecards.validateDefinition(gamecard) == false)
            return callback(new Error('bad request: validation error in request body'));

        if (gamecard.id) {
            processedDefinition = db.models.gamecardDefinitions.findById(gamecard.id);
            processedDefinition.title = gamecard.title;
            processedDefinition.image = gamecard.image;
            processedDefinition.text = gamecard.text;
            processedDefinition.primaryStatistic = gamecard.primaryStatistic;
            processedDefinition.activationTime = gamecard.activationTime;
            processedDefinition.duration = gamecard.duration;
            processedDefinition.appearConditions = gamecard.appearConditions;
            processedDefinition.winConditions = gamecard.winConditions;
            processedDefinition.terminationConditions = gamecard.terminationConditions;
            processedDefinition.options = gamecard.options;
            processedDefinition.startPoints = gamecard.startPoints;
            processedDefinition.endPoints = gamecard.endPoints;
            processedDefinition.pointsPerMinute = gamecard.pointsPerMinute;
            processedDefinition.maxUserInstances = gamecard.maxUserInstances;
            processedDefinition.isVisible = gamecard.isVisible || false;
            processedDefinition.isActive = gamecard.isActive || false;
            processedDefinition.cardType = gamecard.cardType;
        }
        else {
            let existingDefinition = db.models.gamecardDefinitions.findById(gamecard._id);
            if (existingDefinition.state > 0)
                return callback(new Error('bad request: cannot modify a gamecard definition that is not in the pending activation state'));

            processedDefinition = new db.models.gamecardDefinitions({
                matchid: gamecard.matchid,
                text: gamecard.text,
                title: gamecard.title,
                image: gamecard.image,
                primaryStatistic: gamecard.primaryStatistic,
                activationTime: gamecard.activationTime,
                duration: gamecard.duration,
                appearConditions: gamecard.appearConditions,
                winConditions: gamecard.winConditions,
                terminationConditions: gamecard.terminationConditions,
                options: gamecard.options,
                startPoints: gamecard.startPoints,
                endPoints: gamecard.endPoints,
                pointsPerMinute: gamecard.pointsPerMinute,
                maxUserInstances: gamecard.maxUserInstances,
                isVisible: gamecard.isVisible || false,
                isActive: gamecard.isActive || false,
                cardType: gamecard.cardType,
                status: 0
            });
        }
        processedDefinition.save(function (error, done) {
            if (error)
                return callback(error);
            callback(null, done);
        });
    }
    catch (error) {
        return callback(error);
    }
};


// Validate the incoming gamecard definition
gamecards.validateDefinition = function (gamecardDefinition) {
    let itsNow = moment.utc();

    if (gamecardDefinition.creationTime && moment.utc(gamecardDefinition.creationTime) >= itsNow)
        return false;
    if (gamecardDefinition.activationTime && moment.utc(gamecardDefinition.activationTime) <= itsNow)
        return false;
    if (gamecardDefinition.terminationTime)
        return false;
    if (gamecardDefinition.wonTime)
        return false;

    return true;
};


gamecards.createDefinitionFromTemplate = function (template, match) {

    // Disabled. Client decides proper substitution of team name. 
    let replaceTeamNameLocale = function (teamname, prompt, placeholder) {
        var promptKeys = _.keys(prompt);
        var newPrompt = {};
        _.forEach(promptKeys, function (key) {
            newPrompt[key] = prompt[key];
            if (teamname[key]) {
                newPrompt[key] = _.replace(newPrompt[key], placeholder, teamname[key]);
            }
        });
        return newPrompt;
    };


    let creationTime = moment.utc();
    let activationTime = template.activationLatency ? moment.utc(creationTime).add(template.activationLatency, 'ms') : moment.utc(creationTime);
    let terminationTime = template.duration ? moment.utc(activationTime).add(template.duration, 'ms') : null;
    if (template.cardType == 'Instant' && !terminationTime)
        terminationTime = activationTime.add(300, 'seconds'); // set default termination time of 5 mins if for some reason the template lacks of a duration


    let newDefinition = new db.models.gamecardDefinitions({
        matchid: match._id.toString(),
        gamecardTemplateId: template.id,
        creationTime: creationTime.toDate(),
        text: template.text,
        title: template.title,
        image: template.image,
        primaryStatistic: template.primaryStatistic,
        guruAction: template.guruAction,
        activationTime: activationTime.toDate(),
        terminationTime: terminationTime ? terminationTime.toDate() : null,
        duration: template.duration,
        activationLatency: template.activationLatency,
        specialActivationLatency: template.specialActivationLatency || null,
        appearConditions: template.appearConditions,
        winConditions: template.winConditions,
        terminationConditions: template.terminationConditions,
        options: template.options,
        startPoints: template.startPoints,
        endPoints: template.endPoints,
        pointsPerMinute: template.pointsPerMinute,
        maxUserInstances: template.maxUserInstances,
        isVisible: template.isVisible,
        isActive: template.isActive,
        cardType: template.cardType,
        status: 1
    });

    if (newDefinition.specialActivationLatency)
        newDefinition.markModified('specialActivationLatency');

    // ToDo: replace text placeholders [[home_team_name]], [[away_team_name]], [[player_name]]
    if (newDefinition.winConditions) {
        _.forEach(newDefinition.winConditions, function (condition) {
            if (condition.teamid) {
                if (condition.teamid.indexOf("[[home_team_id]]") > -1) {
                    condition.id = match.home_team.id;
                    condition.teamid = _.replace(condition.teamid, "[[home_team_id]]", match.home_team.id);
                } else if (condition.teamid.indexOf("[[away_team_id]]") > -1) {
                    condition.id = match.away_team.id;
                    condition.teamid = _.replace(condition.teamid, "[[away_team_id]]", match.away_team.id);
                }
                else {
                    condition.id = match._id;
                    condition.teamid = null;
                }
            }
            if (condition.comparativeTeamid) {
                if (condition.comparativeTeamid.indexOf("[[home_team_id]]") > -1) {
                    condition.comparativeTeamid = _.replace(condition.comparativeTeamid, "[[home_team_id]]", match.home_team.id);
                } else if (condition.comparativeTeamid.indexOf("[[away_team_id]]") > -1) {
                    condition.comparativeTeamid = _.replace(condition.comparativeTeamid, "[[away_team_id]]", match.away_team.id);
                }
                else {
                    condition.comparativeTeamid = null;
                }
            }
        });
        newDefinition.markModified('winConditions');
    }

    // Added placeholder replacement based on Ari's conditions logic
    if (newDefinition.appearConditions) {
        _.forEach(newDefinition.appearConditions, function (condition) {
            if (!condition.id) return;
            if (condition.id.indexOf("[[home_team_id]]") > -1)
                condition.id = match.home_team.id;
            if (condition.id.indexOf("[[away_team_id]]") > -1)
                condition.id = match.away_team.id;
            if (condition.id.indexOf("[[match_id]]") > -1)
                condition.id = match._id;
            //   console.log(condition.id);
        });
    }

    if (newDefinition.terminationConditions) {
        _.forEach(newDefinition.terminationConditions, function (condition) {
            if (condition.teamid) {
                if (condition.teamid.indexOf("[[home_team_id]]") > -1) {
                    condition.id = match.home_team.id;
                    condition.teamid = _.replace(condition.teamid, "[[home_team_id]]", match.home_team.id);
                } else if (condition.teamid.indexOf("[[away_team_id]]") > -1) {
                    condition.id = match.away_team.id;
                    condition.teamid = _.replace(condition.teamid, "[[away_team_id]]", match.away_team.id);
                }
            }
            else {
                condition.id = match._id;
                condition.teamid = null;
            }
        });
        newDefinition.markModified('terminationConditions');
    }
    if (newDefinition.options) {
        _.forEach(newDefinition.options, function (option) {
            // if (option.text) {
            //     option.text = replaceTeamNameLocale(match.home_team.name, option.text, "[[home_team_name]]");
            //     option.text = replaceTeamNameLocale(match.away_team.name, option.text, "[[away_team_name]]");
            //     option.markModified('text');
            // }

            if (option.winConditions) {
                _.forEach(option.winConditions, function (condition) {
                    if (condition.teamid) {
                        if (condition.teamid.indexOf("[[home_team_id]]") > -1) {
                            condition.id = match.home_team.id;
                            condition.teamid = _.replace(condition.teamid, "[[home_team_id]]", match.home_team.id);
                        } else if (condition.teamid.indexOf("[[away_team_id]]") > -1) {
                            condition.id = match.away_team.id;
                            condition.teamid = _.replace(condition.teamid, "[[away_team_id]]", match.away_team.id);
                        }
                    }
                    else {
                        condition.id = match._id;
                        condition.teamid = null;
                    }
                    if (condition.comparativeTeamid) {
                        if (condition.comparativeTeamid.indexOf("[[home_team_id]]") > -1) {
                            condition.comparativeTeamid = _.replace(condition.comparativeTeamid, "[[home_team_id]]", match.home_team.id);
                        } else if (condition.comparativeTeamid.indexOf("[[away_team_id]]") > -1) {
                            condition.comparativeTeamid = _.replace(condition.comparativeTeamid, "[[away_team_id]]", match.away_team.id);
                        }
                        else {
                            condition.comparativeTeamid = null;
                        }
                    }
                });
            }
            if (option.terminationConditions) {
                _.forEach(option.terminationConditions, function (condition) {
                    if (condition.teamid) {
                        if (condition.teamid.indexOf("[[home_team_id]]") > -1) {
                            condition.id = match.home_team.id;
                            condition.teamid = _.replace(condition.teamid, "[[home_team_id]]", match.home_team.id);
                        } else if (condition.teamid.indexOf("[[away_team_id]]") > -1) {
                            condition.id = match.away_team.id;
                            condition.teamid = _.replace(condition.teamid, "[[away_team_id]]", match.away_team.id);
                        }
                    }
                    else {
                        condition.id = match._id;
                        condition.teamid = null;
                    }
                });
            }
        });
    }

    newDefinition.markModified('options');
    newDefinition.save(function (err) {
        if (err) return console.log("Error:" + err);
        console.log(newDefinition.creationTime + " | " + newDefinition.title.en + " Match Card Created");
    });
};


// Select all gamecardDefinitions, and filter for those that have remainingUserInstances in their userGamecards counterparts null or > 0
gamecards.getUserInstances = function (matchId, userId, cbk) {
    async.parallel([
        (callback) => {
            return db.models.scheduled_matches
                .findById(matchId, {
                    settings: 1,
                    state: 1,
                    home_team: 1,
                    away_team: 1,
                    home_score: 1,
                    away_score: 1,
                    timeline: { $slice: -1 }
                })
                //.populate("home_team away_team", "name")
                .exec(callback);
        },
        (callback) => {
            return db.models.gamecardDefinitions.find({ matchid: matchId, isVisible: true, isActive: true, status: { $ne: 2 } }, callback);
        },
        (callback) => {
            return db.models.userGamecards.find({ matchid: matchId, userid: userId }, 'cardType status gamecardDefinitionId', callback);
        }
    ], (asyncErr, asyncResult) => {
        if (asyncErr) {
            log.error(`Error while getting user ${userid} gamecard definitions: ${asyncErr.stack}`);
            return cbk(asyncErr);
        }

        const match = asyncResult[0];

        if (!match)
            return cbk(new Error("Match id " + matchId + " was not found."));

        const settings = match.settings;
        const matchState = match.state;
        const definitions = asyncResult[1];
        const userCards = asyncResult[2];


        let definitionsLookup = {};
        _.forEach(definitions, function (definition) {
            if (!definitionsLookup[definition.id])
                definitionsLookup[definition.id] = definition;
        });

        let instantCount = 0;
        let presetInstantCount = 0;
        let overallCount = 0;
        let totalCount = userCards.length;
        if (settings && settings.gameCards && settings.gameCards.totalcards && settings.gameCards.totalcards <= totalCount)
            return callback(null, []);

        _.forEach(userCards, function (usercard) {
            if (usercard.cardType == 'Overall')
                overallCount++;
            else if (usercard.cardType == 'Instant')
                instantCount++;
            else if (usercard.cardType == 'PresetInstant')
                presetInstantCount++;
        });

        let instancesPerDefinition = _.groupBy(userCards, 'gamecardDefinitionId');
        let definitionIdsToDrop = [];
        _.forEach(instancesPerDefinition, function (instancePerDefinition) {
            if (instancePerDefinition.length > 0) {
                let key = instancePerDefinition[0].gamecardDefinitionId;
                // From the definitions, remove those that have as usercards equal or more instances than maxUserInstances
                if (definitionsLookup[key] && definitionsLookup[key].maxUserInstances && instancePerDefinition.length >= definitionsLookup[key].maxUserInstances)
                    definitionIdsToDrop.push(key);
                // From the definitions, remove those where an existing user gamecacrd is currently pending or active and is pending for resolution, for all card types except PresetInstant.
                _.forEach(instancePerDefinition, function (userGamecard) {
                    if (userGamecard.status != 2 && userGamecard.cardType != 'PresetInstant' && _.indexOf(definitionIdsToDrop, key) == -1)
                        definitionIdsToDrop.push(key);
                });
                //log.info(instancePerDefinition.length);
            }
        });

        if (settings && settings.gameCards && settings.gameCards.overall && settings.gameCards.overall <= overallCount) {
            _.forEach(definitions, function (definition) {
                if (definition.cardType == 'Overall' && _.indexOf(definitionIdsToDrop, definition.id) == -1)
                    definitionIdsToDrop.push(definition.id);
            });
        }
        let itsNow = moment.utc();
        // If the match has not yet started, drop all Instant card definitions
        if (matchState == 0 || (settings && settings.gameCards && settings.gameCards.instant && settings.gameCards.instant <= instantCount)) {
            _.forEach(definitions, function (definition) {
                if (definition.cardType == 'Instant' && _.indexOf(definitionIdsToDrop, definition.id) == -1)
                    definitionIdsToDrop.push(definition.id);
            });
        }
        // If the match has started already, drop all PresetInstant card definitions
        if (matchState > 0 || (settings && settings.gameCards && settings.gameCards.presetInstant && settings.gameCards.presetInstant <= presetInstantCount)) {
            _.forEach(definitions, function (definition) {
                if (definition.cardType == 'PresetInstant' && _.indexOf(definitionIdsToDrop, definition.id) == -1)
                    definitionIdsToDrop.push(definition.id);
            });
        }
        // If the match has started already and the last event in the timeline is a Penalty, drop all Goal definitions
        if (_.indexOf([1, 3, 5, 7], matchState) > -1 && match.timeline[0] && match.timeline[0].events.length > 0) {
            const lastEvent = _.last(match.timeline[0].events);
            if (lastEvent && lastEvent.type == 'Penalty' && lastEvent.created && itsNow.isBefore(moment.utc(lastEvent.created).add(50, 's'))) {
                _.forEach(definitions, function (definition) {
                    if (definition.cardType == 'Instant' && definition.primaryStatistic == 'Goal' && _.indexOf(definitionIdsToDrop, definition.id) == -1)
                        definitionIdsToDrop.push(definition.id);
                });
            }
        }

        let userGamecardDefinitions = null;
        userGamecardDefinitions = _.remove(definitions, function (definition) {
            return _.indexOf(definitionIdsToDrop, definition.id) == -1;
        });

        return cbk(null, userGamecardDefinitions);
    });
};

/* 
* Each time a gamecard is played by a user, it has to be validated before being added to the userWildcards collection in Mongo
*
* Validation Rules:
* ----------------
* the userGamecard has to include a matchId to a scheduled_match instance
* this scheduled_match instance should be existent and active
* the userGamecard has to include a reference to a gamecard definition (wildcardDefinitionId)
* this definition should be existing and active in the gamecardDefinitions collection
* the userGamecard has to include the userid of the respective user
* this user has to be existent and valid
* the userGamecard has to include the creationTime (timestamp) of the actual time that the card has been played
* this timestamp should be in utc time, earlier than now, later than the gamecard definition's activation time
* the userGamecard is not played before the start of the scheduled match when the card type is Instant
* the user should not have played the same gamecard (gamecardDefinitionId) more than the maxUserInstances (if null ignore this rule)
* the user should not play the same gamecard definition while the previous one played is active and is not yet resolved
* the referenced match is not completed
*/
gamecards.validateUserInstance = function (matchId, userGamecard, callback) {

    if (!userGamecard.gamecardDefinitionId)
        return callback({ isValid: false, error: "Body is lacking of the gamecardDefinitionId property" });

    if (!userGamecard.matchid)
        return callback({ isValid: false, error: "Body is lacking of the matchid property" });

    if (userGamecard.matchid != matchId)
        return callback({ isValid: false, error: "The matchid in the body is different from the one in the url path" });

    if (!userGamecard.userid)
        return callback({ isValid: false, error: "Body is lacking of the userid property" });

    let itsNow = moment.utc();

    if (!userGamecard.creationTime || moment.utc(userGamecard.creationTime).isAfter(itsNow))
        log.warn("Body is lacking of the creationTime property or it is later than NOW " + itsNow.format() + " in UTC");
    //return callback({ isValid: false, error: "Body is lacking of the creationTime property or it is later than NOW " + itsNow.format() + " in UTC" });

    // search for the referenced wildcardDefinitionId in the defaultDefinitions first, then to the mongo collection
    let referencedDefinition = null;
    let sameInstanceCount = 0;
    let otherPresetInstants = null;
    let scheduledMatch = null;

    async.parallel([
        function (cbk) {
            db.models.users.findById(userGamecard.userid, function (error, data) {
                if (error)
                    return cbk(error);
                cbk(null, data);
            });
        },
        function (cbk) {
            db.models.gamecardDefinitions.findById(userGamecard.gamecardDefinitionId, function (error, data) {
                if (error)
                    return cbk({ isValid: false, error: error.message });

                if (data) {
                    referencedDefinition = data;

                    // Found referenced definition, keep validating
                    if (!referencedDefinition.matchid || matchId != referencedDefinition.matchid)
                        return cbk(new Error("The referenced gamecardDefinitionId document either does not include a matchid reference or is not related to the matchid in the body"));

                    if (referencedDefinition.status != 1)
                        return cbk(new Error("The referenced gamecardDefinitionId document is not in an active state"));

                    if (referencedDefinition.options && referencedDefinition.options.length > 0 && !userGamecard.optionId)
                        return cbk(new Error("The references gamecardDefinitionId document contains options, but no optionId property for the selected option is included in the Body"));

                    if (moment.utc(userGamecard.creationTime).isBefore(moment.utc(referencedDefinition.creationTime)))
                        return cbk(new Error("The creationTime in the body is before the creationTime in the gamecardDefinitionId document"));

                    if (referencedDefinition.cardType == 'PresetInstant') {
                        if (!userGamecard.minute)
                            return cbk(new Error("Body is lacking of the minute property for a definition of type 'PresetInstant'"));

                        if (userGamecard.minute < 0 || userGamecard.minute > 90)
                            return cbk(new Error("The minute property in the body for a definition of type 'PresetInstant' should be between 0 and 90"));
                    }
                }

                cbk(null, referencedDefinition);
            });
        },
        function (cbk) {
            db.models.userGamecards.find({ matchid: matchId, userid: userGamecard.userid, gamecardDefinitionId: userGamecard.gamecardDefinitionId }, 'status cardType duration minute', function (error, sameDefinitionUsercards) {
                if (error)
                    return cbk(error);
                sameInstanceCount = !sameDefinitionUsercards ? 0 : sameDefinitionUsercards.length;

                if (sameInstanceCount > 0 && _.head(sameDefinitionUsercards).cardType != 'PresetInstant' && (_.some(sameDefinitionUsercards, { status: 1 }) == true || _.some(sameDefinitionUsercards, { status: 3 }) == true))
                    return cbk(new Error("There is at least another user Gamecard of the same referenced gamecardDefinitionId in an active state"));

                if (sameInstanceCount > 0 && _.head(sameDefinitionUsercards).cardType == 'PresetInstant')
                    otherPresetInstants = sameDefinitionUsercards;

                cbk(null, sameInstanceCount);
            });
        },
        function (cbk) {
            db.models.scheduled_matches
                .findById(matchId, 'home_team away_team competition start completed state time settings home_score away_score')
                .populate('home_team away_team', 'name')
                .exec(function (error, match) {
                if (error)
                    return cbk(error);

                scheduledMatch = match;
                cbk(null, match);
            });
        }
    ], function (error, results) {
        if (error)
            return callback({ isValid: false, error: error.message });

        let user = results[0];

        if (!user)
            return callback({ isValid: false, error: "The userid in the body does not correspond to an existing user" });
        // ToDo in the future: consider testing if the user is active and not banned.

        // let VIPUser = user.subscription.state || 0; 
        // console.log("VIPUser: "+VIPUser);
        // console.log("Match Rules: ")
        // console.log(results[3].settings.matchRules);
        referencedDefinition = results[1];

        if (!referencedDefinition)
            return callback({ isValid: false, error: "The gamecardDefinitionId in the body does not correspond to an existing gamecard definition" });

        if (!scheduledMatch)
            return callback({ isValid: false, error: "The matchId " + matchId + " is not found" });

        if (referencedDefinition.cardType == 'PresetInstant' && scheduledMatch.state > 0)
            return callback({ isValid: false, error: "A PresetInstant game card cannot be played after the match starts" });

        if (referencedDefinition.cardType == 'Instant' && scheduledMatch.state == 0)
            return callback({ isValid: false, error: "An Instant game card cannot be played before the match starts" });

        if (scheduledMatch.completed && scheduledMatch.completed == true)
            return callback({ isValid: false, error: "The referenced match is completed. No more gamecards can be played past the match's completion." });

        if (!referencedDefinition.status || referencedDefinition.status != 1)
            return callback({ isValid: false, error: "The gamecardDefinitionId document's status is not in an active state" });

        if (referencedDefinition.maxUserInstances && referencedDefinition.maxUserInstances <= sameInstanceCount)
            return callback({ isValid: false, error: "The gamecardDefinitionId document's maxUserInstances have been reached already, no more cards of the same type can be played by this user" });

        let conflictedCardLowerMinute = null;
        let conflictedCardUpperMinute = null;
        if (referencedDefinition.cardType == 'PresetInstant' && sameInstanceCount > 0 && _.some(otherPresetInstants, function (otherPresetInstant) {
            let cardDuration = otherPresetInstant.duration ? otherPresetInstant.duration / 60000 : 0;     // converted in minutes from milliseconds
            if ((otherPresetInstant.minute <= userGamecard.minute && (userGamecard.minute <= otherPresetInstant.minute + cardDuration))
                || (otherPresetInstant.minute <= (userGamecard.minute + cardDuration) && userGamecard.minute <= otherPresetInstant.minute)) {
                if (conflictedCardLowerMinute == null)
                    conflictedCardLowerMinute = otherPresetInstant.minute;
                else if (otherPresetInstant.minute < conflictedCardLowerMinute)
                    conflictedCardLowerMinute = otherPresetInstant.minute;

                if (conflictedCardUpperMinute == null)
                    conflictedCardUpperMinute = otherPresetInstant.minute + cardDuration;
                else if (otherPresetInstant.minute + cardDuration > conflictedCardUpperMinute)
                    conflictedCardUpperMinute = otherPresetInstant.minute + cardDuration;

                return true;
            }

            return false;
        }) == true)
            return callback({ isValid: false, error: "No more '" + referencedDefinition.title + "' PresetInstant cards can be played bewtween minutes " + conflictedCardLowerMinute + " and " + conflictedCardUpperMinute });


        return callback({ isValid: true, error: null }, referencedDefinition, scheduledMatch);
    });
};


// Add a user played gamecard, after first validating it against fraud, latency and inconsistency
// {
//     "gamecardDefinitionId": "",
//     "userId": "",
//     "matchid": "",
//     "creationTime": "",
// }

gamecards.addUserInstance = function (matchId, gamecard, callback) {
    // First of all, validate this card
    gamecards.validateUserInstance(matchId, gamecard, function (validationOutcome, gamecardDefinition, scheduledMatch) {
        if (!validationOutcome.isValid) {
            return callback(null, new Error('Bad request, validation error in request body for this user gamecard: ' + validationOutcome.error));
        }

        if (gamecardDefinition.cardType == 'PresetInstant') {
            if (gamecard.minute >= 45)
                gamecard.segment = 3;
            else
                gamecard.segment = 1;
        }

        let itsNow = moment.utc();
        // Use the server's time for computing the card's creationTime instead of what the client sends for it inside the body
        let creationMoment = itsNow; //moment.utc(gamecard.creationTime);

        var created = creationMoment.toISOString();
        var activated = null;
        var terminated = null;
        if (gamecardDefinition.cardType != 'PresetInstant') {
            activated = creationMoment.clone().add(gamecardDefinition.activationLatency, 'ms').toISOString();
            terminated = creationMoment.clone().add(gamecardDefinition.activationLatency, 'ms').add(gamecardDefinition.duration, 'ms').toISOString();
        }
        // If the match has started, override the card's minute with the match's one
        var minute = gamecard.minute;

        // Store the mongoose model
        let newCard = null;
        try {
            newCard = new UserGamecard({
                userid: gamecard.userid,
                gamecardDefinitionId: gamecardDefinition.id,
                matchid: gamecard.matchid,
                title: gamecardDefinition.title,
                image: gamecardDefinition.image,
                primaryStatistic: gamecardDefinition.primaryStatistic,
                minute: minute,
                segment: gamecard.segment,
                duration: gamecardDefinition.duration || null,
                activationLatency: gamecardDefinition.activationLatency || null,
                winConditions: gamecardDefinition.winConditions,
                terminationConditions: gamecardDefinition.terminationConditions,
                pointsPerMinute: gamecardDefinition.pointsPerMinute || 0,
                startPoints: gamecardDefinition.startPoints || 0,
                endPoints: gamecardDefinition.endPoints || 0,
                optionId: gamecard.optionId || null,
                cardType: gamecardDefinition.cardType,
                creationTime: created,
                activationTime: activated,    // let the schema pre-save handle these times
                //terminationTime: gamecardDefinition.terminationTime,
                wonTime: null,
                pointsAwarded: null,
                specials: {
                    "DoublePoints": {
                        status: 0,
                        // creationTime: null,
                        // activationTime: null,
                        activationLatency: gamecardDefinition.specialActivationLatency && gamecardDefinition.specialActivationLatency['DoublePoints'] ? gamecardDefinition.specialActivationLatency['DoublePoints'] : 0,
                    },
                    "DoubleTime": {
                        status: 0,
                        // creationTime: null,
                        // activationTime: null,
                        activationLatency: gamecardDefinition.specialActivationLatency && gamecardDefinition.specialActivationLatency['DoubleTime'] ? gamecardDefinition.specialActivationLatency['DoubleTime'] : 0,
                    }
                },

                status: 0 //gamecardDefinition.cardType == "Instant" ? 0 : (gamecardDefinition.status || 0)
            });

            // Override Instant gamecard minute sent by the client, with the actual scheduled match's time
            if (gamecardDefinition.cardType == 'Instant') {
                newCard.minute = scheduledMatch.time;
                newCard.segment = scheduledMatch.state;
            }

            if (newCard.duration && newCard.duration > 0 && newCard.cardType != 'PresetInstant')
                newCard.terminationTime = terminated;

            if (gamecardDefinition.options && gamecard.optionId) {
                console.log("The card has options so we try to find starting points here. Option ID: " + gamecard.optionId);
                let optionsIndex = _.find(gamecardDefinition.options, function (option) {
                    return option.optionId == gamecard.optionId;
                });

                // console.log("optionsIndex:\n" + optionsIndex);

                if (optionsIndex) {
                    newCard.winConditions = optionsIndex.winConditions || null;
                    if (optionsIndex.terminationConditions)
                        newCard.terminationConditions = optionsIndex.terminationConditions || null;
                    if (optionsIndex.text)
                        newCard.text = optionsIndex.text;
                    if (optionsIndex.startPoints)
                        newCard.startPoints = optionsIndex.startPoints;
                    if (optionsIndex.endPoints)
                        newCard.endPoints = optionsIndex.endPoints;
                    if (optionsIndex.pointsPerMinute)
                        newCard.pointsPerMinute = optionsIndex.pointsPerMinute;
                    if (optionsIndex.activationLatency)
                        newCard.activationLatency = optionsIndex.activationLatency;
                    if (optionsIndex.specialActivationLatency) {
                        if (optionsIndex.specialActivationLatency['DoublePoints'])
                            newCard.specials.DoublePoints.activationLatency = optionsIndex.specialActivationLatency['DoublePoints'];
                        if (optionsIndex.specialActivationLatency['DoubleTime'])
                            newCard.specials.DoubleTime.activationLatency = optionsIndex.specialActivationLatency['DoubleTime'];
                    }
                    if (optionsIndex.duration)
                        newCard.duration = optionsIndex.duration;
                    newCard.optionId = optionsIndex.optionId;

                    if (optionsIndex.duration && optionsIndex.duration > 0) {
                        newCard.terminationTime = moment.utc().add(optionsIndex.duration, 'ms').add(optionsIndex.activationLatency ? optionsIndex.activationLatency : 0, 'ms').toDate();
                    }
                }
            }

            if (newCard.cardType == "Overall" && newCard.pointsPerMinute && scheduledMatch && scheduledMatch.start) {
                // Compute the updated starting points (winning points if the card wins) if the match has already started (is live)
                if (scheduledMatch.state > 0) {
                    let minutesSinceMatchStart = scheduledMatch.time; //moment.duration(itsNow.diff(scheduledMatch.start)).asMinutes();

                    // Reset to 45' if it is a halftime
                    if (scheduledMatch.state == 2) minutesSinceMatchStart = 45;
                    newCard.startPoints += Math.round(minutesSinceMatchStart * newCard.pointsPerMinute);
                }
            }

            // if (newCard.terminationConditions && newCard.terminationConditions.length > 0 && scheduledMatch && scheduledMatch.state)
            // {
            //     newCard.terminationConditions.forEach(function(condition) {
            //       if (condition.remaining && condition.stat == 'Segment') 
            //             condition.remaining -= scheduledMatch.state;
            //     });
            // }

            newCard.save(function (error) {
                if (error)
                    return callback(error);

                db.models.useractivities.SetMatchPlayed(newCard.userid, newCard.matchid);
                // Register user activity - 'PlayedCard'
                var statsToUpdateQuerry = 'cardsPlayed ' + newCard.cardType.toLowerCase() + 'CardsPlayed';
                db.models.useractivities.IncrementStat(newCard.userid, newCard.matchid, statsToUpdateQuerry, 1);

                callback(null, null, gamecards.TranslateUserGamecard(newCard));
            });
        }
        catch (error) {
            return callback(error);
        }

    });
};


// First get the userGamecard from mongo and assert that it exists and that its status is 1.
// Then, update it accordingly
gamecards.updateUserInstance = function (userGamecardId, options, outerCallback) {

    const itsNow = moment.utc();
    async.waterfall([
        function (callback) {
            db.models.userGamecards.findById(userGamecardId, function (error, userGamecard) {
                if (error)
                    return callback(error);

                if (!userGamecard) {
                    error = new Error("The userGamecardId " + userGamecardId + " is not found");
                    error.code = 10001;
                    return callback(null, error, null);
                }

                if (userGamecard.status == 2) {
                    error = new Error("The userGamecardId " + userGamecard.id + " is completed, no specials can be played.");
                    error.code = 10002;
                    return callback(null, error, null);
                }

                if (options.doubleTime && userGamecard.cardType == 'Overall') {
                    error = new Error("Cannot add double time in an Overall gamecard " + userGamecard.id);
                    error.code = 10003;
                    return callback(null, error, null);
                }

                if (userGamecard.isDoublePoints == true && userGamecard.isDoubleTime == true) {
                    error = new Error("All available special power-ups are already played on this userGamecard " + userGamecard.id);
                    error.code = 10004;
                    return callback(null, error, null);
                }

                if (options.doublePoints && options.doublePoints == true && userGamecard.isDoublePoints && userGamecard.isDoublePoints == true) {
                    error = new Error("The Double Points power-up is already played on this userGamecard " + userGamecard.id);
                    error.code = 10005;
                    return callback(null, error, null);
                }

                if (options.doubleTime && options.doubleTime == true && userGamecard.isDoubleTime && userGamecard.isDoubleTime == true) {
                    error = new Error("The Double Time power-up is already played on this userGamecard " + userGamecard.id);
                    error.code = 10006;
                    return callback(null, error, null);
                }

                if (options.doublePoints && options.doublePoints == true && userGamecard.specials['DoublePoints'] && userGamecard.specials['DoublePoints'].activationLatency && userGamecard.terminationTime && itsNow.clone().add(userGamecard.specials['DoublePoints'].activationLatency, 'milliseconds').isAfter(moment.utc(userGamecard.terminationTime))) {
                    error = new Error("Not enough time to activate this Double Points power-up card");
                    error.code = 10009;
                    return callback(null, error, null);
                }

                callback(null, null, userGamecard);
            });
        },
        function (validationError, userGamecard, callback) {
            if (validationError)
                return callback(null, validationError, null, null);

            db.models.scheduled_matches
                .findById(userGamecard.matchid)
                .populate('home_team away_team', 'name')
                .exec(function (error, match) {
                    if (error)
                        return callback(error);

                    callback(null, null, userGamecard, match);
                });
        },
        function (validationError, userGamecard, match, callback) {
            if (validationError)
                return callback(null, validationError, null, null);

            db.models.userGamecards.find({ userid: userGamecard.userid, matchid: userGamecard.matchid, $or: [{ isDoublePoints: true }, { isDoubleTime: true }] }, 'isDoublePoints isDoubleTime', function (error, userGamecards) {
                if (error)
                    return callback(error);

                let count = 0;
                count = _.sumBy(userGamecards, function (gamecard) {
                    return gamecard.isDoublePoints == true && gamecard.isDoubleTime == true ? 2 : gamecard.isDoublePoints == true || gamecard.isDoubleTime == true ? 1 : 0;
                });

                if (match.settings && match.settings.gameCards && match.settings.gameCards.specials) {
                    if (count >= match.settings.gameCards.specials) {
                        error = new Error('This user has played already the allowed number of special Gamecards');
                        error.code = 10007;
                        return callback(null, error, null);
                    }
                }

                callback(null, null, userGamecard, match);
            });
        }
    ], function (error, validationError, userGamecard, match) {
        if (error)
            return outerCallback(error);

        if (validationError)
            return outerCallback(null, validationError, null);

        let itsNow = moment.utc();

        if (options.doublePoints && options.doublePoints == true) {
            let special = userGamecard.specials['DoublePoints'];

            if (special.status != 0) {
                error = new Error("The Double Points power-up is already played on this userGamecard " + userGamecard.id);
                error.code = 10005;
                return callback(null, error, null);
            }

            special.creationTime = itsNow.clone().toDate();

            if (!special.activationLatency || special.activationLatency == 0) {
                special.activationTime = itsNow.toDate();
                special.status = 2;

                if (userGamecard.cardType == "Instant" || userGamecard.cardType == "PresetInstant") {
                    userGamecard.startPoints = userGamecard.startPoints * 2;
                    userGamecard.endPoints = userGamecard.endPoints * 2;
                }
                else
                    userGamecard.startPoints = userGamecard.startPoints * 2;

                userGamecard.isDoublePoints = true;
            }
            else {
                special.activationTime = itsNow.clone().add(special.activationLatency, 'milliseconds').toDate();
                special.status = 1;
            }
        }
        if (options.doubleTime && options.doubleTime == true) {
            let special = userGamecard.specials['DoubleTime'];

            if (special.status != 0) {
                error = new Error("The Double Time power-up is already played on this userGamecard " + userGamecard.id);
                error.code = 10006;
                return callback(null, error, null);
            }

            special.creationTime = itsNow.toDate();

            if (!special.activationLatency || special.activationLatency == 0) {
                special.activationTime = itsNow.toDate();
                special.status = 2;

                if (userGamecard.duration) {
                    if (userGamecard.terminationTime)
                        userGamecard.terminationTime = moment.utc(userGamecard.terminationTime).clone().add(userGamecard.duration, 'milliseconds').toDate();
                    userGamecard.duration = userGamecard.duration * 2;

                    userGamecard.isDoubleTime = true;
                }
            }
            else {
                special.activationTime = itsNow.clone().add(special.activationLatency, 'milliseconds').toDate();
                special.status = 1;
            }
        }
        // userGamecard.save(function (err,result) {
        db.models.userGamecards.findByIdAndUpdate(userGamecard._id, gamecards.TranslateUserGamecard(userGamecard), { new: true },
            function (err, result) {
                if (err)
                    return outerCallback(err);

                outerCallback(null, null, result);
            });
    });
};


gamecards.TranslateUserGamecard = function (userGamecard) {
    let retValue = {
        id: userGamecard.id || null,
        userid: userGamecard.userid || null,
        matchid: userGamecard.matchid || null,
        gamecardDefinitionId: userGamecard.gamecardDefinitionId || null,
        title: userGamecard.title || null,
        image: userGamecard.image || null,
        text: userGamecard.text || null,
        minute: userGamecard.minute || 0,
        segment: userGamecard.segment || 0,
        primaryStatistic: userGamecard.primaryStatistic || null,
        cardType: userGamecard.cardType || null,
        isDoubleTime: userGamecard.isDoubleTime || false,
        isDoublePoints: userGamecard.isDoublePoints || false,
        status: userGamecard.status || 0,
        specials: userGamecard.specials
    };

    if (userGamecard.startPoints)
        retValue.startPoints = userGamecard.startPoints;
    if (userGamecard.endPoints)
        retValue.endPoints = userGamecard.endPoints;
    if (userGamecard.pointsPerMinute)
        retValue.pointsPerMinute = userGamecard.pointsPerMinute;

    if (userGamecard.activationLatency)
        retValue.activationLatency = userGamecard.activationLatency;
    if (userGamecard.pointsAwarded)
        retValue.pointsAwarded = userGamecard.pointsAwarded;
    if (userGamecard.duration)
        retValue.duration = userGamecard.duration;
    if (userGamecard.optionId)
        retValue.optionId = userGamecard.optionId;
    if (userGamecard.maxUserInstances)
        retValue.maxUserInstances = userGamecard.maxUserInstances;
    if (userGamecard.creationTime)
        retValue.creationTime = userGamecard.creationTime;
    if (userGamecard.activationTime)
        retValue.activationTime = userGamecard.activationTime;
    if (userGamecard.terminationTime)
        retValue.terminationTime = userGamecard.terminationTime;
    if (userGamecard.wonTime)
        retValue.wonTime = userGamecard.wonTime;

    return retValue;
};


// DELETE
// removes gamecard from CardsInplay &
// from the database.
// CAUTION: USE ONLY FOR TESTING PURPOSES IN DEVELOPMENT ENVIRONMENT
gamecards.deleteUserInstance = function (gamecardId, callback) {
    db.models.gamecards.findById({ _id: gamecardId }, function (error, gamecard) {
        if (error)
            return callback(error);

        gamecard.delete(function (error) {
            if (error)
                return callback(error);
            callback(null);
        });
    });
};

// a helper function that returns match total minutes from current match state and minute
gamecards.GetMatchMinute = function (state, stateMinute) {
    switch (state) {
        case 0:
            return 0;
        case 1:
            return stateMinute > 45 ? 45 : stateMinute;
        case 2:
            return 45;
        case 3:
            return stateMinute > 45 ? 90 : 45 + stateMinute;
        case 4:
            return 90;
        case 5:
            return stateMinute > 15 ? 105 : 90 + stateMinute;
        case 6:
            return 105;
        case 7:
            return stateMinute > 15 ? 120 : 105 + stateMinute;
        default:
            return 120;
    }
};

// Manage gamecards in time, activate the ones pending activation, terminate the ones pending termination
gamecards.Tick = function () {
    // Update all wildcards pending to be activated
    let itsNow = moment.utc().toDate();

    if (!db) {
        log.warn('Gamecards module is not yet connected to Mongo store. Aborting Tick.');
        return;
    }


    // Check terminationConditions on overall cards
    // Terminate active instant cards if terminationTime is passed

    async.parallel([
        function (callback) {
            // Update all wildcards that are due for activation
            // ToDo: Check that the appearance criteria are also met
            return db.models.gamecardDefinitions.update({ status: 0, activationTime: { $lt: itsNow } }, { $set: { status: 1 } }, { multi: true }, callback);
        },
        function (callback) {
            // Update all special gamecards (power-ups) still in play that should be activated
            db.models.userGamecards.find({ status: 1, $or: [{ 'specials.DoublePoints.status': 1, 'specials.DoublePoints.activationTime': { $lt: itsNow } }, { 'specials.DoubleTime.status': 1, 'specials.DoubleTime.activationTime': { $lt: itsNow } }] }, function (error, userGamecards) {
                if (error)
                    return callback(error);

                return async.each(userGamecards, function (userGamecard, cbk) {
                    let keys = ['DoublePoints', 'DoubleTime'];
                    let special = null;
                    let specialKey = null;
                    _.forEach(keys, function (key) {
                        if (userGamecard.specials[key].status == 1 && userGamecard.specials[key].activationTime < itsNow) {
                            special = userGamecard.specials[key];
                            specialKey = key;
                        }
                    });

                    special.status = 2;

                    if (specialKey && specialKey == 'DoublePoints') {
                        if (userGamecard.cardType == "Instant" || userGamecard.cardType == 'PresetInstant') {
                            userGamecard.startPoints = userGamecard.startPoints * 2;
                            userGamecard.endPoints = userGamecard.endPoints * 2;
                        }
                        else
                            userGamecard.startPoints = userGamecard.startPoints * 2;

                        userGamecard.isDoublePoints = true;
                    }
                    if (specialKey && specialKey == 'DoubleTime') {
                        if (userGamecard.duration) {
                            if (userGamecard.terminationTime)
                                userGamecard.terminationTime = moment.utc(userGamecard.terminationTime).clone().add(userGamecard.duration, 'ms').toDate();
                            userGamecard.duration = userGamecard.duration * 2;

                            userGamecard.isDoubleTime = true;
                        }
                    }

                    return userGamecard.save(cbk);

                }, callback);
            });
        },
        function (callback) {
            // Update all user gamecards that have passed from their pending state into activation
            return db.models.userGamecards.update({ status: 0, activationTime: { $lt: itsNow } }, { $set: { status: 1 } }, { multi: true }, callback);
        },
        function (callback) {
            // Find all instant gameCards that terminate, and decide if they have won or lost

            const cardsQuery = {
                status: 1,
                cardType: { $in: ["Instant", "PresetInstant"] },
                activationTime: { $lt: itsNow },
                terminationTime: { $lt: itsNow },
                //matchid : event.matchid
            };


            db.models.userGamecards.find(cardsQuery, function (error, data) {
                if (error)
                    return callback(error);

                if (!data || data.length == 0)
                    return callback(null);

                // Get all matches for these gamecards to be used to build the push notification messages for all winning cards
                const matchIds = _.uniq(_.map(data, 'matchid'));
                const matchObjectIds = _.map(matchIds, mongoose.Types.ObjectId);
                db.models.scheduled_matches
                    .find({ _id: { $in: matchObjectIds } }, 'state home_team away_team home_score away_score')
                    .populate('home_team away_team', 'name')
                    .exec(function (matchError, matches) {
                        if (matchError) {
                            log.error(matchError.stack);
                            return callback(matchError);
                        }

                        let cardsWon = [];
                        const matchLookup = _.keyBy(matches, 'id');

                        _.forEach(data, function (gamecard) {
                            const match = matchLookup[gamecard.matchid];
                            if (gamecards.CheckIfWins(gamecard, true, null, match)) {
                                // Send an event through Redis pub/sub:
                                // log.info("Detected a winning gamecard: " + gamecard);
                                cardsWon.push(gamecard);
                            }
                            else {
                                gamecard.terminationTime = moment.utc().toDate();
                                gamecard.status = 2;
                                gamecard.pointsAwarded = 0;

                                // Before saving, reset any pending specials waiting to be activated: they will never will
                                if (gamecard.specials && gamecard.specials.DoublePoints && gamecard.specials.DoublePoints.status == 1)
                                    gamecard.specials.DoublePoints.status = 0;
                                if (gamecard.specials && gamecard.specials.DoubleTime && gamecard.specials.DoubleTime.status == 1)
                                    gamecard.specials.DoubleTime.status = 0;

                                // Send an event through Redis pu/sub:
                                // log.info("Card lost: " + gamecard);
                                redisPublish.publish("socketServers", JSON.stringify({
                                    sockets: true,
                                    clients: [gamecard.userid],
                                    payload: {
                                        type: "Card_lost",
                                        client: gamecard.userid,
                                        room: gamecard.matchid,
                                        data: gamecards.TranslateUserGamecard(gamecard)
                                    }
                                }));
                            }
                            gamecard.save();
                        });
                        callback(null);
                    });
            });
        },
        function (callback) {
            // Find all live match time in minutes, 
            // and activate all PresetInstant cards that should be activated based on the match minute
            // and update all Overall cards's terminationConditions on the event where the stat property is 'Minute', and then on the event where the stat is 'Segment'

            let itsNow = moment.utc();
            // console.log("Preset Activation Tick: " + itsNow.toISOString());
            db.models.scheduled_matches
                .find({ completed: { $ne: true }, state: { $gt: 0 } }, '_id state time stats home_team away_team home_score away_score')
                .populate('home_team away_team', 'name')
                .exec(function (error, matches) { // cannot test matches in the future , start: { $lt: itsNow.toDate() }
                if (error)
                    return callback(error);

                let matchMinutes = {};
                let foundMatchIds = [];
                _.forEach(matches, function (scheduledMatch) {
                    if (!matchMinutes[scheduledMatch.id] && scheduledMatch.time && scheduledMatch.state) {
                        matchMinutes[scheduledMatch.id] = { minute: scheduledMatch.time, segment: scheduledMatch.state };
                        foundMatchIds.push(scheduledMatch.id);
                    }
                });

                async.each(matches, function (match, cbk) {

                    let segment = {
                        matchid: match.id,
                        time: null,
                        playerid: null,
                        teamid: null,
                        stat: 'Segment',
                        statTotal: match.state,
                        incr: 1
                    };

                    let event = {
                        matchid: match.id,
                        time: null,
                        playerid: null,
                        teamid: null,
                        stat: 'Minute',
                        statTotal: match.time,
                        incr: 1
                    };

                    // Check for appearance conditions, and set accordingly the visible property
                    //return gamecards.GamecardsTerminationHandle(mongoGamecards, event, matches, cbk);
                    async.parallel([
                        // function (parallelCbk) {
                        //     setTimeout(function () {
                        //         gamecards.GamecardsAppearanceHandle(event, match);
                        //         return parallelCbk(null);
                        //     }, 100);
                        // },
                        // function(parallelCbk) {
                        //     setTimeout(function() {
                        //         gamecards.GamecardsAppearanceHandle(segment, match);
                        //         return parallelCbk(null);
                        //     }, 200);
                        // },
                        function (parallelCbk) {
                            db.models.userGamecards.find({ matchid: match.id, status: 0, cardType: 'PresetInstant', minute: { $lte: match.time }, segment: { $lte: match.state } }, function (error, userGamecards) {
                                if (userGamecards.length > 0)
                                    console.log("Preset Found");

                                if (error) {
                                    log.error('Failed to activate PresetInstant user gamecards at match minute ' + match.minute + ' of match id %s !!!', match.id);
                                    return parallelCbk(null);
                                }

                                if (!userGamecards || userGamecards.length == 0)
                                    return parallelCbk(null);


                                _.forEach(userGamecards, function (userGamecard) {
                                    userGamecard.status = 1; // activated
                                    userGamecard.activationTime = itsNow.clone().toDate();
                                    userGamecard.terminationTime = itsNow.clone().add(userGamecard.duration || 0, 'ms').toDate();
                                });

                                async.each(userGamecards, function (userGamecard, cardCbk) {
                                    redisPublish.publish("socketServers", JSON.stringify({
                                        sockets: true,
                                        clients: [userGamecard.userid],
                                        payload: {
                                            type: "Card_PresetInstant_activated",
                                            client: userGamecard.userid,
                                            room: userGamecard.matchid,
                                            data: gamecards.TranslateUserGamecard(userGamecard)
                                        }
                                    }));

                                    return userGamecard.save(cardCbk);
                                }, parallelCbk);
                            });
                        },
                        // If we are in a not timed segment, pause all user gamecards that are not terminated (if any left)
                        function (parallelCbk) {
                            var systemTime = itsNow.toDate();
                            if (match.state == 2 || match.state == 4) {
                                db.models.userGamecards.update({ matchid: match.id, cardType: { $in: ['Instant', 'PresetInstant'] }, status: 1 }, { $set: { status: 3, pauseTime: systemTime } }, function (error, results) {
                                    if (error) {
                                        log.error('Failed to pause user gamecards after segment ' + (match.state - 1) + ' ends on match id %s !!!', match.id);
                                        return parallelCbk(null);
                                    }
                                });
                            }
                            else
                                return async.setImmediate(function () {
                                    return parallelCbk(null);
                                });
                        },
                        // Check match state and minute against user gamecards' terminationConditions
                        function (parallelCbk) {
                            const wildcardsQuery = {
                                status: 1,
                                cardType: "Overall",
                                creationTime: { $lt: event.time || itsNow },
                                matchid: event.matchid
                            };

                            const orPlayerQuery = [{ playerid: null }];
                            if (event.playerid != null) {
                                orPlayerQuery.push({ playerid: event.playerid });
                            }

                            const orTeamQuery = [{ teamid: null }];
                            if (event.teamid != null) {
                                orTeamQuery.push({ teamid: event.teamid });
                            }

                            wildcardsQuery.terminationConditions = { $elemMatch: { $and: [{ stat: event.stat }, { remaining: { $ne: 0 } }, { $or: orPlayerQuery }, { $or: orTeamQuery }] } };
                            let mongoGamecards;

                            db.models.userGamecards.find(wildcardsQuery, function (error, data) {
                                if (error) {
                                    log.error("Error while resolving event: " + error.message);
                                    return parallelCbk(error);
                                }

                                mongoGamecards = data;

                                return gamecards.GamecardsTerminationHandle(mongoGamecards, event, match, parallelCbk);
                            });

                        },
                        // Check terminationConditions whether any is met, and in this case resolve the affected userGamecards
                        function (parallelCbk) {
                            const wildcardsQuery = {
                                status: 1,
                                cardType: "Overall",
                                creationTime: { $lt: segment.time || itsNow },
                                matchid: segment.matchid
                            };

                            const orPlayerQuery = [{ playerid: null }];
                            if (segment.playerid != null) {
                                orPlayerQuery.push({ playerid: segment.playerid });
                            }

                            const orTeamQuery = [{ teamid: null }];
                            if (segment.teamid != null) {
                                orTeamQuery.push({ teamid: segment.teamid });
                            }

                            wildcardsQuery.terminationConditions = { $elemMatch: { $and: [{ stat: segment.stat }, { remaining: { $ne: 0 } }, { $or: orPlayerQuery }, { $or: orTeamQuery }] } };
                            let mongoGamecards;

                            db.models.userGamecards.find(wildcardsQuery, function (error, data) {
                                if (error) {
                                    log.error("Error while resolving event: " + error.message);
                                    return parallelCbk(error);
                                }

                                mongoGamecards = data;

                                return gamecards.GamecardsTerminationHandle(mongoGamecards, segment, match, parallelCbk);
                            });

                        }
                    ], function (error) {
                        if (error)
                            return cbk(error);

                        cbk();
                    });
                }, function (eachError) {
                    if (eachError)
                        return callback(eachError);
                    callback(null);
                });

            });
        }
    ], function (error) {
        if (error)
            return;
    });
};

gamecards.HandleUserCardRewards = function (uid, mid, cardType, cardPrimaryStat, cardMinute, pointsToGive, callback) {

    return async.parallel([
        (cbk) => {
            db.models.scores.AddPoints(uid, mid, pointsToGive, moment.utc().toDate(), function (err, result) {
                if (err) {
                    console.log("-----------------------------------");
                    console.log("Error:");
                    console.log(err);
                    log.error(err);
                    return cbk(err);
                }
                return cbk(null);
            });
        },
        (cbk) => {
            // Reward stats
            var statsToUpdateQuerry = 'cardsWon ' + cardType.toLowerCase() + 'CardsWon';
            db.models.useractivities.IncrementStat(uid, mid, statsToUpdateQuerry, 1, function (err, result) {
                if (err) {
                    log.error(err);
                    return cbk(err);
                }

                return cbk(null);
            });
        },
        (cbk) => {
            // Reward Achievements for certain types and primary Stats of cards
            // All conditions used to be if (cardType != 'Overall' && ... but we due to having red cards only as Overall cards, we removed this
            if (cardPrimaryStat == 'Goal' && cardMinute && cardMinute > 75) {
                // late_party and top_scorer
                return async.parallel([
                    (innerCbk) => { return achievements.Reward.update_achievement(uid, 'late_party', 1, innerCbk); },
                    (innerCbk) => { return achievements.Reward.update_achievement(uid, 'top_scorer', 1, innerCbk); }
                ], cbk);
            }
            else if (cardPrimaryStat == 'Goal') {
                // top_scorer
                return achievements.Reward.update_achievement(uid, 'top_scorer', 1, cbk);
            }
            else if (cardPrimaryStat == 'Red') {
                // passion_color
                return achievements.Reward.update_achievement(uid, 'passion_color', 1, cbk);
            }
            else
                return async.setImmediate(() => { cbk(null); });         
        }
    ], callback);

    // Reward Points
    //return db.models.scores.AddPoints(uid, mid, pointsToGive, moment.utc().toDate(), function (err, result) {
    //    if (err) {
    //        console.log("-----------------------------------");
    //        console.log("Error:");
    //        console.log(err);
    //        log.error(err);
    //        if (callback)
    //            return callback(err);
    //    }
    //    // Reward stats
    //    var statsToUpdateQuerry = 'cardsWon ' + cardType.toLowerCase() + 'CardsWon';
    //    db.models.useractivities.IncrementStat(uid, mid, statsToUpdateQuerry, 1, function (err, result) {
    //        if (err) {
    //            log.error(err);
    //            if (callback)
    //                return callback(err);
    //        }

    //        if (callback)
    //            return callback(null, 'Done');
    //    });
    //});

}


gamecards.CheckIfWins = function (gamecard, isCardTermination, simulatedWinTime, match) {
    const simulationCheck = !simulatedWinTime ? false : true;
    const itsNow = simulatedWinTime || moment.utc();
    let conditions = gamecard.winConditions;

    // All winConditions have to be met to win the card
    for (let i = 0; i < conditions.length; i++) {
        let condition = conditions[i];
        let target = condition.target || 0;

        let isConditionComparative = (condition.comparativeTeamid || condition.comparativePlayerid) && condition.comparisonOperator;
        if (isCardTermination == false) {
            if (condition.conditionNegation == true || condition.remaining > target)
                return false;

            // if at least one compatative condition exists in the winConditions, then the whole gamecard will not win unless one of the terminationConditions are met.
            if (isConditionComparative)
                return false;
        }
        else {
            if (!isConditionComparative && condition.remaining <= target && condition.conditionNegation == true)
                return false;
            if (!isConditionComparative && condition.remaining > target && condition.conditionNegation == false)
                return false;
            if (isConditionComparative && match && match.stats) {

                let id1 = condition.playerid || condition.teamid || condition.matchid;
                let id2 = condition.comparativePlayerid || condition.comparativeTeamid || condition.comparativeMatchid;
                let id1StatItem = _.find(match.stats, { id: id1 });
                let id2StatItem = _.find(match.stats, { id: id2 });
                if ((!id1StatItem || !id2StatItem) && condition.comparisonOperator != 'eq')
                    return false;
                let id1Stat = !id1StatItem ? 0 : id1StatItem[condition.stat] || 0;
                let id2Stat = !id2StatItem ? 0 : id2StatItem[condition.stat] || 0;
                if (condition.comparisonOperator == 'gt' && id1Stat <= id2Stat)
                    return false;
                if (condition.comparisonOperator == 'lt' && id1Stat >= id2Stat)
                    return false;
                if (condition.comparisonOperator == 'eq' && id1Stat != id2Stat)
                    return false;
            }
        }
    }
    gamecard.status = 2; // terminated
    if (!gamecard.terminationTime)
        gamecard.terminationTime = itsNow.toDate();
    gamecard.wonTime = itsNow.toDate();
    // Award points
    if (gamecard.cardType == "Instant" || gamecard.cardType == "PresetInstant") {
        try {
            let startInt = moment.utc(gamecard.activationTime);
            let endInt = itsNow;
            let realDuration = endInt.diff(startInt, 'milliseconds', true);
            if (gamecard.pauseTime && gamecard.resumeTime)
                realDuration = moment.utc(gamecard.pauseTime).diff(startInt, 'milliseconds', true) + endInt.diff(moment.utc(gamecard.resumeTime), 'milliseconds', true);
            gamecard.pointsAwarded = gamecard.startPoints + Math.round((gamecard.endPoints - gamecard.startPoints) * (realDuration / gamecard.duration));
        }
        catch (err) {
            if (simulationCheck && gamecard.pointsAwardedInitially)
                gamecard.pointsAwarded = gamecard.pointsAwardedInitially;
            log.error(err.stack, gamecard.toObject());
        }
    }
    else
        gamecard.pointsAwarded = gamecard.startPoints;

    // console.log("-----------------------------------");
    // console.log("Card Won");
    // log.info('Detected a winning gamecard: %s', gamecard.id);

    // Before saving, reset any pending specials waiting to be activated: they will never will
    if (gamecard.specials && gamecard.specials.DoublePoints && gamecard.specials.DoublePoints.status == 1)
        gamecard.specials.DoublePoints.status = 0;
    if (gamecard.specials && gamecard.specials.DoubleTime && gamecard.specials.DoubleTime.status == 1)
        gamecard.specials.DoubleTime.status = 0;


    if (!simulationCheck) {
        // Give Platform Rewards (update scores for leaderboards, user score, stats, achievements)
        gamecards.HandleUserCardRewards(gamecard.userid, gamecard.matchid, gamecard.cardType, gamecard.primaryStatistic, gamecard.minute, gamecard.pointsAwarded, function (err, result) {
            if (err)
                log.error(err.message);
        });

        const gamecardName = {
            en: gamecard.title.en,
            ar: gamecard.title.ar || gamecard.title.en
        };

        let matchName = { en: '', ar: '' };

        if (match.home_team && match.home_team.name && match.home_team.name.en)
            matchName.en += match.home_team.name.en;
        else matchName.en += 'Home team';
        matchName.en += ' ' + match.home_score + ' - ' + match.away_score + ' ';
        if (match.away_team && match.away_team.name && match.away_team.name.en)
            matchName.en += match.away_team.name.en;
        else matchName.en += 'Away team';

        if (match.home_team && match.home_team.name && match.home_team.name.ar)
            matchName.ar += match.home_team.name.ar;
        else matchName.ar += 'Home team';
        matchName.ar += ' ' + match.home_score + ' - ' + match.away_score + ' ';
        if (match.away_team && match.away_team.name && match.away_team.name.ar)
            matchName.ar += match.away_team.name.ar;
        else matchName.ar += 'Away team';

        const msgG4 = {
            en: `You won ${gamecard.pointsAwarded} points from the ${gamecardName.en} card in ${matchName.en}`,
            ar: `لقت كسبت  ${gamecard.pointsAwarded} نقطة من بطاقة ${gamecardName.ar} لمباراة ${matchName.ar}`
        };

        MessagingTools.sendPushToUsers([gamecard.userid], msgG4, { "type": "view", "data": { "view": "match", "viewdata": gamecard.matchid } }, "won_cards");
        gamecards.publishWinToUser(gamecard);
    }

    return true;
};


gamecards.CheckIfTerminates = function (gamecard, match) {
    let conditions = gamecard.terminationConditions;

    // If any of the terminationConditions is met, the card terminates
    for (let i = 0; i < conditions.length; i++) {
        let condition = conditions[i];
        let target = condition.target || 0;

        let isConditionComparative = (condition.comparativeTeamid || condition.comparativePlayerid) && condition.comparisonOperator;

        if (!isConditionComparative && condition.remaining <= target && condition.conditionNegation && condition.conditionNegation == true)
            continue;
        if (!isConditionComparative && condition.remaining > target && (!condition.conditionNegation || condition.conditionNegation == false))
            continue;
        if (isConditionComparative && match) {

            let id1 = condition.playerid || condition.teamid || condition.matchid;
            let id2 = condition.comparativePlayerid || condition.comparativeTeamid || condition.comparativeMatchid;
            let id1StatItem = _.find(match.stats, { id: id1 });
            let id2StatItem = _.find(match.stats, { id: id2 });
            if ((!id1StatItem || !id2StatItem) && condition.comparisonOperator != 'eq')
                continue;
            let id1Stat = id1StatItem[condition.stat] || 0;
            let id2Stat = id2StatItem[condition.stat] || 0;
            if (condition.comparisonOperator == 'gt' && id1Stat <= id2Stat)
                continue;
            if (condition.comparisonOperator == 'lt' && id1Stat >= id2Stat)
                continue;
            if (condition.comparisonOperator == 'eq' && id1Stat != id2Stat)
                continue;
        }

        // if the execution control reached this far, it means that the condition is met
        return true;
    }

    return false;
};

gamecards.publishWinToUser = function (gamecard) {
    // Delay publication so to avoid missing the event on sockets
    // console.log("called to win:" + Date.now());
    setTimeout(function () {
        // console.log("publish:" + Date.now());
        redisPublish.publish("socketServers", JSON.stringify({
            sockets: true,
            clients: [gamecard.userid],
            payload: {
                type: "Card_won",
                client: gamecard.userid,
                room: gamecard.matchid,
                data: gamecards.TranslateUserGamecard(gamecard)
            }
        }));
    }, 2000);
};


gamecards.CheckIfLooses = function (gamecard, isCardTermination, lostTime) {
    const itsNow = lostTime || moment.utc();
    let conditions = gamecard.winConditions;

    if (gamecard.cardType == 'Overall')
        return false;

    // If any winCondition is met then the card is lost
    let isLost = false;
    for (let i = 0; i < conditions.length; i++) {
        let condition = conditions[i];
        let target = condition.target || 0;
        if (isCardTermination == false && condition.conditionNegation == true && condition.remaining == target) {
            isLost = true;
        }
    }

    if (!isLost)
        return false;

    gamecard.status = 2; // terminated
    if (!gamecard.terminationTime)
        gamecard.terminationTime = itsNow.toDate();
    // Award points
    gamecard.pointsAwarded = 0;

    // Before saving, reset any pending specials waiting to be activated: they will never will
    if (gamecard.specials && gamecard.specials.DoublePoints && gamecard.specials.DoublePoints.status == 1)
        gamecard.specials.DoublePoints.status = 0;
    if (gamecard.specials && gamecard.specials.DoubleTime && gamecard.specials.DoubleTime.status == 1)
        gamecard.specials.DoubleTime.status = 0;

    return true;
};



gamecards.GamecardsTerminationHandle = function (mongoGamecards, event, match, cbk) {
    async.each(mongoGamecards, function (gamecard, parallelCbk) {
        if (gamecard.status != 1) {
            async.setImmediate(function () {
                parallelCbk(null);
            });
        }

        let gamecardChanged = false;

        gamecard.terminationConditions.forEach(function (condition) {
            if (condition.stat == event.stat && (condition.playerid == null || condition.playerid == event.playerid) && (condition.teamid == null || condition.teamid == event.teamid)) {
                if (event.statTotal != null) {
                    if (event.statTotal >= condition.remaining) {
                        condition.remaining = 0;
                        gamecardChanged = true;
                    }
                }
                else {
                    condition.remaining -= event.incr;
                    if (condition.remaining <= 0) {
                        condition.remaining = 0;
                    }
                    gamecardChanged = true;
                }
            }
        });

        if (gamecards.CheckIfTerminates(gamecard, match)) {
            if (gamecards.CheckIfWins(gamecard, true, null, match)) {
                // Send an event through Redis pub/sub:
                // log.info("Detected a winning gamecard: " + gamecard);
                gamecardChanged = true;
            }
            else {
                gamecard.terminationTime = moment.utc().toDate();
                gamecard.status = 2;
                gamecard.pointsAwarded = 0;

                // Before saving, reset any pending specials waiting to be activated: they will never will
                if (gamecard.specials && gamecard.specials.DoublePoints && gamecard.specials.DoublePoints.status == 1)
                    gamecard.specials.DoublePoints.status = 0;
                if (gamecard.specials && gamecard.specials.DoubleTime && gamecard.specials.DoubleTime.status == 1)
                    gamecard.specials.DoubleTime.status = 0;

                // Send an event through Redis pu/sub:
                // log.info("Card lost: " + gamecard);
                redisPublish.publish("socketServers", JSON.stringify({
                    sockets: true,
                    clients: [gamecard.userid],
                    payload: {
                        type: "Card_lost",
                        client: gamecard.userid,
                        room: event.matchid,
                        data: gamecards.TranslateUserGamecard(gamecard)
                    }
                }));
                gamecardChanged = true;
            }
        }

        if (event.id && _.indexOf(gamecard.contributingEventIds, event.id) > -1)
            gamecard.contributingEventIds.push(event.id);


        if (gamecardChanged)
            gamecard.save(function (err) {
                if (err) {
                    log.error(err.message);
                    return parallelCbk(err);
                }

                parallelCbk(null);
            });
        else
            async.setImmediate(function () {
                parallelCbk(null);
            });

    }, cbk);
};


// Resolve an incoming event against all gamecard definitions appearConditions, and make any matching definitions visible 
gamecards.GamecardsAppearanceHandle = function (event, match) {


    // TODO: --> ASK: Why is this firing every 100 ms with a minute stat. Is it on purpose or is happening by mistake.
    // Minute and segments are actual stats in match stats. Can't think of any reason for this to be happening. Please explain.

    const CheckAppearConditions = function (gamecard, match) {
        let conditions = gamecard.appearConditions;
        //const isCardTermination = false;

        // If any appearCondition is met, the gamecard definition gets invisible to clients. 
        // TODO: --> ASK: What? Is this a phrasing error? Appear condtitions are conditions to appear. All must be true in order to be visible.
        // Answered it myself. It isn't a phrasing error.
        let conditionIsMet = true;

        // NEW LOGIC:
        // If all conditions are true make the card visible. If any is false make the card invisible. 
        for (let i = 0; i < conditions.length; i++) {
            let condition = conditions[i];
            let target = condition.target || 0;

            // let isConditionComparative = (condition.comparativeTeamid || condition.comparativePlayerid) && condition.comparisonOperator;

            // TODO:  --> ASK: What is this? Is there any negation in appear conditions or any use of remaining for them
            // if (condition.conditionNegation == true || condition.remaining > target)
            //     continue;

            // // if at least one compatative condition exists in the winConditions, then the whole gamecard will not win unless one of the terminationConditions are met.
            // if (isConditionComparative && match) {
            //     let id1 = condition.playerid || condition.teamid || condition.matchid;
            //     let id2 = condition.comparativePlayerid || condition.comparativeTeamid || condition.comparativeMatchid;
            //     let id1StatItem = _.find(match.stats, { id: id1 });
            //     let id2StatItem = _.find(match.stats, { id: id2 });
            //     if ((!id1StatItem || !id2StatItem) && condition.comparisonOperator != 'eq')
            //         continue;
            //     let id1Stat = id1StatItem[condition.stat] || 0;
            //     let id2Stat = id2StatItem[condition.stat] || 0;
            //     if (condition.comparisonOperator == 'gt' && id1Stat <= id2Stat)
            //         continue;
            //     if (condition.comparisonOperator == 'lt' && id1Stat >= id2Stat)
            //         continue;
            //     if (condition.comparisonOperator == 'eq' && id1Stat != id2Stat)
            //         continue;
            // }

            // Appear conditions with my initial requested logic.
            let isComparativeCondition = condition.comparisonOperator ? true : false;

            if (isComparativeCondition && match) {


                // The BY condition
                if (condition.comparisonOperator == 'by' && condition.remaining == 0)
                    return false;

                // All other condtitions
                let id1 = condition.id;
                let id1Stats = _.find(match.stats, function (o) {
                    return (o.id == id1 || o.name == id1);
                });
                let id1Stat = id1Stats ? id1Stats[condition.stat] || 0 : 0;
                let id1Target = condition.statTotal;

                let id2 = condition.id2;
                let id2Stats = _.find(match.stats, function (o) {
                    return (o.id == id2 || o.name == id2);
                });
                let id2Stat = id2Stats ? id2Stats[condition.stat] || 0 : 0;

                if (id2 == null) {
                    if (condition.comparisonOperator == 'eq' && id1Stat != id1Target)
                        return false;
                    if (condition.comparisonOperator == 'gt' && id1Stat < id1Target)
                        return false;
                    // if(gamecard.title.en == "Yellow"){
                    //     console.log("This is a test to see how many times this method is fired.");
                    // }
                    if (condition.comparisonOperator == 'lt' && id1Stat > id1Target)
                        return false;
                }
                else {
                    if (condition.comparisonOperator == 'eq' && id1Stat != id2Stat)
                        return false;
                    if (condition.comparisonOperator == 'gt' && id1Stat < id2Stat)
                        return false;
                    if (condition.comparisonOperator == 'lt' && id1Stat > id2Stat)
                        return false;
                }

                // Implement the Difference Condition
                // e.g. Difference in team goals stat should be lower than 2 
                if (condition.comparisonOperator == 'diff') {
                    if (Math.abs(id1Stat - id2Stat) > id1Target)
                        return false;
                }

            }

            conditionIsMet = true;
        }

        return conditionIsMet;
    };

    const itsNow = moment.utc();

    // ------------
    // TODO: Ask: Why are we narrowing our scope on purpose here? It is fundamentaly the opposite of what we want.
    // ------------

    // --> What Was:
    // const gamecardsQuery = {
    //     isVisible: true,
    //     //creationTime: { $lt: event.time || itsNow },
    //     cardType: 'Overall',
    //     matchid: event.matchid
    // };

    // --> What is:
    const gamecardsQuery = {
        isActive: true,
        //creationTime: { $lt: event.time || itsNow },
        // cardType: 'Overall',
        matchid: event.matchid
    };



    const orPlayerQuery = [{ playerid: null }];
    if (event.playerid != null) {
        orPlayerQuery.push({ playerid: event.playerid });
    }

    const orTeamQuery = [{ teamid: null }];
    if (event.teamid != null) {
        orTeamQuery.push({ teamid: event.teamid });
    }

    // TODO: --> Ask: Why are we narrowing again?
    // gamecardsQuery.appearConditions = { $elemMatch: { $and: [{ stat: event.stat }, { remaining: { $ne: 0 } }, { $or: orPlayerQuery }, { $or: orTeamQuery }] } };

    db.models.gamecardDefinitions.find(gamecardsQuery, function (error, mongoGamecards) {
        if (error) {
            log.error("Error while resolving event: " + error.message);
            return error;
        }

        async.each(mongoGamecards, function (gamecard, cbk) {
            let gamecardChanged = false;

            gamecard.appearConditions.forEach(function (condition) {
                if (condition.stat == event.stat && (condition.playerid == null || condition.playerid == event.playerid) && (condition.teamid == null || condition.teamid == event.teamid)) {

                    if (condition.comparisonOperator == null || condition.comparisonOperator == "by") {
                        if (event.statTotal != null) {
                            if (event.statTotal >= condition.remaining) {
                                condition.remaining = 0;
                                gamecardChanged = true;
                            }
                        }
                        else {
                            condition.remaining -= event.incr;
                            if (condition.remaining <= 0) {
                                condition.remaining = 0;
                            }
                            gamecardChanged = true;
                        }
                    }
                }
            });

            var AppearConditionsPassed = CheckAppearConditions(gamecard, match);

            if (AppearConditionsPassed != gamecard.isVisible) {
                gamecard.markModified('appearConditions');
                // switch the current visibility state
                console.log("Found gamecard [" + gamecard.title.en + "] requiring change in visiblity and changed it to: " + AppearConditionsPassed)
                gamecard.isVisible = AppearConditionsPassed;
                db.models.gamecardDefinitions.findByIdAndUpdate(gamecard._id,{appearConditions: gamecard.appearConditions, isVisible: AppearConditionsPassed},{new:true},function(err, result){
                    if (err)
                        return cbk(err);                    
                    cbk();
                })
                // gamecard.save(function (err) {
                //     if (err)
                //         return cbk(err);
                //     cbk();
                // });
            }
            else
                if (gamecardChanged) {
                    gamecard.markModified('appearConditions');
                    gamecard.save(cbk);
                }
                else {
                    async.setImmediate(function () {
                        return cbk(null);
                    });
                }
        }, function (err) {
            if (err)
                return err;

            return;
        });

    });
};



// Resolve an incoming segment change. The result may be that some cards may be paused (status = 3), or some cards may be resumed (status = 1).
// segmentIndex is the recently modified match state
gamecards.ResolveSegment = function (matchId, segmentIndex) {
    var itsNow = moment.utc();

    if (!matchId || !segmentIndex || _.indexOf([2, 4, 3, 5], segmentIndex) == -1)
        return;

    // First half or second half or overtime ends. Pending userGamecards (status = 0) should be switched to paused (status = 3) and resume as activated after the pause
    var systemTime = itsNow.toDate();
    if (segmentIndex == 2 || segmentIndex == 4) {
        // db.models.userGamecards.update({ matchid: matchId, cardType: { $in: ['Instant', 'PresetInstant'] }, status: { $in: [0, 1] } }, { $set: { status: 3, pauseTime: systemTime } }, function (error, results) {
        // Removed update to status 0 cards in order to fix the issue where presetCards would not activate
        db.models.userGamecards.update({ matchid: matchId, cardType: { $in: ['Instant', 'PresetInstant'] }, status: 1 }, { $set: { status: 3, pauseTime: systemTime } }, function (error, results) {
            if (error) {
                log.error('Failed to pause user gamecards after segment ' + (segmentIndex - 1) + ' ends on match id %s !!!', matchId);
                return error;
            }
        });
    }
    else
        // Second half or Overtime starts
        if (segmentIndex == 3 || segmentIndex == 5) {
            db.models.userGamecards.find({ matchid: matchId, cardType: { $in: ['Instant', 'PresetInstant'] }, status: 3 }, function (error, userGamecards) {
                if (error) {
                    log.error('Failed to resume paused cards after segment ' + segmentIndex + ' starts again on match id %s !!!', matchId);
                    return error;
                }

                async.each(userGamecards, function (userGamecard, callback) {
                    userGamecard.status = 1;
                    userGamecard.resumeTime = systemTime;
                    if (!userGamecard.activationTime || userGamecard.activationTime > userGamecard.pauseTime)
                        userGamecard.activationTime = userGamecard.pauseTime; //  set it like this so as to conclude with a correct new terminationTime (see below)
                    if (userGamecard.terminationTime && userGamecard.activationTime && userGamecard.pauseTime && (!userGamecard.duration == false)) {
                        let start = moment.utc(userGamecard.activationTime);
                        let pause = moment.utc(userGamecard.pauseTime);
                        let pauseDuration = pause.diff(start);
                        let remainingDuration = userGamecard.duration - pauseDuration;
                        userGamecard.terminationTime = itsNow.clone().add(remainingDuration, 'ms').toDate();

                        // Notify clients through socket server
                        redisPublish.publish("socketServers", JSON.stringify({
                            sockets: true,
                            clients: [userGamecard.userid],
                            payload: {
                                type: "Card_resumed",
                                client: userGamecard.userid,
                                room: userGamecard.matchid,
                                data: gamecards.TranslateUserGamecard(userGamecard)
                            }
                        }));

                        return db.models.userGamecards.update({ _id: userGamecard._id }, { $set: { status: userGamecard.status, resumeTime: userGamecard.resumeTime, terminationTime: userGamecard.terminationTime } }, callback);
                    }
                    else {
                        async.setImmediate(function () {
                            callback(null);
                        });
                    }
                });
            });
        }


};


// Resolve an incoming match event and see if some matching wildcards win
gamecards.ResolveEvent = function (matchEvent) {

    const eventSplit = function (compositeEvent) {
        let events = [];
        let eventData = compositeEvent.data;
        for (let name in eventData.stats) {
            let newEvent = {
                id: eventData.id,
                sender: !eventData.sender ? null : eventData.sender,
                matchid: eventData.match_id,
                teamid: eventData.team_id,
                playerid: !eventData.players || eventData.players.length == 0 ? null : eventData.players[0].id,
                stat: name,
                incr: eventData.stats[name],
                state: eventData.state,
                timelineEvent: eventData.timeline_event
            };
            events.push(newEvent);
        };

        return events;
    };

    const gamecardsWinHandle = function (mongoGamecards, event, match, outerCbk) {
        async.each(mongoGamecards, function (gamecard, cbk) {
            if (gamecard.status != 1) {
                async.setImmediate(function () {
                    return cbk();
                });
            }
            gamecard.winConditions.forEach(function (condition) {
                if (condition.stat == event.stat && (condition.playerid == null || condition.playerid == event.playerid) && (condition.teamid == null || condition.teamid == event.teamid)) {
                    condition.remaining -= event.incr;
                    if (condition.remaining <= 0) {
                        condition.remaining = 0;
                    }
                }
            });
            if (gamecards.CheckIfWins(gamecard, false, null, match)) {
                // Send an event through Redis pu/sub:
                // log.debug("Detected a winning gamecard: " + gamecard);
            }
            else
                if (gamecards.CheckIfLooses(gamecard, false)) {
                    // log.info("Card lost: " + gamecard);
                    redisPublish.publish("socketServers", JSON.stringify({
                        sockets: true,
                        clients: [gamecard.userid],
                        payload: {
                            type: "Card_lost",
                            client: gamecard.userid,
                            room: event.matchid,
                            data: gamecards.TranslateUserGamecard(gamecard)
                        }
                    }));
                }
            if (event.id && _.indexOf(gamecard.contributingEventIds, event.id) == -1)
                gamecard.contributingEventIds.push(event.id);

            gamecard.save(function (err) {
                if (err)
                    return cbk(err);
                cbk();
            });
        }, function (err) {
            if (err) {
                log.error(err.message);
                return outerCbk(err);
            }

            outerCbk(null, mongoGamecards);
        });
    };


    // Split stats property in matchEvent.data into individual transformed simpler event objects and loop the resolution logic over each one
    let individualEvents = eventSplit(matchEvent);
    const itsNow = moment.utc();

    if (individualEvents.length == 0)
    {
        log.warn(`No valid events in incoming composite event for gamecards resolution: ${JSON.stringify(matchEvent)}`);
        return;
    }
    const matchId = individualEvents[0].matchid;

    db.models.scheduled_matches
        .findById(matchId, 'state home_team away_team home_score away_score')
        .populate('home_team away_team', 'name')
        .exec(function (matchError, match) {
            if (matchError) {
                log.error(matchError.stack);
                return;
            }

            // Check for winConditions met in userGamecards
            async.each(individualEvents, function (event, callback) {
                try {
                    const gamecardsQuery = {
                        status: 1,
                        creationTime: { $lt: event.time || itsNow },
                        matchid: event.matchid
                    };
                    //const statLogic = [{ stat: event.stat, conditionNegation: false }, { stat: { $ne: event.stat }, conditionNegation: true }];

                    const orPlayerQuery = [{ playerid: null }];
                    if (event.playerid != null) {
                        orPlayerQuery.push({ playerid: event.playerid });
                    }

                    // ToDo: matching the team ids, not 'home' or 'away'

                    const orTeamQuery = [{ teamid: null }];
                    if (event.teamid != null) {
                        orTeamQuery.push({ teamid: event.teamid });
                    }

                    gamecardsQuery.winConditions = { $elemMatch: { $and: [{ stat: event.stat }, { remaining: { $ne: 0 } }, { $or: orPlayerQuery }, { $or: orTeamQuery }] } };
                    let mongoGamecards;
                    db.models.userGamecards.find(gamecardsQuery, function (error, data) {
                        if (error) {
                            log.error("Error while resolving event: " + error.message);
                            return callback(error);
                        }

                        mongoGamecards = data;
                        gamecardsWinHandle(mongoGamecards, event, match, function (err, userCards) {
                            if (err)
                                return callback(error);

                            try {
                                let userCardsLookup = {};
                                _.forEach(userCards, function (userCard) {
                                    if (!userCardsLookup[userCard.id])
                                        userCardsLookup[userCard.id] = userCard;
                                });

                                const wildcardsQuery = {
                                    status: 1,
                                    cardType: "Overall",
                                    creationTime: { $lt: event.time || itsNow },
                                    matchid: event.matchid
                                };

                                const orPlayerQuery = [{ playerid: null }];
                                if (event.playerid != null) {
                                    orPlayerQuery.push({ playerid: event.playerid });
                                }

                                const orTeamQuery = [{ teamid: null }];
                                if (event.teamid != null) {
                                    orTeamQuery.push({ teamid: event.teamid });
                                }

                                wildcardsQuery.terminationConditions = { $elemMatch: { $and: [{ stat: event.stat }, { remaining: { $ne: 0 } }, { $or: orPlayerQuery }, { $or: orTeamQuery }] } };
                                let mongoGamecards;

                                db.models.userGamecards.find(wildcardsQuery, function (error, data) {
                                    if (error) {
                                        log.error("Error while resolving event: " + error.message);
                                        return callback(error);
                                    }

                                    mongoGamecards = data;
                                    _.forEach(mongoGamecards, function (mongoGamecard) {
                                        if (userCardsLookup[mongoGamecard.id])
                                            mongoGamecard = userCardsLookup[mongoGamecard.id];  // replace with object coming from gamecardsWinHandle
                                    });

                                    let finalGamecards = _.filter(mongoGamecards, function (gamecard) {
                                        return !(gamecard.wonTime && gamecard.status == 2);
                                    });


                                    // Fire and forget 
                                    gamecards.GamecardsAppearanceHandle(event, match);

                                    return gamecards.GamecardsTerminationHandle(finalGamecards, event, match, callback);
                                });
                            }
                            catch (innerError) {
                                log.error("Error while resolving event: " + innerError.message);
                                return callback(innerError);
                            }

                        });
                    });
                }
                catch (error) {
                    log.error("Error while resolving event: " + error.message);
                    return callback(error);
                }
            }, function (error) {
                if (error) {
                    log.error(error);
                }

                return;
            });
        });

};




// After modifying the match timeline and the related stats, this method will re-evaluate and resolve all user gamecards for this match from the match start and on.
// In progress.
gamecards.ReEvaluateAll = function (matchId, outerCallback) {

    var WinHandle = function (userGamecards, event, match) {
        _.forEach(userGamecards, function (gamecard) {
            gamecard.winConditions.forEach(function (condition) {
                if (condition.stat == event.stat && (condition.playerid == null || condition.playerid == event.playerid) && (condition.teamid == null || condition.teamid == event.teamid)) {
                    condition.remaining -= event.incr;
                    if (condition.remaining <= 0) {
                        condition.remaining = 0;
                    }
                }
            });
            if (gamecards.CheckIfWins(gamecard, false, moment.utc(event.created), match)) {
                //log.debug("Detected a winning gamecard: " + gamecard.id);
            }
            else
                if (gamecards.CheckIfLooses(gamecard, false, moment.utc(event.created))) {
                    // log.info("Card lost: " + gamecard.id);
                }
            if (event.id && _.indexOf(gamecard.contributingEventIds, event.id) == -1)
                gamecard.contributingEventIds.push(event.id);
        });
    };

    var TerminationHandle = function (userGamecards, event, match) {
        _.forEach(userGamecards, function (gamecard) {
            if (!gamecard.terminationConditions)
                return true;
            gamecard.terminationConditions.forEach(function (condition) {
                if (condition.stat == event.stat && (condition.playerid == null || condition.playerid == event.playerid) && (condition.teamid == null || condition.teamid == event.teamid)) {
                    if (event.statTotal != null) {
                        if (event.statTotal >= condition.remaining) {
                            condition.remaining = 0;
                        }
                    }
                    else {
                        condition.remaining -= event.incr;
                        if (condition.remaining <= 0) {
                            condition.remaining = 0;
                        }
                    }
                }
            });

            if (gamecards.CheckIfTerminates(gamecard, match)) {
                if (gamecards.CheckIfWins(gamecard, true, moment.utc(event.created), match)) {
                    // log.info("Detected a winning gamecard: " + gamecard.id);
                }
                else {
                    gamecard.terminationTime = event.created;
                    gamecard.status = 2;
                    gamecard.pointsAwarded = 0;
                }
            }

            if (event.id && _.indexOf(gamecard.contributingEventIds, event.id) > -1)
                gamecard.contributingEventIds.push(event.id);
        });
    };

    var MatchStatsHandler = function (event, match) {
        var stats = match.stats;

        var matchId = event.matchid;
        var teamId = event.teamid;
        var playerId = event.playerId;
        var stat = event.stat;
        var index = null;

        // Match stat
        if (stat && matchId) {
            index = _.findIndex(stats, { id: matchId });
            if (index > -1) {
                if (!stats[index][stat])
                    stats[index][stat] = event.incr;
                else
                    stats[index][stat] += event.incr;
            }
            else {
                let newStat = {
                    id: matchId,
                    name: 'match'
                };
                newStat[stat] = event.incr;
                stats.push(newStat);
            }
        }

        // Team stat
        if (stat && teamId) {
            index = _.findIndex(stats, { id: teamId });
            if (index > -1) {
                if (!stats[index][stat])
                    stats[index][stat] = event.incr;
                else
                    stats[index][stat] += event.incr;
            }
            else {
                let newStat = {
                    id: teamId,
                    name: event.team
                };
                newStat[stat] = event.incr;
                stats.push(newStat);
            }
        }

        // Player stat
        if (stat && playerId) {
            index = _.findIndex(stats, { id: playerId });
            if (index > -1) {
                if (!stats[index][stat])
                    stats[index][stat] = event.incr;
                else
                    stats[index][stat] += event.incr;
            }
            else {
                let newStat = {
                    id: playerId,
                    name: event.players && event.players[0] && event.players[0].name ? event.players[0].name : playerId
                };
                newStat[stat] = event.incr;
                stats.push(newStat);
            }
        }
    };


    async.parallel([
        (callback) => {
            return db.models.scheduled_matches
                .findById(matchId)
                .populate('home_team away_team', 'name')
                .exec(callback);
        },
        (callback) => {
            return db.models.gamecardDefinitions.find({ matchid: matchId }, callback);
        },
        (callback) => {
            return db.models.userGamecards.find({ matchid: matchId }, callback);
        },
        (callback) => {
            return db.models.scores.find({ game_id: matchId }, callback);
        },
        (callback) => {
            return db.models.useractivities.find({ room: matchId }, callback);
        }
    ], (parallelErr, parallelResult) => {
        if (parallelErr) {
            log.error(parallelErr.stack);
            return outerCallback(parallelErr);
        }

        const match = parallelResult[0];

        if (!match || !match.timeline || match.timeline.length == 0)
            return outerCallback();

        const home_team_id = match.home_team.id;
        const away_team_id = match.away_team.id;

        // Reset userGamecards
        // Reset user stats ?

        // Reset match stats
        match.stats = [];

        const definitionCards = parallelResult[1];

        let definitionsLookup = {};
        _.forEach(definitionCards, function (definition) {
            if (!definitionsLookup[definition.id])
                definitionsLookup[definition.id] = definition;
        });

        const userGamecards = parallelResult[2];

        if (userGamecards.length == 0)
            return outerCallback(null);

        const userScores = parallelResult[3];
        const userActivities = parallelResult[4];

        let totalPointsAwarded = _.sumBy(userGamecards, function (gamecard) {
            return gamecard.pointsAwarded ? gamecard.pointsAwarded : 0;
        });
        let totalCardsWon = _.sumBy(userGamecards, function (gamecard) {
            return gamecard.pointsAwarded && gamecard.pointsAwarded > 0 ? 1 : 0;
        });
        const gamecardsPerUser = _.groupBy(userGamecards, (g) => { return g.userid; });
        let totalPointsAwardedPerUser = _.mapValues(gamecardsPerUser, function (gamecards) {
            return _.sumBy(gamecards, 'pointsAwarded');
        });
        let totalCardsWonPerUser = _.mapValues(gamecardsPerUser, function (gamecards) {
            return _.sumBy(gamecards, function (g) { return g.pointsAwarded && g.pointsAwarded > 0 ? 1 : 0; });
        });

        _.forEach(userGamecards, function (gamecard) {
            gamecard.status = gamecard.activationTime ? 0 : 1;
            gamecard.pointsAwardedInitially = gamecard.pointsAwarded;   // this extra property is for testing only of the re-evaluation accuracy against finally re-evaluated pointsAwarded
            gamecard.pointsAwarded = null;
            gamecard.wonTime = null;
            gamecard.winConditions = null;
            gamecard.terminationConditions = null;
            gamecard.contributingEventIds = [];

            // Restore remaining property in winConditions and terminationConditions
            if (gamecard.gamecardDefinitionId && definitionsLookup[gamecard.gamecardDefinitionId]) {
                let definition = definitionsLookup[gamecard.gamecardDefinitionId];
                if (gamecard.optionId) {
                    let option = _.find(definition.options, { optionId: gamecard.optionId });
                    if (option && option.winConditions)
                        gamecard.winConditions = option.winConditions;
                    if (option && option.terminationConditions)
                        gamecard.terminationConditions = option.terminationConditions;
                }
                if (!gamecard.winConditions && definition.winConditions)
                    gamecard.winConditions = definition.winConditions;
                if (!gamecard.terminationConditions && definition.terminationConditions)
                    gamecard.terminationConditions = definition.terminationConditions;
            }

            // Correct / Rectify activationTime in those PresetInstant cards that is null
            if (gamecard.cardType == 'PresetInstant' && gamecard.minute != 'undefined' && gamecard.minute != null && match.time > gamecard.minute) {
                if (gamecard.minute >= 45 && match.timeline.length >= 4 && match.timeline[3] && match.timeline[3].sport_start_time && match.timeline[3].start && gamecard.minute >= match.timeline[3].sport_start_time) {
                    var newActivationTime = moment.utc(match.timeline[3].start).add(gamecard.minute - match.timeline[3].sport_start_time, 'm').toDate();
                    if (!gamecard.activationTime || (Math.abs(moment.utc(gamecard.activationTime).diff(moment.utc(newActivationTime), 'seconds')) > 60 && !gamecard.resumeTime)) {
                        gamecard.activationTime = moment.utc(match.timeline[3].start).add(gamecard.minute - match.timeline[3].sport_start_time, 'm').toDate();
                        gamecard.terminationTime = moment.utc(gamecard.activationTime).add(gamecard.duration || 0, 'ms').toDate();
                    }
                }
                else if (gamecard.minute < 45 && match.timeline.length >= 2 && match.timeline[1] && match.timeline[1].sport_start_time >= 0 && match.timeline[1].start && gamecard.minute >= match.timeline[1].sport_start_time) {
                    var newActivationTime = moment.utc(match.timeline[1].start).add(gamecard.minute, 'm').toDate();
                    if (!gamecard.activationTime || Math.abs(moment.utc(gamecard.activationTime).diff(moment.utc(newActivationTime), 'seconds')) > 60) {
                        gamecard.activationTime = moment.utc(match.timeline[1].start).add(gamecard.minute, 'm').toDate();
                        gamecard.terminationTime = moment.utc(gamecard.activationTime).add(gamecard.duration || 0, 'ms').toDate();
                    }
                }
            }

        });

        let matchEvents = [];
        if (match.timeline[1] && match.timeline[1].events)
            matchEvents = matchEvents.concat(match.timeline[1].events);
        if (match.timeline[3] && match.timeline[3].events)
            matchEvents = matchEvents.concat(match.timeline[3].events);
        if (match.timeline[5] && match.timeline[5].events)
            matchEvents = matchEvents.concat(match.timeline[5].events);
        if (match.timeline[7] && match.timeline[7].events)
            matchEvents = matchEvents.concat(match.timeline[7].events);

        // Order matchEvents by .created time of appearance
        matchEvents = _.sortBy(matchEvents, function (event) { return event.created; });

        _.forEach(matchEvents, function (eventData) {
            //eventData.id = eventData.id;
            eventData.matchid = eventData.match_id;
            eventData.teamid = !eventData.team ? null : eventData.team == 'home_team' ? home_team_id : away_team_id;
            eventData.playerid = !eventData.players || eventData.players.length == 0 ? null : eventData.players[0].id;
            eventData.stat = _.keys(eventData.stats)[0];
            eventData.incr = _.values(eventData.stats)[0];

            // Adjust creation time to counter delay injected while the event was waiting in the match module queue
            //eventData.created = moment.utc(eventData.created).add(5, 'seconds').toDate();

            MatchStatsHandler(eventData, match);

            let eventRelatedGamecards = null;

            // Check for matched terminations before the event's creation time
            let segmentEvent = {
                matchid: match.id,
                time: null,
                playerid: null,
                teamid: null,
                stat: 'Segment',
                statTotal: eventData.state,
                incr: 1
            };

            let minuteEvent = {
                matchid: match.id,
                time: null,
                playerid: null,
                teamid: null,
                stat: 'Minute',
                statTotal: eventData.time,
                incr: 1
            };
            // Find userGamecards that should be activated and activate them
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                return gamecard.status == 0 && gamecard.activationTime && gamecard.activationTime <= eventData.created;
            });
            _.forEach(eventRelatedGamecards, function (gamecard) {
                gamecard.status = 1;
            });
            // Find all instant gameCards that terminate, and decide if they have won or lost
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                //return (gamecard.cardType == 'Instant' && gamecard.status == 1 && moment.utc(gamecard.activationTime).add(gamecard.activationLatency ? gamecard.activationLatency : 0, 'milliseconds').add(gamecard.duration, 'milliseconds').toDate() < eventData.created);
                return ((gamecard.cardType == 'Instant' || gamecard.cardType == 'PresetInstant') && gamecard.status == 1 && gamecard.terminationTime < eventData.created);
            });
            _.forEach(eventRelatedGamecards, function (gamecard) {
                if (gamecards.CheckIfWins(gamecard, true, moment.utc(gamecard.terminationTime), match)) {
                    //log.info("Detected a winning gamecard: " + gamecard.id);
                }
                else {
                    //gamecard.terminationTime = gamecard.terminationTime;
                    gamecard.status = 2;
                    gamecard.pointsAwarded = 0;
                }
            });

            // Find matched userGamecards that have the segmentEvent stat in their terminationConditions
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                if (gamecard.cardType == 'Overall' && gamecard.status == 1 && gamecard.terminationConditions && gamecard.terminationConditions.length > 0) {
                    let matchedCondition = _.find(gamecard.terminationConditions, { stat: segmentEvent.stat });
                    if (matchedCondition && matchedCondition.remaining > 0 && (!matchedCondition.playerid || matchedCondition.playerid == eventData.playerid) && (!matchedCondition.teamid || matchedCondition.teamid == eventData.teamid)) {
                        return true;
                    }
                }
                return false;
            });
            TerminationHandle(eventRelatedGamecards, segmentEvent, match);
            // Find matched userGamecards that have the minuteEvent stat in their terminationConditions
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                if (gamecard.cardType == 'Overall' && gamecard.status == 1 && gamecard.terminationConditions && gamecard.terminationConditions.length > 0) {
                    let matchedCondition = _.find(gamecard.terminationConditions, { stat: minuteEvent.stat });
                    if (matchedCondition && matchedCondition.remaining > 0 && (!matchedCondition.playerid || matchedCondition.playerid == eventData.playerid) && (!matchedCondition.teamid || matchedCondition.teamid == eventData.teamid)) {
                        return true;
                    }
                }
                return false;
            });
            TerminationHandle(eventRelatedGamecards, minuteEvent, match);


            // Find matched userGamecards that have the event stat in their winConditions
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                if (gamecard.status == 1 && gamecard.winConditions && gamecard.winConditions.length > 0 && (!gamecard.activationTime || gamecard.activationTime <= eventData.created)) {
                    let matchedCondition = _.find(gamecard.winConditions, { stat: eventData.stat });
                    if (matchedCondition && matchedCondition.remaining > 0 && (!matchedCondition.playerid || matchedCondition.playerid == eventData.playerid) && (!matchedCondition.teamid || matchedCondition.teamid == eventData.teamid)) {
                        return true;
                    }
                }
                return false;
            });
            WinHandle(eventRelatedGamecards, eventData, match);
            // Find matched userGamecards that have the event stat in their terminationConditions
            eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                if (gamecard.status == 1 && gamecard.terminationConditions && gamecard.terminationConditions.length > 0 && (!gamecard.activationTime || gamecard.activationTime <= eventData.created)) {
                    let matchedCondition = _.find(gamecard.terminationConditions, { stat: eventData.stat });
                    if (matchedCondition && matchedCondition.remaining > 0 && (!matchedCondition.playerid || matchedCondition.playerid == eventData.playerid) && (!matchedCondition.teamid || matchedCondition.teamid == eventData.teamid)) {
                        return true;
                    }
                }
                return false;
            });
            TerminationHandle(eventRelatedGamecards, eventData, match);

            // Check here card definitions' appearing conditions and alter them if needed
        });

        // Final round of user gamecard resolution after the last match event
        if (match.completed) {
            let matchEndTime = match.timeline ? _.last(match.timeline).start : _.last(matchEvents).created;
            let eventRelatedGamecards = _.filter(userGamecards, function (gamecard) {
                return gamecard.status == 1;
            });
            _.forEach(eventRelatedGamecards, function (gamecard) {
                if (gamecards.CheckIfWins(gamecard, true, moment.utc(matchEndTime), match)) {
                    //log.info("Detected a winning gamecard: " + gamecard.id);
                }
                else {
                    gamecard.terminationTime = matchEndTime;
                    gamecard.status = 2;
                    gamecard.pointsAwarded = 0;
                }
            });
        }


        let reevaluatedTotalPointsAwarded = _.sumBy(userGamecards, function (gamecard) {
            return gamecard.pointsAwarded ? gamecard.pointsAwarded : 0;
        });
        let reevaluatedTotalCardsWon = _.sumBy(userGamecards, function (gamecard) {
            return gamecard.pointsAwarded && gamecard.pointsAwarded > 0 ? 1 : 0;
        });
        log.info('==== Total Points Awarded initially: ' + totalPointsAwarded + ' and after re-evaluation: ' + reevaluatedTotalPointsAwarded);
        log.info('==== Total Cards Won initially: ' + totalCardsWon + ' and after re-evaluation: ' + reevaluatedTotalCardsWon);

        const reevaluatedGamecardsPerUser = _.groupBy(userGamecards, (g) => { return g.userid; });
        const reevaluatedTotalPointsAwardedPerUser = _.mapValues(reevaluatedGamecardsPerUser, function (gamecards) {
            return _.sumBy(gamecards, 'pointsAwarded');
        });
        const reevaluatedTotalCardsWonPerUser = _.mapValues(reevaluatedGamecardsPerUser, function (gamecards) {
            return _.sumBy(gamecards, function (g) { return g.pointsAwarded && g.pointsAwarded > 0 ? 1 : 0; });
        });


        const gamecardsDiffed = _.filter(userGamecards, function (gamecard) {
            return (!gamecard.pointsAwardedInitially && gamecard.pointsAwarded)
                || (gamecard.pointsAwardedInitially && !gamecard.pointsAwarded)
                || (Math.abs((gamecard.pointsAwardedInitially || 0) - (gamecard.pointsAwarded || 0)) > 1);
            //return (gamecard.pointsAwarded ? gamecard.pointsAwarded : 0) != gamecard.pointsAwardedInitially;
        });
        log.info('==== Total Gamecards diffed:   ' + gamecardsDiffed.length);
        _.forEach(gamecardsDiffed, (card) => {
            log.info(`${card.id}\t${card.cardType}\t\t${card.pointsAwarded}\t\t${card.pointsAwardedInitially}`);
        });
        const userIdsDiffed = _.uniq(_.map(gamecardsDiffed, 'userid')); 
        const userGamecardsDiffedPerUser = _.pick(reevaluatedGamecardsPerUser, userIdsDiffed);
        const reevaluatedScorePerUser = _.mapValues(userGamecardsDiffedPerUser, function (gamecards) {
            return _.sumBy(gamecards, 'pointsAwarded');
        });


        async.parallel([
            function (callback) {
                async.eachLimit(userGamecards, 300, function (gamecard, cbk) {
                    gamecard.markModified('winConditions');
                    gamecard.markModified('terminationConditions');
                    gamecard.save((err) => {
                        if (err)
                            log.error(err.stack);
                        return cbk(null);
                    });
                }, callback);
            },
            function (callback) {
                // Save the updated user scores
                return async.eachLimit(userScores, 300, (userScore, cbk) => {
                    const diffedScore = reevaluatedScorePerUser[userScore.user_id];
                    if (diffedScore !== 'undefined' && diffedScore != null) {
                        userScore.score = diffedScore;
                        userScore.save((err) => {
                            if (err)
                                log.error(err.stack);
                            return cbk(null);
                        });
                    }
                    else
                        return async.setImmediate(() => { cbk(null); });

                }, callback);


                //const reevaluatedTotalPointsAwardedPerUser = _.mapValues(reevaluatedGamecardsPerUser, function (gamecards) {
                //    return _.sumBy(gamecards, 'pointsAwarded');
                //});
                //const userIdsAffected = _.keys(reevaluatedTotalPointsAwardedPerUser);
                //const userObjectIdsAffected = _.map(userIdsAffected, mongoose.Types.ObjectId);
                ////scores.update()
                //return callback(null);
            },
            function (callback) {
                // Save the updated user activity collection for the number of won cards per card type in this match
                // Object properties of interest here: cardsWon, instantCardsWon, presetinstantCardsWon, overallCardsWon
                let userPoints = 0;
                let userCardsWon = 0;
                let userInstantCardsWon = 0;
                let userPresetInstantCardsWon = 0;
                let userOverallCardsWon = 0;

                const userActivityLookup = _.keyBy(userActivities, 'user');
                const userIds = _.keys(gamecardsPerUser);
                _.forEach(userIds, function (userId) {
                    const userGroup = gamecardsPerUser[userId];

                    userPoints = _.sumBy(userGroup, 'pointsAwarded');
                    userCardsWon = _.sumBy(userGroup, function (usercard) {
                        return usercard.pointsAwarded && usercard.pointsAwarded > 0 ? 1 : 0;
                    });
                    userInstantCardsWon = _.sumBy(userGroup, function (usercard) {
                        return usercard.pointsAwarded && usercard.pointsAwarded > 0 && usercard.cardType == 'Instant' ? 1 : 0;
                    });
                    userPresetInstantCardsWon = _.sumBy(userGroup, function (usercard) {
                        return usercard.pointsAwarded && usercard.pointsAwarded > 0 && usercard.cardType == 'PresetInstant' ? 1 : 0;
                    });
                    userOverallCardsWon = _.sumBy(userGroup, function (usercard) {
                        return usercard.pointsAwarded && usercard.pointsAwarded > 0 && usercard.cardType == 'Overall' ? 1 : 0;
                    });

                    // Update loaded useractivity documents
                    const mongoActivity = userActivityLookup[userId];
                    if (mongoActivity) {
                        if (userCardsWon > 0 || mongoActivity.cardsWon)
                            mongoActivity.cardsWon = userCardsWon;
                        if (userInstantCardsWon > 0 || mongoActivity.instantCardsWon)
                            mongoActivity.instantCardsWon = userInstantCardsWon;
                        if (userPresetInstantCardsWon > 0 || mongoActivity.presetinstantCardsWon)
                            mongoActivity.presetinstantCardsWon = userPresetInstantCardsWon;
                        if (userOverallCardsWon > 0 || mongoActivity.overallCardsWon)
                            mongoActivity.overallCardsWon = userOverallCardsWon;
                    }
                });
                // Save the updated user activity documents 
                // ToDo
                return async.eachLimit(userActivities, 300, (activity, cbk) => {
                    activity.save((err) => {
                        if (err)
                            log.error(err.stack);
                        return cbk(null);
                    });
                }, callback);
            }
        ], function (error) {
            if (error) {
                log.error(error.stack);
                outerCallback(error);
            }

            outerCallback(null, userGamecards);
        });
    });
};


// the match has ended, now check all activated cards pending resolution, and force resolve them (terminate them either by winning or losing).
gamecards.TerminateMatch = function (match, callback) {

    let itsNow = moment.utc();
    const gamecardsQuery = {
        status: { $in: [1, 3] },
        //cardType: "Overall",
        creationTime: { $lt: itsNow },
        matchid: match.id
    };
    var cardsCount;
    db.models.userGamecards.find(gamecardsQuery, function (error, mongoGamecards) {
        if (error) {
            log.error("Error while resolving event: " + error.message);
            if (callback)
                return callback(error);
            else
                return;
        }

        cardsCount = mongoGamecards.length;

        if (!cardsCount) {
            if (callback)
                return callback(null);
            else
                return;
        }

        mongoGamecards.forEach(function (gamecard) {
            if (gamecards.CheckIfWins(gamecard, true, null, match)) {
                // Send an event through Redis pub/sub:
                // log.info("Detected a winning gamecard: " + gamecard);
            }
            else {
                gamecard.terminationTime = moment.utc().toDate();
                gamecard.status = 2;
                gamecard.pointsAwarded = 0;
                // Send an event through Redis pu/sub:
                // log.info("Card lost: " + gamecard);
                redisPublish.publish("socketServers", JSON.stringify({
                    sockets: true,
                    clients: [gamecard.userid],
                    payload: {
                        type: "Card_lost",
                        client: gamecard.userid,
                        room: gamecard.matchid,
                        data: gamecards.TranslateUserGamecard(gamecard)
                    }
                }));
            }
        });

        async.eachLimit(mongoGamecards, 500, (gamecard, asyncCbk) => {
            gamecard.save(function (err) {
                if (err) {
                    log.error(err.message);
                }
                return asyncCbk(null);
            });
        }, () => {
            if (callback)
                return callback(null);
        });
    });

};



/************************************
 *           Routes                  *
 ************************************/

var app = null;

try {
    app = require('./../../server');
    module.exports = this;
} catch (ex) {
    // Start server
    app = module.exports = exports.app = express.Router();
    var port = process.env.PORT || 8081;
    app.listen(port, function () {
        console.log('Express server listening on port %d in %s mode', port, app.get('env'));
    });
}

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// Loading gamecard API routes
var apiPath = path.join(__dirname, 'api');
fs.readdirSync(apiPath).forEach(function (file) {
    app.use('/', require(apiPath + '/' + file)(gamecards));
});



module.exports = gamecards;
