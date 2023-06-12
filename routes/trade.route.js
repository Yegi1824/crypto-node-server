const express = require('express');
const axios = require("axios");
const Deal = require("../models/deal.model");

const router = express.Router();

// Создание новой сделки
router.post('/deals/openDeal', async (req, res) => {
  try {
    const newDeal = new Deal(req.body);
    await newDeal.save();
    res.status(201).json(newDeal);
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

// Закрытие сделки
router.put('/deals/closeDeal/:tradeID', async (req, res) => {
  try {
    const tradeID = req.params.tradeID;
    const {sDealResultPNL} = req.body;

    const deal = await Deal.findOneAndUpdate(
        {tradeID: tradeID},
        {dealStatus: 'closed', sDealResultPNL: sDealResultPNL},
        {new: true}
    );

    if (!deal) {
      return res.status(404).json({message: 'Deal not found'});
    }

    res.status(200).json(deal);
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

/*router.get('/getAllSymbols', async (req, res) => {
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
});*/

router.get('/getAllSymbols', async (req, res) => {
  try {
    let aoSymbols = await getSymbolsWithVolume();
    let filteredResponse_Return = aoSymbols.filter(symbol => symbol.quoteVolume > 1500000) // VOLUME_THRESHOLD - это порог объема, который вы установите
        .map(symbol => symbol.symbol);

    res.json({symbols: filteredResponse_Return});
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

async function getSymbolsWithVolume() {
  const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr');
  return response.data.map(symbolInfo => ({
    symbol: symbolInfo.symbol,
    quoteVolume: parseFloat(symbolInfo.quoteVolume),
  }));
}

/*async function getSymbols() {
  const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');

  return response.data;
}*/

module.exports = router;
