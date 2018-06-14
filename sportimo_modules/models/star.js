'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.stars)
    module.exports = mongoose.models.stars;
else {

    const titleSchema = new mongoose.Schema({
        iconUrl: { type: String },
        date: { type: String },
        text: { type: Schema.Types.Mixed }
    });


    const userSchema = new mongoose.Schema({
        rank: { type: Number },
        user: { type: String, ref: 'users', required: true },
        titles: [titleSchema]
    });

    const starSchema = new Schema({
        users: [userSchema]
    });

    module.exports = mongoose.model('stars', starSchema);
}