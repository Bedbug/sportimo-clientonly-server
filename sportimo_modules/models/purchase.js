'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema,
ObjectId = Schema.ObjectId;

var fields = {
	status: { type: String }, // "Inited" / "Pending" / "Completed"
	user: { type: String }, 
	type: { type: String }, // "Subscription" / "Match"
	info: { type: String }, // "Weekly Subscription" / MatchID
	provider: { type: String },
	method: { type: String },
	receiptid: { type: String },
	providerMessage: {type: String},
	created: {type:Date, default: Date.now()}
};

var purchaseSchema = new Schema(fields);

module.exports = mongoose.model('purchase', purchaseSchema);
