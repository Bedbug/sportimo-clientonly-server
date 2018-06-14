var express = require('express'),
    router = express.Router(),
    path = require("path"),
    fs = require("fs"),
    async = require('async'),
    log = require('winston');


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



// POST //function(competitionId, season, schedulePattern, callback)
api.AddSchedule = function(req, res) {
    if (!req.body.methodName)  
        return res.status(400).json({ error: "No 'methodName' body property defined in the request path." });
    if (!req.params.competitionId)  
        return res.status(400).json({ error: "No 'competitionId' id parameter defined in the request path." });
    if (!req.body || !req.body.season)  
        return res.status(400).json({ error: "No 'season' body property defined in the request body." });
    if (!req.body || !req.body.pattern)  
        return res.status(400).json({ error: "No 'pattern' body property defined in the request body." });
        
    var method = 'parser.' + res.body.methodName;

    // UpdateTeams for each supported parser
    var response = { error: null, parsers: {} };
    var methodLocated = false;

    try {
        // ToDo: maybe change the sequential order, and break the loop when the first parser completes the action without error.
        async.eachSeries(parsers, function (parser, callback) {
            if (method === 'function')
            {
                methodLocated = true;
                method(req.params.competitionId, req.body.season, req.body.pattern, function (error, result) {
                    if (!error) {
                        response.parsers[parser.Name] = result;
    
                        callback(null);
                    }
                    else {
                        log.warn('Error calling ' + method + ' for parser ' + parser.Name + ': ' + error.message);
                        response.parsers[parser.Name] = {
                            error: error.message
                        };
                        callback(null);
                    }
                });
            }
            else
                return async.setImmediate(function() {
                    callback(null); 
                });
        }, function done(error) {
            if (error) {
                response.error = error.message;
                return res.status(500).json(response);
            }
            else
            {
                if (methodLocated == false)
                    return res.status(400).json({ error: "methodName " + res.body.methodName + " body property defined in the request body is not a proper parser function." });
                else
                    return res.status(200).json(response);
            }
        });
    }
    catch (error) {
        response.error = error.message;
        return res.status(500).json(response);
    }    
};



// update the team standings of the selected competition (id)
router.post('/schedule/:competitionId', api.AddSchedule);

module.exports = router;