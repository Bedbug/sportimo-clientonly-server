/*
 * ***********************************************************************
 * Data Module
 *
 * @description :: 
 * 
 * **********************************************************************
 */

'use strict';

// Module dependencies.
var express = require('express'),
    path = require('path'),
    fs = require('fs'),
    methodOverride = require('method-override'),
    bodyParser = require('body-parser'),
    errorhandler = require('errorhandler');
    // cors = require('cors');

var app = null;

try {
    app = require('./../../server');
    module.exports = this;

} catch (ex) {
    // Start server
    app =  module.exports = exports.app = express.Router();
    var port = process.env.PORT || 3000;
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


app.locals.siteName = "data-module";

// var accessLogStream = fs.createWriteStream(__dirname + '/../'+app.locals.siteName+'_access.log', {flags: 'a'})


// Connect to database
// var db = require('./config/db');

app.use(express.static(__dirname + '/public'));

// app.use(function (req, res, next) {
//     res.header("Access-Control-Allow-Origin", "*");
//     res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
//     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//     next();
// });

var env = process.env.NODE_ENV || 'development';

// Bootstrap models
var modelsPath = path.join(__dirname, '../models');
fs.readdirSync(modelsPath).forEach(function (file) {
    require(modelsPath + '/' + file);
});

// Bootstrap routes
var routesPath = path.join(__dirname, 'routes');
fs.readdirSync(routesPath).forEach(function (file) {
    app.use('/', require(routesPath + '/' + file));
});

// Bootstrap api
var apiPath = path.join(__dirname, 'api');
fs.readdirSync(apiPath).forEach(function (file) {
    app.use('/', require(apiPath + '/' + file));
});


app.set('views', __dirname + '/views')
app.set('view engine', 'ejs');