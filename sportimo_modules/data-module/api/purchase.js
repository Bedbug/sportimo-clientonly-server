// Module dependencies.
var express = require('express'),
router = express.Router(),
purchase = require('../apiObjects/purchase'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// GET ALL
api.purchases = function (req, res) {
	var skip=null,limit=10;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	purchase.getAllPurchases(skip,limit, (data) => l.response(res,data) ); 
};

// POST
api.addpurchase = function (req, res) {
    if (req.body == undefined)
        return res.status(400).json(new l.ResponseClass('error', 'Invalid purchase/key model provided', 'There was an error saving this data.').out());

	purchase.addPurchase(req.body,	(data)=>{
        var status = (data.status != 'success') ? 500 : 201;

		res.status(status).json(data);
	});	
};

api.verifySubscription = function (req, res) {
    if (req.body == undefined)
        return res.status(400).json(new l.ResponseClass('error', 'Invalid purchase/key model provided', 'There was an error saving this data.').out());

	purchase.verifySubscription(req.body,	(data)=>{
        var status = (data.status != 'success') ? 500 : 201;

		return res.status(status).json(data);
	});	
};

// GET
api.purchase = function (req, res) {
	var id = req.params.id;
	purchase.getPurchase(id, (data)=>{
		var status=200;

		if(data.status!='success'){
			status=404;
            data.message = 'Not Found Error';
		}

		res.status(status).json(data);
	}); 
};

// PUT
api.editPurchase = function (req, res) {
	var id = req.params.id;

	if(req.body==undefined) {
		var r=new l.ResponseClass('error','Invalid purchase/key model provided','There was an error updating this data.');
		return res.status(400).json(r.out());
	}

	return purchase.editPurchase(id,req.body, (data)=>{
		var status=202;

		//Check if its a 404 error or some other error. Check the apiObjects file for this module
		if(data.status=='error')
			status=(data.data==404)? 404 : 500;

		return res.status(status).json(data);  
	});

};

// DELETE
api.deletePurchase = function (req, res) {
	var id = req.params.id;
	return purchase.deletePurchase(id, (data)=>{
		var status=(data.status!='success')? 500 : 202;
		return res.status(status).json(data); 
	});
};

// DELETE All
api.deleteAllPurchases = function (req, res) {
	return purchase.deleteAllPurchases( (data)=>{
		var status=(data.status!='success')? 500 : 202;
		return res.status(status).json(data);
	});
};


// SEARCH
api.searchPurchases=function(req,res){
	var skip=null,limit=10,keyword='',strict='';

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	if(req.query.keyword!=undefined)
		keyword=req.query.keyword;

	if(req.query.strict!=undefined)
		strict=req.query.strict;
	else
		strict=false;

	strict = (strict=='true' || strict=='True' || strict==1)?true:false;


	var k={};
	var kObj=keyword.split(',').forEach(function(key) {
		var k1=key.split(':');
	      k[k1[0]]=k1[1];
	 });

	purchase.searchPurchases(skip,limit,k,strict, (data) => l.response(res,data) ); 
};




/*
=====================  ROUTES  =====================
*/


router.post('/v1/data/purchase',api.addpurchase);

router.route('/v1/data/purchase/:id')
.get(api.purchase)
.put(api.editPurchase)
.delete(api.deletePurchase);


router.route('/v1/data/purchases')
.get(api.purchases)
.delete(api.deleteAllPurchases);

router.post('/v1/data/subscriptions/verify', api.verifySubscription);

/*
	SEARCH
	e.g.: /api/purchases/search?keyword=first:Sam,last:Jones
 */
router.get('/v1/data/purchases/search',api.searchPurchases);



/* 
//Manual Response Handling
router.get('/purchases/test',function(req,res){

	return purchase.test(function (response) {
		var status=(response.status!='success')? 500 : 200;
		return res.status(status).json(response);
	});
});
*/

//New quick Response Handling
router.get('/v1/data/purchases/test', (req,res)=>
	purchase.test( (data)=>l.response(res,data) )
);

module.exports = router;
