const express = require('express');
const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const axios = require("axios");
const klineDataCache = new Map();
// let priceChange = 0;
let priceChange = {};
let previousClosePrice = null;

const router = express.Router();

router.post('/requestData', async (req, res) => {
  const {symbol, interval} = req.body;

  try {
    // Fetch historical data
    const historicalData = await fetchBinanceData(symbol, interval);
    const manipulatedData = manipulateData(historicalData, symbol, priceChange);

    // Subscribe to real-time data (simulated)
    const startTime = new Date().getTime();
    const duration = 5 * 60 * 1000; // 5 minutes in milliseconds

    const klineData = klineDataCache.get(symbol);
    if (klineData) {
      handleMessage(
        {
          emit: () => {
          }
        },
        JSON.stringify({k: klineData}),
        symbol,
        startTime,
        duration,
        priceChange
      );
    }

    // Respond with both historical and real-time data
    res.json({historicalData: manipulatedData, realTimeData: klineData});
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

router.post('/requestActiveTradesPrice', async (req, res) => {
  const {symbols} = req.body;
  const interval = '1d';

  let aDataToReturn = [];
  try {
    // Fetch historical data
    for (let nIndex = 0; nIndex < symbols.length; nIndex++) {
      const historicalData = await fetchBinanceData(symbols[nIndex], interval);
      const manipulatedData = manipulateData(historicalData, symbols[nIndex], priceChange);

      aDataToReturn.push({[symbols[nIndex]]: manipulatedData[manipulatedData.length - 1]});

      // Subscribe to real-time data (simulated)
      const startTime = new Date().getTime();
      const duration = 5 * 60 * 1000; // 5 minutes in milliseconds

      const klineData = klineDataCache.get(symbols[nIndex]);
      if (klineData) {
        handleMessage(
          {
            emit: () => {
            }
          },
          JSON.stringify({k: klineData}),
          symbols[nIndex],
          startTime,
          duration,
          priceChange
        );
      }
    }

    // Respond with both historical and real-time data
    res.json({symbolsData: aDataToReturn});
  } catch (err) {
    res.status(500).json({message: err.message});
  }
});

/*
router.post('/setPriceChange', (req, res) => {
  const {priceChange} = req.body;
  setPriceChange(priceChange);
  res.json({message: 'Price change set successfully'});
});
*/

router.post('/setPriceChange', (req, res) => {
  const {symbol, priceChange} = req.body;
  setPriceChange(symbol, priceChange);
  res.json({message: 'Price change set successfully'});
});

/*function setPriceChange(newPriceChange) {
  priceChange = parseFloat(newPriceChange);
}*/
function setPriceChange(symbol, newPriceChange) {
  priceChange[symbol] = parseFloat(newPriceChange);
}

async function fetchBinanceData(symbol, interval) {
  const response = await axios.get('https://api.binance.com/api/v3/klines', {
    params: {
      symbol,
      interval,
    },
  });

  return response.data;
}

function manipulateData(data, symbol, priceChange) {
  // Измените только последнюю свечу
  const lastCandle = data[data.length - 1];
  const closePrice = parseFloat(lastCandle[4]);
  const newClosePrice = closePrice * (1 + (priceChange[symbol] || 0)); /*priceChange*/

  lastCandle[4] = newClosePrice.toFixed(2);

  return data;  // Возвращаем данные без изменения всех свечей
}

function handleMessage(socket, message, symbol, startTime, duration) {
  const parsedMessage = JSON.parse(message);
  const klineData = parsedMessage.k;

  const priceChangeFactor = getPriceChangeFactor(startTime, duration, (priceChange[symbol] || 0));

  // if (symbol === 'BTCUSDT') {
  const closePrice = parseFloat(klineData.c);
  const newClosePrice = closePrice * (1 + priceChangeFactor);
  klineData.c = newClosePrice.toFixed(2);

  if (klineData.x) {
    if (previousClosePrice !== null) {
      klineData.o = previousClosePrice.toFixed(2);
    }
    previousClosePrice = newClosePrice;
  } else {
    if (previousClosePrice) {
      klineData.o = previousClosePrice.toFixed(2);
    }
  }

  // Рассчитываем новые значения для фитиля свечи
  const highPrice = parseFloat(klineData.h);
  const lowPrice = parseFloat(klineData.l);

  const newHighPrice = highPrice * (1 + priceChangeFactor);
  const newLowPrice = lowPrice * (1 + priceChangeFactor);

  // Устанавливаем новые значения для фитилей свечи
  klineData.h = (newHighPrice > newClosePrice) ? newHighPrice.toFixed(2) : newClosePrice.toFixed(2);
  klineData.l = (newLowPrice < newClosePrice) ? newLowPrice.toFixed(2) : newClosePrice.toFixed(2);
  // }

  klineDataCache.set(symbol, klineData);
  socket.emit('realtimeData', klineData);
}

function getPriceChangeFactor(startTime, duration, initialPriceChange) {
  const currentTime = new Date().getTime();
  const elapsedTime = currentTime - startTime;
  if (elapsedTime >= 2 * duration) {
    return 0;
  } else if (elapsedTime <= duration) {
    return (elapsedTime / duration) * initialPriceChange;
  } else {
    return initialPriceChange - ((elapsedTime - duration) / duration) * initialPriceChange;
  }
}

module.exports = router;
