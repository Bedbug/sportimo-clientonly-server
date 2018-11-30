var mongoose = require('mongoose'),
  Stars = mongoose.models.stars,
  api = {};

// ALL
api.getAll = function (cb) {
    //var q = Stars.findOne({});
    //q.populate('users.user', { username: 1, level: 1, picture: 1 });

    //return q.exec(function (err, starsDoc) {
    //    if (!starsDoc)
    //        cbf(cb, err, []);

    //    cbf(cb, err, starsDoc.users);
    //});

    Stars.find({ user: { $ne: null } })
        .populate({ path: 'user', select: 'username level picture' })
        .sort({ rank: 1 })
        .exec(cb);
};


// Helper callback method
var cbf = function (cb, err, data) {
  if (cb && typeof (cb) == 'function') {
    if (err) cb(err);
    else cb(false, data);
  }
};



module.exports = api;