'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var article = {
    publication: { type: Schema.Types.Mixed },
    publishDate: { type: Date},
    type: {type: String},
    photo: { type: String },
    tags: { type: Schema.Types.Mixed },
    created: { type: Date, default: Date.now }
};


var articleSchema = new Schema(article);

module.exports = mongoose.model('articles', articleSchema);
