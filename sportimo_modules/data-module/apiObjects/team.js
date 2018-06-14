// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    Team = mongoose.models.teams,
    api = {},
    parserName = 'Statscore';
var parser = require.main.require('./sportimo_modules/offline_data/parsers/' + parserName);



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllTeams = function (skip, limit, cb) {
  var q = Team.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec(function (err, teams) {
    cbf(cb, err, teams);
  });
};

// GET
api.getTeam = function (id, cb) {
  var q = Team.findById(id);

  q.populate('nextmatch.home_team', 'name logo');
  q.populate('nextmatch.away_team', 'name logo');
  q.populate('lastmatch.home_team', 'name logo');
  q.populate('lastmatch.away_team', 'name logo');
  q.populate('topscorer', 'name uniformNumber pic stats lastActiveSeason')


  q.exec(function (err, team) {
    cbf(cb, err, team);
  });
};

api.getTeamFull = function (id, cb) {

  var q = Team.findById(id);

  q.populate('nextmatch.home_team', 'name logo');
  q.populate('nextmatch.away_team', 'name logo');
  q.populate('lastmatch.home_team', 'name logo');
  q.populate('lastmatch.away_team', 'name logo');
  q.populate('topscorer', 'name uniformNumber pic stats.season.goalsTotal');
  q.populate('topassister', 'name uniformNumber pic stats.season.assistsTotal');

  q.exec(function (err, team) {

    var q = mongoose.models.players.find({ teamId: id });
    q.select('name position pic uniformNumber personalData');
    q.exec(function (err, players) {
      if (team && players)
        team.players = _.sortBy(players, function (element) {

          var rank = {
            "Goalkeeper": 1,
            "Defender": 2,
            "Midfielder": 3,
            "Forward": 4
          };

          return rank[element.position];
        });

      // console.log("-------------------------------------------");
      // console.log(team);
      // console.log("-------------------------------------------");
      cbf(cb, err, team);
    });
  });
};


// Returns results matching the searchTerm
api.searchTeams = function (searchTerm, competitionId, cb) {
    var query = { $or: [{ 'name.en': new RegExp(searchTerm, 'i') }, { $text: { $search: searchTerm } }] };
    if (competitionId)
        query.competitionid = competitionId;

    Team.find(query)
    .exec(function (err, teams) {
        return cbf(cb, err, teams);
    });
}


api.teamFavoriteData = function (id, cb) {

  var q = Team.findOne({_id:id});  
  //q.populate('nextmatch.home_team', 'name logo');
  //q.populate('nextmatch.away_team', 'name logo');
  //q.populate('lastmatch.home_team', 'name logo');
  //q.populate('lastmatch.away_team', 'name logo');
  q.populate('competitionid', 'name parserids');
  q.populate('topscorer', 'name uniformNumber pic stats.season.goalsTotal');
  q.populate('topassister', 'name uniformNumber pic stats.season.assistsTotal');


  q.exec(function (err, team) {
      if (!team.nextmatch || moment.utc(team.nextmatch.eventdate).isBefore(moment.utc().subtract(150, 'm'))) {
      //if (!team.nextmatch || moment.utc(team.nextmatch.eventdate).isBefore(moment.utc().startOf('day'))) {

          if (!team.competitionid && !team.league && !team.leagueids)
              return cbf(cb, '404: There is no league id for this team. Please contact platform administrator to ask for a free soda.', null);

          var leagueId = (team.competitionid.parserids[parserName] || team.league || team.leagueids[0]);
          parser.UpdateTeamStatsFull(leagueId, team.parserids[parserName], null, function (error, response) {
              if (!error && response) {
                  response.topassister = team.topassister;
                  response.topscorer = team.topscorer;
                  response.competitionid = team.competitionid;
              }
              cbf(cb, error, response);
          }, id)
      }
      else {
          team = team.toObject();
          if (team.topscorer) {
              if (!team.topscorer.stats || !team.topscorer.stats.season || !team.topscorer.stats.season.goalsTotal)
                  delete team.topscorer;
          }

          if (team.topassister) {
              if (!team.topassister.stats || !team.topassister.stats.season || !team.topassister.stats.season.assistsTotal)
                  delete team.topassister;
          }

          cbf(cb, err, team);
      }
  });

};


// POST
api.addTeam = function (team, cb) {

  if (team == 'undefined') {
    cb('No Team Provided. Please provide valid team data.');
  }

  team = new Team(team);

  team.save(function (err) {
    cbf(cb, err, team.toObject());
  });
};

// PUT
api.editTeam = function (id, updateData, cb) {

  return Team.findOneAndUpdate({ _id: id }, updateData, function (err, res) {
    cbf(cb, err, res);
  });
  //   Team.findById(id, function (err, team) {

  //    if(updateData===undefined || team===undefined){
  //     return cbf(cb,'Invalid Data. Please Check team and/or updateData fields',null); 
  //   }


  //     if(typeof updateData["name"] != 'undefined'){
  //       team["name"] = updateData["name"];
  //     }

  //     if(typeof updateData["name_en"] != 'undefined'){
  //       team["name_en"] = updateData["name_en"];
  //     }

  //     if(typeof updateData["logo"] != 'undefined'){
  //       team["logo"] = updateData["logo"];
  //     }

  //     if(typeof updateData["league"] != 'undefined'){
  //       team["league"] = updateData["league"];
  //     }

  //     if(typeof updateData["parser"] != 'undefined'){
  //       team["parser"] = updateData["parser"];
  //     }

  //     if(typeof updateData["created"] != 'undefined'){
  //       team["created"] = updateData["created"];
  //     }


  //   return team.save(function (err) {
  //     cbf(cb,err,team.toObject()); 
  //     }); //eo team.save
  //   });// eo team.find
};

// DELETE
api.deleteTeam = function (id, cb) {
  return Team.findById(id).remove().exec(function (err, team) {
    return cbf(cb, err, true);
  });
};


/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test = function (cb) {
  cbf(cb, false, { result: 'ok' });
};


api.deleteAllTeams = function (cb) {
  return Team.remove({}, function (err) {
    cbf(cb, err, true);
  });
};






/*
========= [ UTILITY METHODS ] =========
*/

/** Callback Helper
 * @param  {Function} - Callback Function
 * @param  {Object} - The Error Object
 * @param  {Object} - Data Object
 * @return {Function} - Callback
 */

var cbf = function (cb, err, data) {
  if (cb && typeof (cb) == 'function') {
    if (err) cb(err);
    else cb(false, data);
  }
};



module.exports = api;
