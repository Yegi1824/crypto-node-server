const express = require('express');
const axios = require("axios");

const router = express.Router();

router.get('/getAllSymbols', async (req, res) => {
  try {
    let aoSymbols = await getSymbols();
    let filteredResponse_Return = aoSymbols.symbols.map((oSymbols) => {
      if ((oSymbols.permissions.indexOf('TRD_GRP_004') !== -1
        || oSymbols.permissions.indexOf('TRD_GRP_005') !== -1
        || oSymbols.permissions.indexOf('TRD_GRP_006') !== -1) && oSymbols.status === 'TRADING'
      ) {
        return oSymbols.symbol
      }
    }).filter((oSymbol) => {
      return !!oSymbol;
    })

    res.json({symbols: filteredResponse_Return});
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

async function getSymbols() {
  const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');

  return response.data;
}

module.exports = router;
