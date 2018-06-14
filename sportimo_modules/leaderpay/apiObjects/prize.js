// Module dependencies.
var mongoose = require('mongoose'),
Prize = mongoose.models.prize,
api = {},
l=require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllPrizes = function (skip,limit,cb) {
  var q=Prize.find();
  
  if (skip)
    q.skip(skip*1);

  if (limit)
    q.limit(limit*1);

  return q.exec(function(err, prizes) {
    cbf(cb,err,prizes);    
  });
};

// GET
api.getPrize = function (id,cb) {

  Prize.findOne({ '_id': id }, function(err, prize) {
    cbf(cb,err,prize);
  });
};

// POST
api.addPrize = function (prize,cb) {
  // console.log(prize);
  prize = new Prize(prize);

  prize.save(function (err) {
    cbf(cb,err,prize.toObject());
  });
};

// PUT
api.editPrize = function (id,updateData, cb) {
  Prize.findById(id, function (err, prize) {

    
    
      if(typeof updateData["name"] != 'undefined'){
        prize["name"] = updateData["name"];
      }
      
      if(typeof updateData["text"] != 'undefined'){
        prize["text"] = updateData["text"];
      }
      
      if(typeof updateData["picture"] != 'undefined'){
        prize["picture"] = updateData["picture"];
      }
      
      if(typeof updateData["created"] != 'undefined'){
        prize["created"] = updateData["created"];
      }
      

    return prize.save(function (err) {
      cbf(cb,err,prize.toObject()); 
    }); //eo prize.save
  });// eo prize.find
};

// DELETE
api.deletePrize = function (id,cb) {
  return Prize.findById(id, function (err, prize) {
    return prize.remove(function (err) {
      cbf(cb,err,true);      
    });
  });
};



/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test=function (cb) {
  cbf(cb,false,{result:'ok'});
};


api.deleteAllPrizes = function (cb) {
  return Prize.remove({},function (err) {
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
