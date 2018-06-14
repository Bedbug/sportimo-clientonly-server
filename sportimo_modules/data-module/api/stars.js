// Module dependencies.
var express = require('express'),
    router = express.Router(),
    stars = require('../apiObjects/stars'),
    logger = require('winston'),
    api = {};


api.getAll = function (req, res) {

    stars.getAll(function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
}
/*
api.add = function (req, res) {

    stars.add(req.body, function (err, data) {
        if (err) {
            logger.log('error', err.stack, req.body);
            res.status(500).json(err);
        }
        else {
            res.status(201).json(data);
        }
    });
}

// UPDATE
api.update = function (req, res) {

    var id = req.params.id;
    return stars.update(id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });

};


// DELETE
api.delete = function (req, res) {

    var id = req.params.id;
    return stars.remove(id, function (err, data) {
        if (!err) {
            return res.status(204).send();
        } else {
            l.p(err);
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
};
*/


/*
=====================  ROUTES  =====================
*/

router.get('/v1/data/stars/', api.getAll);

/*
router.post('/v1/data/stars/', api.add);

router.route('/v1/data/stars/:id')
    .put(api.update)
    .delete(api.delete);
*/

module.exports = router;