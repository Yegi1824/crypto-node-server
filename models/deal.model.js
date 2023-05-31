const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const dealSchema = new Schema({
  tradeID: {type: String, required: true, uniq: true},
  userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true },
  tradeType: { type: String, required: true, enum: ['buy', 'sell'] },
  amount: { type: Number, required: true },
  price: { type: Number, required: true },
  dealOpened: { type: Date, default: Date.now },
  leverage: { type: Number, required: false, default: 1 },
  dealStatus: { type: String, default: 'active', enum: ['active', 'closed'] },
  bDemoAccount: {type: Boolean, default: false},
  stopLoss: {type: String, default: ''},
  takeProfit: {type: String, default: ''},
  sDealResultPNL: {type: String, default: ''}
});

const Deal = mongoose.model('Deal', dealSchema);

module.exports = Deal;
