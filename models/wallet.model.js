const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const walletSchema = new Schema({
  oWallets: {
    BTC: {
      Bitcoin: String,
      BEP20: String,
      ERC20: String
    },
    USDT: {
      BEP20: String,
      ERC20: String,
      TRC20: String
    },
    ETH: {
      BEP20: String,
      ERC20: String
    },
    BNB: {
      BEP20: String,
      ERC20: String
    }
  }
}, { minimize: false });  // Это опция гарантирует сохранение пустых объектов

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
