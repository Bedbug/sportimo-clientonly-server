var mongoose = require('mongoose'),
  MongoData = mongoose.models.introQuestions,
  api = {};

// ALL
api.getAllByMatch = function (id, cb) {
  
  var q = MongoData.find({matchid: id});

    q.sort({"created": -1});

  return q.exec(function (err, achievements) {
    cbf(cb, err, achievements);
  });
};

// POST
api.create = function (model, cb) {

  if (model == 'undefined') {
    cb('No data Provided. Please provide valid data.');
  }

  var question = new MongoData(model);

  question.save(function (err) {
    cbf(cb, err, question.toObject());
  });
};

// UPDATE
api.update = function (id, updateData, cb) {
  MongoData.findByIdAndUpdate(id, updateData, function (err, update) {
      cbf(cb, err, update.toObject());
  });// eo achievement.find
};

// DELETE
api.remove = function (id, cb) {
  return MongoData.findById(id, function (err, message) {
    return message.remove(function (err) {
        cbf(cb, err, true);
    });
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