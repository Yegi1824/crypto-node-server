const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const eventSchema = new Schema({
    userID: {type: String, required: true, unique: true},
    sKey_Type: {type: String, required: true, enum: ['withdraw', 'replenish'] },
    bCompleted: {type: Boolean, required: true, default: false},
    sConfirmed: {type: String, default: ''},
    nSum: {type: Number, required: true, default: 0},
    sWallet: {type: String, required: false, default: ''},
    sDateTime: {type: Date, default: Date.now}
});

const Events = mongoose.model('Events', eventSchema);

module.exports = Events;
