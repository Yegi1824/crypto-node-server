const axios = require('axios');
const WebSocket = require('ws');
const socketIo = require('socket.io');
const Deal = require("./models/deal.model");
const User = require("./models/user.model");
const klineDataCache = new Map();
let currentPriceChange = 0;
let priceChange = 0;

function initSocketIO(server) {
    const io = socketIo(server, {
        cors: {
            origin: "*", // или ваш конкретный URL-адрес, если вы хотите ограничить доступ
        }
    });

    async function getCurrentPrice(symbol) {
        const historicalData = await fetchBinanceData(symbol, '15m');
        const manipulatedData = manipulateData(historicalData, symbol, currentPriceChange);
        return manipulatedData[manipulatedData.length - 1][4];
    }

    async function updateAndGetClosedDeals({sID_User}) {
        const closedDeals = await Deal.find(
            {
                dealStatus: 'closed',
                userID: sID_User
            }
        );

        const activeDeals = await Deal.find(
            {
                dealStatus: 'active',
                userID: sID_User
            }
        );
        console.log(new Date() + ':' + '[updateDeals]: activeTradesListChanged')
        io.emit('activeTradesListChanged', activeDeals)

        console.log(new Date() + ':' + '[updateClosedDeals]: closedTradesListChanged')
        io.emit('closedTradesListChanged', closedDeals)
    }

    async function updateAndGetUser(sID_User, sKey_Param, sValue) {
        console.log('[updateAndGetUser], sID_User:', sID_User, 'sKey_Param:', sKey_Param)
        let user_Return;
        if (sKey_Param === 'balance') {
            user_Return = await User.findOneAndUpdate(
                {_id: sID_User},
                {$set: {sBalance: sValue}},
                {new: true}
            )
        } else if (sKey_Param === 'getUser') {
            user_Return = await User.findOne({_id: sID_User})
        }
        console.log('user_Return', user_Return)

        io.emit('userUpdated', user_Return)
    }

    setInterval(async () => {
        // Получение всех активных сделок
        const activeDeals = await Deal.find({dealStatus: 'active'});

        for (const deal of activeDeals) {
            // Получение текущей цены для валютной пары данной сделки
            const currentPrice = await getCurrentPrice(deal.symbol);

            // Проверка условий для закрытия сделки
            if (parseFloat(deal.stopLoss) >= currentPrice || parseFloat(deal.takeProfit) <= currentPrice) {
                // Закрытие сделки и обновление ее в базе данных

                // io.emit('closeDeal', deal.tradeID);

                /*  deal.dealStatus = 'closed';
                  await deal.save();

                  // Здесь вы можете также обновить баланс пользователя и выполнить другие действия
                  // ...

                  // Отправка уведомления пользователю
                  io.to(deal.userID.toString()).emit('dealClosed', deal);*/
            }
        }
    }, 60000); // цикл будет выполняться каждую минуту


    const connections = new Map();
    // Настройка сокета для обмена данными между сервером и клиентом
    io.on('connection', (socket) => {
        console.log('Клиент подключен');
        /*socket.on('changeSymbol', ({symbol, interval}) => {
            // Закрываем предыдущий websocket, если он существует
            /!*if (connections.has(socket.id)) {
                const prevWs = connections.get(socket.id);
                prevWs.on('close', () => {
                    // Создаем новый websocket после закрытия предыдущего
                    setTimeout(() => {
                        const startTime = new Date().getTime();
                        previousClosePrice = null;
                        // Создаем новый websocket после закрытия предыдущего
                        const realtimeWs = subscribeToRealtimeData(socket, symbol, interval, startTime, currentPriceChange);
                        connections.set(socket.id, realtimeWs);
                    }, 500); // Увеличьте задержку, например, до 500 мс
                });
                prevWs.terminate(); // Замените метод close() на terminate()
            } else {
                setTimeout(() => {
                    const startTime = new Date().getTime();
                    previousClosePrice = null;
                    // Создаем новый websocket после закрытия предыдущего
                    const realtimeWs = subscribeToRealtimeData(socket, symbol, interval, startTime, currentPriceChange);
                    connections.set(socket.id, realtimeWs);
                }, 500); // Увеличьте задержку, например, до 500 мс
            }*!/
        });*/
        socket.on('updateClosedDeals', updateAndGetClosedDeals)
        socket.on('updateDeals', async (data) => {
            if (data && data.tradeID) {
                try {
                    await fetchBinanceData(data.symbol, '15m').then((aData) => {
                        if (aData && aData.length) {
                            data.price = aData[aData.length - 1][4];
                        }
                    })

                    const dealAmount = (data.amount * data.leverage);
                    data.sDealResultPNL = await getsDealResultPNL(data.symbol, data.price, dealAmount, data.tradeType);

                    const newDeal = new Deal(data);
                    await newDeal.save();
                    console.log(new Date() + ':' + '[updateDeals]: updateDeals_Success')
                    io.emit('updateDeals_Success', newDeal)

                    const activeDeals = await Deal.find(
                        {
                            dealStatus: 'active',
                            userID: newDeal.userID
                        }
                    );
                    console.log(new Date() + ':' + '[updateDeals]: activeTradesListChanged')
                    io.emit('activeTradesListChanged', activeDeals)

                    //Обновляем пользователя
                    const user = await User.findOne({_id: newDeal.userID});
                    const sUpdatedBalance = Number(Number(user.sBalance) - newDeal.amount).toFixed(2);
                    await updateAndGetUser(newDeal.userID, 'balance', sUpdatedBalance);
                } catch (err) {
                    console.log(new Date() + ':' + '[updateDeals]:', err)
                    io.emit('updateDeals_Failed', err)
                }
            } else if (data.sID_User) {
                const activeDeals = await Deal.find(
                    {
                        dealStatus: 'active',
                        userID: data.sID_User
                    }
                );
                console.log(new Date() + ':' + '[updateDeals]: activeTradesListChanged')
                io.emit('activeTradesListChanged', activeDeals)
            }
        })
        socket.on('closeDeal', async (data) => {
            try {
                const tradeID = data.tradeID;

                const deal = await Deal.findOne({tradeID: tradeID})

                const dealAmount = (deal.amount * deal.leverage);
                const sDealResultPNL = await getsDealResultPNL(deal.symbol, deal.price, dealAmount, deal.tradeType)

                await Deal.updateOne(
                    {tradeID: tradeID},
                    {dealStatus: 'closed', sDealResultPNL: sDealResultPNL},
                    {new: true}
                )

                if (!deal) {
                    console.log(new Date() + ':' + '[closeDeal]:Deal not found')
                    io.emit('closeDeal_Failed', {success: false, message: 'Deal not found'})
                }

                //Успешное закрытие сделки
                console.log(new Date() + ':' + '[closeDeal]:Success,' + data.tradeID)
                io.emit('closeDeal_Success', {success: true})
                //Обновляем пользователя
                const user = await User.findOne({_id: deal.userID});
                const sUpdatedBalance = Number(String(Number(user.sBalance)
                    + deal.amount
                    + await getnDealResultSum(deal.symbol, deal.price, dealAmount, deal.tradeType))).toFixed(2)
                await updateAndGetUser(deal.userID, 'balance', sUpdatedBalance);
                await updateAndGetClosedDeals({sID_User: deal.userID})
            } catch (err) {
                console.log(new Date() + ':' + '[closeDeal]:' + err.message)
                io.emit('closeDeal_Failed', {success: false, message: err.message})
            }
        })
        socket.on('onReplenish', async ({sID_User, nAmountToReplenish}) => {
            try {
                const user = await User.findByIdAndUpdate(
                    sID_User,
                    {
                        $set: {
                            nReplenishAmount: nAmountToReplenish
                        }
                    },
                    {new: true}
                );

                if (!user) {
                    io.emit('replenish_Failed', {success: false, message: 'User not found'})
                }

                io.emit('replenish_Success', {success: true})
            } catch (err) {
                io.emit('replenish_Failed', {success: false, message: err.message})
            }
        })
        socket.on('onWithdraw', async ({sID_User, nAmountToWithdraw, sWallet}) => {
            try {
                const user = await User.findByIdAndUpdate(
                    sID_User,
                    {
                        $set: {
                            nWithdrawAmount: nAmountToWithdraw,
                            sWithdrawWallet: sWallet
                        }
                    },
                    {new: true}
                );

                if (!user) {
                    io.emit('withdraw_Failed', {success: false, message: 'User not found'})
                }

                const sUpdatedBalance = Number(String(Number(user.sBalance) - nAmountToWithdraw)).toFixed(2)
                await updateAndGetUser(user._id, 'balance', sUpdatedBalance);
                io.emit('withdraw_Success', {success: true})
            } catch (err) {
                io.emit('withdraw_Failed', {success: false, message: err.message})
            }
        })
        socket.on('userUpdate', async ({sID_User, sKey_Param}) => {
            console.log(123123, sID_User, sKey_Param)
            await updateAndGetUser(sID_User, sKey_Param)
        })
        socket.on('setPriceChange', (priceChange) => {
            priceChange = parseFloat(priceChange);
            currentPriceChange = priceChange;
            io.emit('priceChange', {priceChange}); // отправляем изменение цены всем клиентам
        });
        socket.on("requestMultiStream", async ({symbols, intervals, userID}) => {
            const startTime = new Date().getTime();
            const realtimeWs = subscribeToMultiStream(symbols, intervals, socket, startTime, currentPriceChange, userID);
            connections.set(socket.id, realtimeWs);
            if (connections.has(socket.id)) {
                const prevWs = connections.get(socket.id);
                prevWs.on('close', () => {
                    const startTime = new Date().getTime();
                    previousClosePrice = null;
                    const realtimeWs = subscribeToMultiStream(symbols, intervals, socket, startTime, currentPriceChange, userID);
                    connections.set(socket.id, realtimeWs);

                });
                prevWs.terminate();
            } else {
                const startTime = new Date().getTime();
                previousClosePrice = null;
                const realtimeWs = subscribeToMultiStream(symbols, intervals, socket, startTime, currentPriceChange, userID);
                connections.set(socket.id, realtimeWs);
            }
        })
        /*socket.on("requestData", async ({symbol, interval}) => {
            const historicalData = await fetchBinanceData(symbol, interval);
            const manipulatedData = manipulateData(historicalData, symbol, currentPriceChange);
            socket.emit("chartData", manipulatedData);
            socket.prevCandleClose = manipulatedData[manipulatedData.length - 1][4];
            socket.priceChangeStartTime = new Date().getTime();
            // Закрываем предыдущий websocket, если он существует
            if (connections.has(socket.id)) {
                const prevWs = connections.get(socket.id);
                prevWs.on('close', () => {
                    const startTime = new Date().getTime();
                    previousClosePrice = null;
                    // Создаем новый websocket после закрытия предыдущего
                    const realtimeWs = subscribeToRealtimeData(socket, symbol, interval, startTime, currentPriceChange);
                    connections.set(socket.id, realtimeWs);
                });
                prevWs.terminate();
            } else {
                const startTime = new Date().getTime();
                previousClosePrice = null;
                const realtimeWs = subscribeToRealtimeData(socket, symbol, interval, startTime, currentPriceChange);
                connections.set(socket.id, realtimeWs);
            }
        });*/
        socket.on('disconnect', () => {
            console.log('Клиент отключен');

            // Закрываем WebSocket при отключении клиента
            if (connections.has(socket.id)) {
                const ws = connections.get(socket.id);
                ws.close();
                connections.delete(socket.id);
            }
        });
    });
    return io;
}

