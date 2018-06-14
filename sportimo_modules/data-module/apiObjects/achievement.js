// Module dependencies.
var mongoose = require('mongoose'),
  Achievement = mongoose.models.achievements,
  User = mongoose.models.users, // get our mongoose model
  api = {},
  l = require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllAchievements = function (skip, limit, cb) {
  var q = Achievement.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec(function (err, achievements) {
    cbf(cb, err, achievements);
  });
};

// GET
api.getAchievement = function (id, cb) {

  Achievement.findOne({ '_id': id }, function (err, achievement) {
    cbf(cb, err, achievement);
  });
};

// POST
api.addAchievement = function (achievement, cb) {

  if (achievement == 'undefined') {
    cb('No Achievement Provided. Please provide valid achievement data.');
  }

  achievement = new Achievement(achievement);

  achievement.save(function (err) {
    cbf(cb, err, achievement.toObject());
  });
};

// PUT
api.editAchievement = function (id, updateData, cb) {
  Achievement.findById(id, function (err, achievement) {



    if (typeof updateData["uniqueid"] != 'undefined') {
      achievement["uniqueid"] = updateData["uniqueid"];
    }

    if (typeof updateData["icon"] != 'undefined') {
      achievement["icon"] = updateData["icon"];
    }

    if (typeof updateData["title"] != 'undefined') {
      achievement["title"] = updateData["title"];
    }

    if (typeof updateData["text"] != 'undefined') {
      achievement["text"] = updateData["text"];
    }

    if (typeof updateData["has"] != 'undefined') {
      achievement["has"] = updateData["has"];
    }

    if (typeof updateData["total"] != 'undefined') {
      achievement["total"] = updateData["total"];
    }

    if (typeof updateData["value"] != 'undefined') {
      achievement["value"] = updateData["value"];
    }

    if (typeof updateData["completed"] != 'undefined') {
      achievement["completed"] = updateData["completed"];
    }

    if (typeof updateData["created"] != 'undefined') {
      achievement["created"] = updateData["created"];
    }


    return achievement.save(function (err) {
      cbf(cb, err, achievement.toObject());
    }); //eo achievement.save
  });// eo achievement.find
};

// DELETE
api.deleteAchievement = function (id, cb) {
  return Achievement.findById(id, function (err, achievement) {
    return achievement.remove(function (err) {
      if (err)
        cbf(cb, err, true);
        
      User.update({ 'achievements._id': id }, { $pull: { achievements: { _id: id } } }, { multi: true }, function (err) {
        cbf(cb, err, true);
      });
    });
  });
};



/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test = function (cb) {
  cbf(cb, false, { result: 'ok' });
};


api.deleteAllAchievements = function (cb) {
  return Achievement.remove({}, function (err) {
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
