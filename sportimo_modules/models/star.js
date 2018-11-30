'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.stars)
    module.exports = mongoose.models.stars;
else {

    const titleSchema = new mongoose.Schema({
        pool: { type: String, ref: 'pool' },
        iconUrl: { type: String },
        date: { type: String }, // string representation of endDate formatted as dd/MM/YYYY
        endDate: { type: Date },
        text: { type: Schema.Types.Mixed }
    });


    const userSchema = new mongoose.Schema({
        rank: { type: Number },
        user: { type: String, ref: 'users', required: true },
        starsCount: { type: Number, default: 0 },
        lastStarDate: { type: Date },
        titles: [titleSchema]
    });

    //const starSchema = new Schema({
    //    users: [userSchema]
    //});

    module.exports = mongoose.model('stars', userSchema);
}