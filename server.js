const express = require('express');
const cors = require('cors');
const app = express();
const path = require("path");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: false}));


const mongoose = require('mongoose');

// Connect to MongoDB
const uri = 'mongodb+srv://yegizavr:yegizavr123@cluster0.rgzhbcz.mongodb.net/?retryWrites=true&w=majority';
mongoose.connect(uri, {useNewUrlParser: true, useUnifiedTopology: true});

const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB database connection established successfully');
});

// Auth routes
const authRoutes = require('./routes/auth.route');
app.use('/api/auth', authRoutes);

//RealTime routes
const realtimeDataRoute = require('./routes/realtime.route')
app.use('/api/realtime', realtimeDataRoute);

//Trade routes
const tradeRoute = require('./routes/trade.route')
app.use('/api/trade', tradeRoute);

//Решение ошибка с обновлением страницы (cannot find ....)
app.get('*', (req, res) => {
  let subdomain = req.hostname.split('.')[0];
  if (subdomain === 'shopcryptobroker') {
    res.sendFile('/home/h57967c/public_html/index.html');
  } else if (subdomain === 'startcryptotrade') {
    res.sendFile('/home/???/public_html/index.html');
  } else if (subdomain === 'admin') {
    res.sendFile(`/home/h57967c/admin.shopcryptobroker.com/index.html`);
  }
});

app.get('*', (req, res) => {
  res.sendFile('/home/h57967c/public_html/index.html');
});

module.exports = app;
