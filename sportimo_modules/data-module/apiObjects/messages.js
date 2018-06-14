var mongoose = require('mongoose'),
  Messages = mongoose.models.messages,
  api = {};

// ALL
api.getAll = function (skip, limit, cb) {
  var q = Messages.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

    q.sort({"created": -1});

  return q.exec(function (err, achievements) {
    cbf(cb, err, achievements);
  });
};

// UPDATE
api.update = function (id, updateData, cb) {
  Messages.findByIdAndUpdate(id, updateData, function (err, update) {
      cbf(cb, err, update.toObject());
  });// eo achievement.find
};

// DELETE
api.remove = function (id, cb) {
  return Messages.findById(id, function (err, message) {
    if(message)
    return message.remove(function (err) {
        cbf(cb, err, true);
    });
    else
      cbf(cb, err, true);
  });
};


// Helper callback method
var cbf = function (cb, err, data) {
  if (cb && typeof (cb) == 'function') {
    if (err) cb(err);
    else cb(false, data);
  }
};



module.exports = api;