// Module dependencies.
var express = require('express'),
router = express.Router(),
sponsor = require('../apiObjects/sponsor'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.sponsors = function (req, res) {
	var skip=null,limit=10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	sponsor.getAllSponsors(skip,limit,function(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// POST
api.addsponsor = function (req, res) {
	sponsor.addSponsor(req.body.sponsor,function	(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
            res.status(500).json(err);
        }
		else {
			res.status(201).json(data);
		}
	});	
};

// GET
api.sponsor = function (req, res) {
	var id = req.params.id;
	sponsor.getSponsor(id,function(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editSponsor = function (req, res) {
	var id = req.params.id;

	return sponsor.editSponsor(id,req.body.sponsor, function (err, data) {
		if (!err) {
			l.p("updated sponsor");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
		return res.status(200).json(data);   
	});

};

// DELETE
api.deleteSponsor = function (req, res) {
	var id = req.params.id;
	return sponsor.deleteSponsor(id, function (err, data) {
		if (!err) {
			l.p("removed sponsor");
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllSponsors = function (req, res) {
	return sponsor.deleteAllSponsors( function (err, data) {
		if (!err) {
			l.p("removed All sponsor");
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


router.post('/v1/data/sponsors',api.addsponsor);

router.route('/v1/data/sponsors/:id')
.get(api.sponsor)
.put(api.editSponsor)
.delete(api.deleteSponsor);


router.route('/v1/data/sponsors')
.get(api.sponsors)
.delete(api.deleteAllSponsors);


router.get('/sponsors/test',function(req,res){
	return sponsor.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
