'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


var eventstat = new Schema({
    home_team: { type: String, ref: 'teams' },
    away_team: { type: String, ref: 'teams' },
    start: { type: Date },
    homescore: 0,
    awayscore: 0,
});

if (mongoose.models.teams)
    module.exports = mongoose.models.teams;
else {
    var team = {
        name: { type: Schema.Types.Mixed },
        // No need for short_name property. The abbreviation should be a key 'short' in the 'name' object property
        // that will hold the short name value.
        // short_name: { type: String },
        // Edit: as I found out there are two type of short names. An abbreviation "MUN" and a short name "Man United"
        // the first will have a key 'abbr' and the other 'short' 
        logo: { type: String },
        color: { type: String },
        stats: { type: Schema.Types.Mixed },
        parserids: { type: Schema.Types.Mixed },
        leagueids: { type: Schema.Types.Mixed },
        competitionid: { type: String, ref: 'competitions' },
        recentform: [String], // an array of String of type "W","L","D"
        nextmatch: Schema.Types.Mixed,
        lastmatch: Schema.Types.Mixed,
        standing: {
            type: Schema.Types.Mixed, default: {
                "rank": 0,
                "points": 0,
                "pointsPerGame": "0",
                "penaltyPoints": 0,
                "wins": 0,
                "losses": 0,
                "ties": 0,
                "gamesPlayed": 0,
                "goalsFor": 0,
                "goalsAgainst": 0
            }
        },
        topscorer: { type: String, ref: 'players' },
        topassister: { type: String, ref: 'players' },
        players: [Schema.Types.Mixed],
        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };

    var teamSchema = new Schema(team);

    module.exports = mongoose.model('teams', teamSchema);
}



/**
 *  Definition of team Leicester
 */

// {
//     "_id": {
//         "$oid": "56e81b7c30345c282c01b2d1"
//     },
//     "parserids": {
//         "Stats": 7127
//     },
//     "league": "epl",
//     "logo": null,
//     "name": {
//         "short": "Leicester",
//         "ru": "Leicester City",
//         "ar": "ليستر سيتي",
//         "en": "Leicester City"
//     },
//     "name_en": "Leicester City",
//     "created": {
//         "$date": "2016-03-15T14:26:04.471Z"
//     },
//     "players": [],
//     "recentform": [
//         "W",
//         "L",
//         "D",
//         "L",
//         "W"
//     ],
//     "nextmatch":
//         {
//             "home": "56e81b7c30345c282c01b2d1",
//             "away": "56e81b7c30345c282c01b2d1",
//             "eventdate": "2016-08-15T14:26:04.471Z",
//             "homescore": 0,
//             "awayscore": 0
//         }
//     ,
//     "lastmatch": 
//         {
//             "home": "56e81b7c30345c282c01b2d1",
//             "away": "56e81b7c30345c282c01b2d1",
//             "eventdate": "2016-03-15T14:26:04.471Z",
//             "homescore": 0,
//             "awayscore": 0
//         }
//     ,
//     "standing": {
//         "rank": 1,
//         "teamName": {
//             "ru": "Leicester City",
//             "ar": "ليستر سيتي",
//             "en": "Leicester City"
//         },
//         "teamId": "56e81b7c30345c282c01b2d1",
//         "points": 66,
//         "pointsPerGame": "2.13",
//         "penaltyPoints": 0,
//         "wins": 19,
//         "losses": 3,
//         "ties": 9,
//         "gamesPlayed": 9,
//         "goalsFor": 54,
//         "goalsAgainst": 31
//     },
//     "topscorer": "56ebd1add299e8ed04e93dec",
//     "__v": 0,
//     "competitionid": "56f4800fe4b02f2226646297"
// }
