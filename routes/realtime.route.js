const express = require('express');
const axios = require("axios");
const {setPriceChange, resetPriceChanges} = require("../socket");

const router = express.Router();

router.get('/', async (req, res) => {
    const {symbol, timeframe} = req.query;
    try {
        const response = await axios.get('https://api.binance.com/api/v3/klines', {
            params: {
                symbol: symbol,
                interval: timeframe,
            },
        });

        res.send(response.data);
    } catch (error) {
        console.error(`Error fetching historical data for ${symbol}:`, error);
        res.status(500).send({error: 'Error fetching historical data'});
    }
});

router.post('/setPriceChange', (req, res) => {
    const {symbol, priceChange} = req.body;
    setPriceChange(symbol, priceChange);
    res.json({message: 'Price change set successfully'});
});

router.get('/resetPriceChanges', (req, res) => {
    resetPriceChanges();
    res.json({message: 'All price changes reset set successfully'});
});


module.exports = router;
