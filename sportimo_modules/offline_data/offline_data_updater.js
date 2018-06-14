var path = require('path'),
    fs = require('fs');

var http = require('http'),
    express = require('express');

var bodyParser = require('body-parser');
    
var app = express();


// Create Server
var server = http.createServer(app);
var port = (process.env.PORT || 8080); // 3030);
server.listen(port, function () {
        //console.log('Express server listening on port %d in %s mode', port, app.get('env') || 'development');
        console.log('Express server listening on port %d', port);
    });


app.use(bodyParser.json());


// Recursively add router paths
var apiPath = path.join(__dirname, 'api');
    fs.readdirSync(apiPath).forEach(function (file) {
        app.use('/offline_data/', require(apiPath + '/' + file));
    });


var mongoose = require('./config/db.js');
// mongoose.mongoose.models. ...
    
var offlineDataUpdater = {};

offlineDataUpdater.Init = function()
{
};

var stats = require("./parsers/Stats.js");
//stats.TestGuruStats(function() {});

var statscore = require('./parsers/Statscore');

//var competitionId = "56f4800fe4b02f2226646297";	// Premier League
//var competitionId = "577ec1011916317238fd2f33";	// Germany Bundesliga
//var competitionId = "577ec1381916317238fd2f34";	// Italy serie A
//var competitionId = "577ec1a61916317238fd2f36";	// Spain Liga Primera
//var competitionId = "580b8731971f4ca44b4f63e8";	// Saudi Professional League
//var competitionId = "588a71ec971f4ca44b4f67e0";	// UAE Arabian Gulf League
//var competitionId = "588a7345971f4ca44b4f67e1";	// Egypt Premier League
//var competitionId = "577ec2f71916317238fd2f39";	// Champions League
//var competitionId = "577ec33d1916317238fd2f3a";	// Europa League
//var competitionId = "5aaf6a958b3e30b41dab995f";	// France League 1
var competitionId = "577ec22b1916317238fd2f37";	// World Cup 2018


setTimeout(() => {
    //statscore.UpdateTeamPlayersCareerStats("588a8d890bb50f00feda8dbe", 29362, (err, playersUpdated) => {
    //statscore.TestGuruStats((err) => {
    statscore.UpdateTeams(competitionId, (err, result) => {
    //statscore.UpdateAllCompetitionStats(competitionId, 2018, (err, result) => {
    //stats.UpdateAllCompetitionStats(competitionId, 2017, (err, result) => {
    //statscore.UpdateLeagueStandings(null, competitionId, 2018, (err, result) => {
    //statscore.GetCompetitionFixtures(competitionId, 2017, (err, result) => {
    //statscore.GetLeagueSeasonEvents(29860, (err, result) => {
    //statscore.UpdateTeamAndPlayerMappings(competitionId, (err, result) => {
    //statscore.UpdateTeamStatsFull({ id: '1507', seasonid: '29655' }, 136934, 2017, (err, result) => {
    //statscore.UpdatePlayerNamesLocale(competitionId, 'ar', (err, result) => {
        if (err)
            console.error(err.stack);
    });
}, 5000);

//statscore.UpdateLeagueStandings(null, '56f4800fe4b02f2226646297', 2017, function (err) {
//    if (err)
//        console.error(err.stack);
//});



module.exports = offlineDataUpdater;