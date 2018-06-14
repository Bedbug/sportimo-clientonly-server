var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    messages = require('../apiObjects/messages'),
    logger = require('winston'),
    api = {};


api.getAllMessages = function(req,res){

    var skip=null, limit = 10;

	if(req.query.skip!=undefined)
		skip = req.query.skip;

	if(req.query.limit!=undefined)
		limit = req.query.limit;


    messages.getAll(skip,limit,function(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
}

// UPDATE
api.updateMessage = function (req, res) {
	var id = req.params.id;
	return messages.update(id,req.body, function (err, data) {
		if (!err) {
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}	
	});

};


// DELETE
api.deleteMessage = function (req, res) {
	var id = req.params.id;
	return messages.remove(id, function (err, data) {
		if (!err) {
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/

 router.route('/v1/data/messages')
 .get(api.getAllMessages);
 


router.route('/v1/data/messages/:id')
    // .get(api.article)
    .put(api.updateMessage)
    .delete(api.deleteMessage);

module.exports = router;