function setPriceChange(newPriceChange) {
    priceChange = parseFloat(newPriceChange);
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

let previousClosePrice = null;

/*function handleMessage(socket, data, symbol, startTime, duration, initialPriceChange) {
    const klineData = data.k;
    const priceChangeFactor = getPriceChangeFactor(startTime, duration, initialPriceChange);
    // if (symbol === 'BTCUSDT') {
        const closePrice = parseFloat(klineData.c);
        const newClosePrice = closePrice * (1 + priceChangeFactor);
        klineData.c = newClosePrice.toFixed(8);
        if (klineData.x) {
            if (previousClosePrice !== null) {
                klineData.o = previousClosePrice.toFixed(8);
            }
            previousClosePrice = newClosePrice;
        } else {
            if (previousClosePrice) {
                klineData.o = previousClosePrice.toFixed(8);
            }
        }
        // Рассчитываем новые значения для фитиля свечи
        const highPrice = parseFloat(klineData.h);
        const lowPrice = parseFloat(klineData.l);
        const newHighPrice = highPrice * (1 + priceChangeFactor);
        const newLowPrice = lowPrice * (1 + priceChangeFactor);
        // Устанавливаем новые значения для фитилей свечи
        klineData.h = (newHighPrice > newClosePrice) ? newHighPrice.toFixed(8) : newClosePrice.toFixed(8);
        klineData.l = (newLowPrice < newClosePrice) ? newLowPrice.toFixed(8) : newClosePrice.toFixed(8);
    // }
    klineDataCache.set(symbol, klineData);
    socket.emit('realtimeData', klineData);
}*/

/*function handleMessage_MultiStream(socket, data, symbol, startTime, duration, initialPriceChange) {
    const klineData = data.k;
    const priceChangeFactor = getPriceChangeFactor(startTime, duration, initialPriceChange);
    // if (symbol === 'BTCUSDT') {
    const closePrice = parseFloat(klineData.c);
    const newClosePrice = closePrice * (1 + priceChangeFactor);
    klineData.c = newClosePrice.toFixed(2);
    if (klineData.x) {
        if (previousClosePrice !== null) {
            klineData.o = previousClosePrice.toFixed(8);
        }
        previousClosePrice = newClosePrice;
    } else {
        if (previousClosePrice) {
            klineData.o = previousClosePrice.toFixed(8);
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
    socket.emit('realtimeData_MultiStream', klineData);
}*/
async function handleMessage_MultiStream(socket, data, symbol, startTime, duration, initialPriceChange, userID) {
    const klineData = data.k;
    const priceChangeFactor = getPriceChangeFactor(startTime, duration, initialPriceChange);

    // Рассчитываем новые значения для открытия, максимума и минимума свечи
    const openPrice = parseFloat(klineData.o);
    const highPrice = parseFloat(klineData.h);
    const lowPrice = parseFloat(klineData.l);
    const newOpenPrice = openPrice * (1 + priceChangeFactor);
    const newHighPrice = highPrice * (1 + priceChangeFactor);
    const newLowPrice = lowPrice * (1 + priceChangeFactor);

    klineData.o = newOpenPrice.toFixed(2);
    klineData.h = newHighPrice.toFixed(2);
    klineData.l = newLowPrice.toFixed(2);

    // Рассчитываем новую цену закрытия
    const closePrice = parseFloat(klineData.c);
    const newClosePrice = closePrice * (1 + priceChangeFactor);
    klineData.c = newClosePrice.toFixed(2);

    if (klineData.x) {
        previousClosePrice = newClosePrice;
    }

    const activeDeals = await Deal.find(
        {
            dealStatus: 'active',
            userID: userID
        }
    );

    if (activeDeals && activeDeals.length) {
        for (let i = 0; i < activeDeals.length; i++) {
            if (activeDeals[i].symbol ===  klineData.s) {
                const dealAmount = (activeDeals[i].amount * activeDeals[i].leverage)
                const sDealResultPNL = await getsDealResultPNL(activeDeals[i].symbol
                    , activeDeals[i].price
                    , dealAmount
                    , activeDeals[i].tradeType)
                activeDeals[i].sDealResultPNL = sDealResultPNL;

                await Deal.updateOne(
                    {tradeID: activeDeals[i].tradeID},
                    {sDealResultPNL: sDealResultPNL}
                )

                socket.emit('activeTradesListChanged', activeDeals)
            }
        }
    }

    klineDataCache.set(symbol, klineData);
    socket.emit('realtimeData_MultiStream', klineData);
}


function subscribeToMultiStream(symbols, intervals, socket, startTime, initialPriceChange, userID) {
    const streams = symbols.map(symbol => intervals.map(interval => `${symbol.toLowerCase()}@kline_${interval}`)).flat();

    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;

    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log(`WebSocket opened for multi stream, symbols: ${symbols}`);
    });

    ws.on('message', async (message) => {
        const parsedMessage = JSON.parse(message);
        const symbol = parsedMessage.data.s;
        const data = parsedMessage.data;

        const duration = 2 * 60 * 1000; // 5 минут в миллисекундах
        await handleMessage_MultiStream(socket, data, symbol, startTime, duration, initialPriceChange, userID);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for multi stream:`, error);
    });

    return ws;
}

/*function subscribeToRealtimeData(socket, symbol, interval, startTime, initialPriceChange) {
    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => {
        console.log(`WebSocket opened for ${symbol} @ ${interval}`);
    });
    const duration = 2 * 60 * 1000; // 5 минут в миллисекундах
    ws.on('message', (message) => {
        handleMessage(socket, message, symbol, startTime, duration, initialPriceChange);
    });
    ws.on('error', (error) => {
        console.error(`WebSocket error for ${symbol} @ ${interval}:`, error);
    });
    return ws;
}*/

async function fetchBinanceData(symbol, interval) {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
        params: {
            symbol,
            interval,
        },
    });
    return response.data;
}

async function getnDealResultSum(symbol, openPrice, dealAmount, dealType) {
    let nDealResultSum_Return = '';
    await fetchBinanceData(symbol, '15m').then((aData) => {
        if (aData && aData.length) {
            let nLastPrice = aData[aData.length - 1][4];
            let nPriceDifference;
            if (dealType === 'buy') {
                nPriceDifference = nLastPrice - openPrice;
            } else if (dealType === 'sell') {
                nPriceDifference = openPrice - nLastPrice;
            }

            let nPnlPercentage = (nPriceDifference * 100) / openPrice;
            nDealResultSum_Return = Number((dealAmount * nPnlPercentage / 100).toFixed(2));
        }
    })

    return nDealResultSum_Return;
}

async function getsDealResultPNL(symbol, openPrice, dealAmount, dealType) {
    let sExpectedPNL_Return = '';
    await fetchBinanceData(symbol, '15m').then((aData) => {
        if (aData && aData.length) {
            let nLastPrice = aData[aData.length - 1][4];
            let nPriceDifference;
            if (dealType === 'buy') {
                nPriceDifference = nLastPrice - openPrice;
            } else if (dealType === 'sell') {
                nPriceDifference = openPrice - nLastPrice;
            }

            let nPnlPercentage = (nPriceDifference * 100) / openPrice;
            sExpectedPNL_Return = nPnlPercentage.toFixed(2) + '%' + ' ' + '( ' + (dealAmount * nPnlPercentage / 100).toFixed(2) + '$ )';
        }
    })

    return sExpectedPNL_Return;
}

function manipulateData(data, symbol, priceChange) {
    let adjustedClosePrices = [];
    return data.map((candle, index) => {
        const closePrice = parseFloat(candle[4]);
        const newClosePrice = closePrice * (1 + priceChange);
        adjustedClosePrices[index] = newClosePrice.toFixed(8);
        if (index > 0) {
            candle[1] = adjustedClosePrices[index - 1];
        }
        candle[4] = adjustedClosePrices[index];
        return candle;
    });
}

// Экспортируем функцию initSocketIO, которая будет вызвана в index.js с сервером в качестве аргумента
module.exports = {initSocketIO, setPriceChange};
