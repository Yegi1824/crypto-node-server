const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const walletsNewSchema = new Schema({
    sCurrency: {type: String, required: true},
    sNetwork: {type: String, required: true},
    sWallet: {type: String, required: true},
    sPrivateKey: {type: String, default: ''},
    bMainWallet: {type: Boolean, default: false}
});

const WalletsNew = mongoose.model('WalletsNew', walletsNewSchema);

module.exports = WalletsNew;
