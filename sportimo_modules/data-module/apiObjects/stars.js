var mongoose = require('mongoose'),
  Stars = mongoose.models.stars,
  api = {};

// ALL
api.getAll = function (cb) {
    var q = Stars.findOne({});
    q.populate('users.user', { username: 1, level: 1, picture: 1 });

    return q.exec(function (err, starsDoc) {
        if (!starsDoc)
            cbf(cb, err, []);

        cbf(cb, err, starsDoc.users);
    });
};

/*
// CREATE
api.add = function (item, cb) {

    if (!item) {
        cb('Invalid star user data.');
    }

    star = new Stars(item);

    star.save((err, saved) => {
        cbf(cb, err, saved.toObject());
    });
};

// UPDATE
api.update = function (id, updateData, cb) {
    Stars.findByIdAndUpdate(id, updateData, function (err, update) {
      cbf(cb, err, update.toObject());
  });// eo achievement.find
};

// DELETE
api.remove = function (id, cb) {
    return Stars.findById(id, function (err, item) {
        if (item)
            return item.remove(function (err) {
            cbf(cb, err, true);
        });
    else
      cbf(cb, err, true);
  });
};
*/

// Helper callback method
var cbf = function (cb, err, data) {
  if (cb && typeof (cb) == 'function') {
    if (err) cb(err);
    else cb(false, data);
  }
};



module.exports = api;