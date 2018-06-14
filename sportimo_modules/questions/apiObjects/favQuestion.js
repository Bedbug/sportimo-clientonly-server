// Module dependencies.
var mongoose = require('mongoose'),
    Question = mongoose.models.favQuestions,
    _ = require('lodash'),
    api = {},
    l = require('../config/lib');


/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllQuestions = function(skip, limit, cb) {
    var q = Question.find();

    if (skip != undefined)
        q.skip(skip * 1);

    if (limit != undefined)
        q.limit(limit * 1);

    return q.exec(function(err, questions) {
        cbf(cb, err, questions);
    });
};

api.getAllQuestionsByMatch = function(id, cb) {
    var q = Question.find({matchid: id});

    return q.exec(function(err, questions) {
        cbf(cb, err, questions);
    });
};

// GET
api.getQuestion = function(id, cb) {

    Question.findOne({ '_id': id }, function(err, question) {
        cbf(cb, err, question);
    });
};

// POST
api.addQuestion = function(question, cb) {

    if (question == 'undefined') {
        cb('No Question Provided. Please provide valid question data.');
    }

    question = new Question(question);

    question.save(function(err) {
        
        cbf(cb, err, question.toObject());
    });
};



// PUT
api.editQuestion = function(id, updateData, cb) {
    Question.findById(id, function(err, question) {

            if (typeof updateData["text"] != 'undefined') {
                question["text"] = updateData["text"];
            }

            if (typeof updateData["answers"] != 'undefined') {
                question["answers"] = updateData["answers"];
            }

            if (typeof updateData["matchid"] != 'undefined') {
                question["matchid"] = null;
            }

            if (typeof updateData["type"] != 'undefined') {
                question["type"] = updateData["type"];
            }

            if (typeof updateData["img"] != 'undefined') {
                question["img"] = updateData["img"];
            }
            
             if (typeof updateData["sponsor"] != 'undefined') {
                question["sponsor"] = updateData["sponsor"];
            }

            if (typeof updateData["created"] != 'undefined') {
                question["created"] = mull;
            }
            
            
            if (typeof updateData["status"] != 'undefined') {
                question["status"] = 0;
            }


            return question.save(function(err) {
                cbf(cb, err, question.toObject());
            }); //eo question.save
        
    });// eo question.find
};

// DELETE
api.deleteQuestion = function(id, cb) {
    return Question.findById(id, function(err, question) {
        return question.remove(function(err) {
            cbf(cb, err, true);
        });
    });
};



/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test = function(cb) {
    cbf(cb, false, { result: 'ok' });
};


api.deleteAllQuestions = function(cb) {
    return Question.remove({}, function(err) {
        cbf(cb, err, true);
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

var cbf = function(cb, err, data) {
    if (cb && typeof (cb) == 'function') {
        if (err) cb(err);
        else cb(false, data);
    }
};



module.exports = api;
