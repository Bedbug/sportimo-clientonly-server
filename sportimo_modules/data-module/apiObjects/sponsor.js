// Module dependencies.
var mongoose = require('mongoose'),
Sponsor = mongoose.models.sponsors,
api = {},
l=require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllSponsors = function (skip,limit,cb) {
  var q=Sponsor.find();
  
  if(skip!=undefined)
    q.skip(skip*1);

  if(limit!=undefined)
    q.limit(limit*1);

  return q.exec(function(err, sponsors) {
    cbf(cb,err,sponsors);    
  });
};

// GET
api.getSponsor = function (id,cb) {

  Sponsor.findOne({ '_id': id }, function(err, sponsor) {
    cbf(cb,err,sponsor);
  });
};

// POST
api.addSponsor = function (sponsor,cb) {

  if(sponsor == 'undefined'){
    cb('No Sponsor Provided. Please provide valid sponsor data.');
  }

  sponsor = new Sponsor(sponsor);

  sponsor.save(function (err) {
    cbf(cb,err,sponsor.toObject());
  });
};

// PUT
api.editSponsor = function (id,updateData, cb) {
  Sponsor.findById(id, function (err, sponsor) {
   
   if(updateData===undefined || sponsor===undefined){
    return cbf(cb,'Invalid Data. Please Check sponsor and/or updateData fields',null); 
  }
  
  
    if(typeof updateData["company"] != 'undefined'){
      sponsor["company"] = updateData["company"];
    }
    
    if(typeof updateData["name"] != 'undefined'){
      sponsor["name"] = updateData["name"];
    }
    
    if(typeof updateData["banner"] != 'undefined'){
      sponsor["banner"] = updateData["banner"];
    }
    
    if(typeof updateData["video"] != 'undefined'){
      sponsor["video"] = updateData["video"];
    }
    
    if(typeof updateData["created"] != 'undefined'){
      sponsor["created"] = updateData["created"];
    }
    

  return sponsor.save(function (err) {
    cbf(cb,err,sponsor.toObject()); 
    }); //eo sponsor.save
  });// eo sponsor.find
};

// DELETE
api.deleteSponsor = function (id,cb) {
  return Sponsor.findById(id).remove().exec(function (err, sponsor) {
   return cbf(cb,err,true);      
 });
};


/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test=function (cb) {
  cbf(cb,false,{result:'ok'});
};


api.deleteAllSponsors = function (cb) {
  return Sponsor.remove({},function (err) {
    cbf(cb,err,true);      
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
 
 var cbf=function(cb,err,data){
  if(cb && typeof(cb)=='function'){
    if(err) cb(err);
    else cb(false,data);
  }
};



module.exports = api;
