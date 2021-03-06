'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

/**
 * example:
 * {
 *      "text":{en:"Which player will be teh one to score?"},
 *      "answers": [
 *          { "_id": "56a38549e4b067030e9f871d", "text": {"en":"Messi"}, "img": "photo_of_Messi.jpg", "points":50 },
 *          { "_id": "56a38549e4b067030e9f871a", "text": {"en":"Alves"}, "img": "photo_of_Alves.jpg", "points":350 },
 *          { "_id": "56a38549e4b067030e9f871k", "text": {"en":"YourMother"}, i"mg: "photo_of_YourMother.jpg", "points":1000 },
 *      ]
 *      "type": "rewarded",
 *      "status": 1,
 *      "correct": "56a38549e4b067030e9f871d"
 * }
 */
var answer = new Schema({
    text: { type: Schema.Types.Mixed },
    img: String,
    points: Number,
    answered: {type:Number,default:0}
})

var fields = {
    text: { type: Schema.Types.Mixed },
    answers: [answer],
    matchid: String,
    type: {type: String},
    img: { type: String },
    status: Number,
    correct: ObjectId,
    sponsor: { type: Schema.Types.Mixed },
    userAnswer: String,
    created: { type: Date, default: Date.now }
    
};



var schema = new Schema(fields);

module.exports = mongoose.model('questions', schema);
