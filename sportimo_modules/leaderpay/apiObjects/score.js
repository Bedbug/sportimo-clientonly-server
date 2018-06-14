// Module dependencies.
var mongoose = require('mongoose'),
Score = mongoose.models.scores,
api = {},
l=require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllScores = function (skip,limit,cb) {
  var q=Score.find();
  
  if(skip!=undefined)
    q.skip(skip*1);

  if(limit!=undefined)
    q.limit(limit*1);

  return q.exec(function(err, scores) {
    cbf(cb,err,scores);    
  });
};

// GET
api.getScore = function (id,cb) {

  Score.findOne({ '_id': id }, function(err, score) {
    cbf(cb,err,score);
  });
};

// POST
api.addScore = function (score,cb) {

  if(score == 'undefined'){
    cb('No Score Provided. Please provide valid score data.');
  }

  score = new Score(score);

  score.save(function (err) {
    cbf(cb,err,score.toObject());
  });
};

api.updateScore = function(uid,room,points, cb){
  // return  cbf(cb,null,"ok"); 
 return Score.AddPoints(uid,room,points, function(err,data){
     cbf(cb,err,data); 
  });
}

// PUT
api.editScore = function (id,updateData, cb) {
  Score.findById(id, function (err, score) {

    
    
      if(typeof updateData["user_id"] != 'undefined'){
        score["user_id"] = updateData["user_id"];
      }
      
      if(typeof updateData["match_id"] != 'undefined'){
        score["match_id"] = updateData["match_id"];
      }
      
      if(typeof updateData["score"] != 'undefined'){
        score["score"] = updateData["score"];
      }
      
      if(typeof updateData["country_id"] != 'undefined'){
        score["country_id"] = updateData["country_id"];
      }
      
      if(typeof updateData["created"] != 'undefined'){
        score["created"] = updateData["created"];
      }
      

    return score.save(function (err) {
      cbf(cb,err,score.toObject()); 
    }); //eo score.save
  });// eo score.find
};

// DELETE
api.deleteScore = function (id,cb) {
  return Score.findById(id, function (err, score) {
    return score.remove(function (err) {
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


api.deleteAllScores = function (cb) {
  return Score.remove({},function (err) {
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
