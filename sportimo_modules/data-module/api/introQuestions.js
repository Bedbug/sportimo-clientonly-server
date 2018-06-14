var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    controller = require('../apiObjects/introQuestions'),
    logger = require('winston'),
     api = {};


api.getAllByMatch = function(req,res){

	var id = req.params.id;

    controller.getAllByMatch(id ,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
}

api.create = function(req, res){
	
	controller.create(req.body,function(err,data){
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
	return controller.update(id,req.body, function (err, data) {
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
	return controller.remove(id, function (err, data) {
		if (!err) {
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/

router.post('/v1/data/inquestions/', api.create);

 router.route('/v1/data/inquestions/:id/match')
 .get(api.getAllByMatch);
 

router.route('/v1/data/inquestions/:id')
    .put(api.update)
    .delete(api.delete);

module.exports = router;