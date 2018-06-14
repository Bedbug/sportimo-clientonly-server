'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema,
ObjectId = Schema.ObjectId,
l=require('../config/lib');

var fields = {
	name: { type: Schema.Types.Mixed },
	text: { type: Schema.Types.Mixed },
	picture: { type: String },
	created: { type: Date , default: Date.now }
};

var prizeSchema = new Schema(fields);

module.exports = mongoose.model('prize', prizeSchema);
