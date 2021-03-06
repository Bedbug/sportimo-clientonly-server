// v 0.0.1

/*

 Game Server Modular

 Info:
 This servers has the following modules:
 
    Wildcards - This module's purpose is to register playing cards from the clients
    of the Sporimo app.
 

 Copyright (c) Bedbug 2015
 Author: Aris Brink

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 "Software"), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

var express = require("express"),
    http = require('http'),
    bodyParser = require('body-parser'),
    mongoose = require('mongoose'),
    winston = require('winston'),
    settings = require('./models/settings'),
    morgan = require('morgan');



var app = module.exports = exports.app = express();

/*
 * Delegated this to cluster-startup script

// Create Server
var server = http.createServer(app);
var port = (process.env.PORT || 3030)
app.listen(port, function () {
    console.log("------------------------------------------------------------------------------------");
    console.log("-------  Sportimo v2.0 Game CLIENTS-ONLY Server %s listening on port %d --------", version, port);
    console.log("-------  Environment: " + process.env.NODE_ENV);
    console.log("------------------------------------------------------------------------------------");
});

*/

/*  Winston Logger Configuration */

var logger = new (winston.Logger)({
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

logger.add(winston.transports.Console, {
    timestamp: true,
    level: process.env.LOG_LEVEL || 'debug',
    prettyPrint: true,
    colorize: 'level'
});

if (process.env.NODE_ENV == "production") {
    logger.add(winston.transports.File, {
        prettyPrint: true,
        level: 'core',
        silent: false,
        colorize: false,
        timestamp: true,
        filename: 'debug.log',
        maxsize: 40000,
        maxFiles: 10,
        json: false
    });
}


app.get("/crossdomain.xml", onCrossDomainHandler);

function onCrossDomainHandler(req, res) {
    var xml = '<?xml version="1.0"?>\n<!DOCTYPE cross-domain-policy SYSTEM' +
        ' "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n<cross-domain-policy>\n';
    xml += '<allow-access-from domain="*" to-ports="*"/>\n';
    xml += '</cross-domain-policy>\n';

    req.setEncoding('utf8');
    res.writeHead(200, {
        'Content-Type': 'text/xml'
    });
    res.end(xml);
}


var mongoCreds = require('./config/mongoConfig');

if (!process.env.NODE_ENV)
    process.env.NODE_ENV = "development";

var airbrake;
if (process.env.NODE_ENV == "development") {
    airbrake = require('airbrake').createClient(
        '156316', // Project ID
        'cf1dc9bb0cb48fcfda489fb05683e3e7' // Project key
    );
} else {
    airbrake = require('airbrake').createClient(
        '156332', // Project ID
        '08292120e835e0088180cb09b1a474d0' // Project key
    );
}
airbrake.handleExceptions();
// throw new Error('I am an uncaught exception');

// Setup MongoDB conenction
var mongoConnection = 'mongodb://' + mongoCreds[process.env.NODE_ENV].user + ':' + mongoCreds[process.env.NODE_ENV].password + '@' + mongoCreds[process.env.NODE_ENV].url;
mongoose.Promise = global.Promise;


var leaderboards_module;
var questions_module;
var users_module;
var data_module;
var polls_module;
var early_access_module;
var gamecards;

mongoose.connect(mongoConnection, function (err, res) {
    if (err) {
        console.log('ERROR connecting to: ' + mongoConnection + '. ' + err);
    }
    else {
        console.log("[Game Server] MongoDB Connected.");
        // Module value assignment AFTER database connection is established

        leaderboards_module = require('./sportimo_modules/leaderpay');

        questions_module = require('./sportimo_modules/questions');


        users_module = require('./sportimo_modules/users');

        data_module = require('./sportimo_modules/data-module');

        polls_module = require('./sportimo_modules/polls');

        early_access_module = require('./sportimo_modules/early-access');

        gamecards = require('./sportimo_modules/gamecards');
        gamecards.connect(mongoose);
    }
});



function log(info) {
    //  console.log("[" + Date.now() + "] API CALL: " + info);
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    next();
});

app.use(function (req, res, next) {
    req.mongoose = mongoose.connection;
    next();
});

app.get('/', function (req, res, next) {
    res.send(200, "Sportimo main game server v0.9.2 status is live.");
});

app.use('/static', express.static(__dirname + '/static'));





// Central Error Handling for all Express router endpoints: for Express this should be the last middleware declared:
// See http://expressjs.com/en/guide/error-handling.html
app.use(function (error, request, response, next) {
    logger.error('Error: %s \nStack: %s', error.message, error.stack);

    // In Development environment return the exact error message and stack:
    return response.status(500).json({
        error: {
            message: error.message,
            stack: error.stack
        }
    });

    // In Production environment, return a generic error message:
    //return response.status(500).json({error: 'Oops! The service is experiencing some unexpected issues. Please try again later.'});
});



// ROUTE FOR PLATFORM SETTINGS
// =============================================================================
var router = express.Router();              // get an instance of the express Router

router.get('/', function (req, res) {
    settings.find({}, function (err, result) {
        if (result[0])
            return res.status(200).send(result[0]);
        else return res.status(200).send(result);
    })
});

app.use('/settings', router);

process.on('uncaughtException', (err) => {
    console.error(err);
    throw err;
});

module.exports = app;
