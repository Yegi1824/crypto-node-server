const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Schema = mongoose.Schema;

const userSchema = new Schema({
  sName: {type: String, required: true, trim: true},
  sSurname: {type: String, required: true, trim: true},
  sEmail: {type: String, required: true, unique: true, trim: true},
  sNumber: {type: String, required: true, unique: true, trim: true},
  sPassword: {type: String, required: true, trim: true},
  sBalance: {type: String, default: '0', trim: true},
  oVerificationDocuments: {type: [String], default: []},
  bVerificationDocumentsSubmitted: {type: Boolean, default: false, required: false},
  sVerificationConfirmed: {type: String, default: 'false', trim: true},
  nReplenishAmount: {type: Number, default: 0},
  nWithdrawAmount: {type: Number, default: 0},
  sWithdrawWallet: {type: String, default: ''},
  sProfilePhoto: {type: String, default: ''},
  bDemoAccount: {type: Boolean, default: false},
  sBalance_Demo: {type: String, default: '10000'},
  sLastSocketID: {type: String, default: ''},
  sDateTime_Registered: {type: Date, default: Date.now}
});

// Compare password method
userSchema.methods.comparePassword = function (candidatePassword) {
  const user = this;
  return bcrypt.compare(candidatePassword, user.sPassword);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
