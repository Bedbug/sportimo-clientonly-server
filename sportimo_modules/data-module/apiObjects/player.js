// Module dependencies.
var mongoose = require('mongoose'),
    _ = require('lodash'),
  Player = mongoose.models.players,
  api = {},
  l = require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllPlayers = function (skip, limit, cb) {
  var q = Player.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec(function (err, players) {
    cbf(cb, err, players);
  });
};


// Returns results matching the searchTerm
api.searchPlayers = function (searchTerm, teamId, cb) {
    var query = { $or: [{ 'name.en': new RegExp(searchTerm, 'i') }, { $text: { $search: searchTerm } }] };
    if (teamId)
        query.teamId = teamId;

    Player.find(query)
        .populate('teamId', '_id name parserids logo')
        .limit(100)
        .exec(function (err, players) {
            var playersDto = [];
            _.forEach(players, (player) => {
                var playerDto = player.toObject();
                if (playerDto.teamId && playerDto.teamId.name && playerDto.teamId.name.en)
                    playerDto.team = playerDto.teamId.name.en;
                playerDto.type = 'player';
                playersDto.push(playerDto);
            });
            return cbf(cb, err, playersDto);
        });
}

api.getPlayersByTeam = function (teamid, cb) {
  var q = Player.find({ teamId: teamid });
  
  q.select('name position');
  
  return q.exec(function (err, players) {
    cbf(cb, err, players);
  });
};

// GET
api.getPlayer = function (id, cb) {

  var q = Player.findOne({ '_id': id });

  return q.exec(function (err, players) {
    cbf(cb, err, players);
  });
};

// POST
api.addPlayer = function (player, cb) {

  if (player == 'undefined') {
    cb('No Player Provided. Please provide valid player data.');
  }
  player = new Player(player);
  player.save(function (err) {
    cbf(cb, err, player.toObject());
  });
};

// PUT
api.editPlayer = function (id, updateData, cb) {
  return Player.findByIdAndUpdate(id, updateData,function (err, player) {

 cbf(cb, err, player.toObject());


    
  });// eo player.find
};

// DELETE
api.deletePlayer = function (id, cb) {
  return Player.findById(id).remove().exec(function (err, player) {
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


api.deleteAllPlayers = function (cb) {
  return Player.remove({}, function (err) {
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
