const axios = require('axios');
const WebSocket = require('ws');
const socketIo = require('socket.io');
const Deal = require("./models/deal.model");
const User = require("./models/user.model");
const klineDataCache = new Map();
let priceChange = {};

function initSocketIO(server) {
    const io = socketIo(server, {
        cors: {
            origin: "*",
        }
    });

    async function handleMessage_MultiStream(socket, data, symbol, initialPriceChange, userID) {
        let klineData = data.k;
        klineData = await manipulateKlineData(klineData, symbol, initialPriceChange);

        const activeDeals = await Deal.find(
            {
                dealStatus: 'active',
                userID: userID
            }
        );

        if (activeDeals && activeDeals.length) {
            for (let i = 0; i < activeDeals.length; i++) {
                if (activeDeals[i].symbol === klineData.s) {
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

    function subscribeToMultiStream(symbols, intervals, socket, startTime, userID) {
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
            const initialPriceChange = (priceChange[data.s] || 0)

            await handleMessage_MultiStream(socket, data, symbol, initialPriceChange, userID);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for multi stream:`, error);
        });

        return ws;
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

    async function getsDealResultPNL(symbol, openPrice, dealAmount, dealType) {
        let sExpectedPNL_Return = '';
        let nLastPrice = await getCurrentPrice(symbol)
        let nPriceDifference;
        if (dealType === 'buy') {
            nPriceDifference = nLastPrice - openPrice;
        } else if (dealType === 'sell') {
            nPriceDifference = openPrice - nLastPrice;
        }

        let nPnlPercentage = (nPriceDifference * 100) / openPrice;
        sExpectedPNL_Return = nPnlPercentage.toFixed(2) + '%' + ' ' + '( ' + (dealAmount * nPnlPercentage / 100).toFixed(2) + '$ )';
        // }
        // })

        return sExpectedPNL_Return;
    }

    /*function manipulateData(data, symbol, priceChange) {
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
    }*/

    /*function manipulateData(data, symbol, priceChange) {
        // Измените только последнюю свечу
        const lastCandle = data[data.length - 1];
        const closePrice = parseFloat(lastCandle[4]);
        const newClosePrice = closePrice * (1 + (priceChange[symbol] || 0)); /!*priceChange*!/

        lastCandle[4] = newClosePrice.toFixed(2);

        return data;  // Возвращаем данные без изменения всех свечей
    }*/

    async function manipulateKlineData(klineData, symbol, initialPriceChange) {
        const updatedKlineData = {...klineData};

        if (klineData && klineData.c) {
            // Закрывающая цена
            const closePrice = parseFloat(updatedKlineData.c);
            const newClosePrice = closePrice * (1 + initialPriceChange);
            updatedKlineData.c = newClosePrice.toFixed(2);

            // Цена высокая
            const highPrice = parseFloat(updatedKlineData.h);
            const newHighPrice = highPrice * (1 + initialPriceChange);
            updatedKlineData.h = (newHighPrice > newClosePrice) ? newHighPrice.toFixed(2) : newClosePrice.toFixed(2);

            // Цена низкая
            const lowPrice = parseFloat(updatedKlineData.l);
            const newLowPrice = lowPrice * (1 + initialPriceChange);
            updatedKlineData.l = (newLowPrice < newClosePrice) ? newLowPrice.toFixed(2) : newClosePrice.toFixed(2);
        } else if (klineData && klineData.length) {
            // Закрывающая цена
            const closePrice = parseFloat(klineData[4]);
            const newClosePrice = closePrice * (1 + initialPriceChange);
            updatedKlineData[4] = newClosePrice.toFixed(2);

            // Цена высокая
            const highPrice = parseFloat(klineData[2]);
            const newHighPrice = highPrice * (1 + initialPriceChange);
            updatedKlineData[2] = (newHighPrice > newClosePrice) ? newHighPrice.toFixed(2) : newClosePrice.toFixed(2);

            // Цена низкая
            const lowPrice = parseFloat(klineData[3]);
            const newLowPrice = lowPrice * (1 + initialPriceChange);
            updatedKlineData[3] = (newLowPrice < newClosePrice) ? newLowPrice.toFixed(2) : newClosePrice.toFixed(2);
        }

        return updatedKlineData;
    }

    async function manipulateData(data, symbol, initialPriceChange) {
        const lastCandle = data[data.length - 1];
        data[data.length - 1] = await manipulateKlineData(lastCandle, symbol, initialPriceChange);
        return data;
    }

    async function getCurrentPrice(symbol) {
        const historicalData = await fetchBinanceData(symbol, '15m');
        const manipulatedData = await manipulateData(historicalData, symbol, (priceChange[symbol] || 0));
        return manipulatedData[manipulatedData.length - 1][4];
    }

    async function getnDealResultSum(symbol, openPrice, dealAmount, dealType) {
        let nLastPrice = await getCurrentPrice(symbol)
        let nPriceDifference;
        if (dealType === 'buy') {
            nPriceDifference = nLastPrice - openPrice;
        } else if (dealType === 'sell') {
            nPriceDifference = openPrice - nLastPrice;
        }

        let nPnlPercentage = (nPriceDifference * 100) / openPrice;
        return Number((dealAmount * nPnlPercentage / 100).toFixed(2));
    }

    async function updateAndGetClosedDeals({sID_User}) {
        const user = await User.findById(sID_User);

        const closedDeals = await Deal.find(
            {
                dealStatus: 'closed',
                userID: sID_User,
                bDemoAccount: user.bDemoAccount
            }
        );

        const activeDeals = await Deal.find(
            {
                dealStatus: 'active',
                userID: sID_User,
                bDemoAccount: user.bDemoAccount
            }
        );
        console.log(new Date() + ':' + '[updateDeals]: activeTradesListChanged')
        io.emit('activeTradesListChanged', activeDeals)

        console.log(new Date() + ':' + '[updateClosedDeals]: closedTradesListChanged')
        io.emit('closedTradesListChanged', closedDeals)

        io.emit('closeDeal_Success', {success: true})
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
            user_Return = await User.findById(sID_User);
        } else if (sKey_Param === 'balanceDemo') {
            user_Return = await User.findOneAndUpdate(
                {_id: sID_User},
                {$set: {sBalance_Demo: sValue}},
                {new: true}
            )
        }

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
        console.log(`Клиент подключен. ID: ${socket.id}, время: ${new Date()}`);

        socket.on('updateClosedDeals', updateAndGetClosedDeals)
        socket.on('updateDeals', async (data) => {
            if (data && data.tradeID) {
                try {
                    data.price = await getCurrentPrice(data.symbol)

                    const dealAmount = (data.amount * data.leverage);
                    data.sDealResultPNL = await getsDealResultPNL(data.symbol, data.price, dealAmount, data.tradeType);

                    const newDeal = new Deal(data);
                    await newDeal.save();
                    console.log(new Date() + ':' + '[updateDeals]: updateDeals_Success')
                    io.emit('updateDeals_Success', newDeal)
                    io.emit('addDeal_Success', {success: true})
                    const user = await User.findById(newDeal.userID);

                    const activeDeals = await Deal.find(
                        {
                            dealStatus: 'active',
                            userID: newDeal.userID,
                            bDemoAccount: user.bDemoAccount
                        }
                    );
                    console.log(new Date() + ':' + '[updateDeals]: activeTradesListChanged')
                    io.emit('activeTradesListChanged', activeDeals)

                    //Обновляем пользователя
                    if (user.bDemoAccount) {
                        const sUpdatedBalance = Number(Number(user.sBalance_Demo) - newDeal.amount).toFixed(2);
                        await updateAndGetUser(newDeal.userID, 'balanceDemo', sUpdatedBalance);
                    } else {
                        const sUpdatedBalance = Number(Number(user.sBalance) - newDeal.amount).toFixed(2);
                        await updateAndGetUser(newDeal.userID, 'balance', sUpdatedBalance);
                    }
                } catch (err) {
                    console.log(new Date() + ':' + '[updateDeals]:', err)
                    io.emit('updateDeals_Failed', err)
                    io.emit('addDeal_Failed', {success: false, message: err.message})
                }
            } else if (data.sID_User) {
                const user = await User.findById(data.sID_User);

                const activeDeals = await Deal.find(
                    {
                        dealStatus: 'active',
                        userID: data.sID_User,
                        bDemoAccount: user.bDemoAccount
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
                //Обновляем пользователя
                const user = await User.findById(deal.userID);
                if (user.bDemoAccount) {
                    const sUpdatedBalance = Number(String(Number(user.sBalance_Demo)
                        + deal.amount
                        + await getnDealResultSum(deal.symbol, deal.price, dealAmount, deal.tradeType))).toFixed(2)
                    await updateAndGetUser(deal.userID, 'balanceDemo', sUpdatedBalance, true);
                    await updateAndGetClosedDeals({sID_User: deal.userID})
                } else {
                    const sUpdatedBalance = Number(String(Number(user.sBalance)
                        + deal.amount
                        + await getnDealResultSum(deal.symbol, deal.price, dealAmount, deal.tradeType))).toFixed(2)
                    await updateAndGetUser(deal.userID, 'balance', sUpdatedBalance, false);
                    await updateAndGetClosedDeals({sID_User: deal.userID})
                }
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
            await updateAndGetUser(sID_User, sKey_Param)
        })
        // socket.on('setPriceChange', setPriceChange);
        socket.on("requestMultiStream", async ({symbols, intervals, userID}) => {
            if (connections.has(socket.id)) {
                const prevWs = connections.get(socket.id);
                // Только если WebSocket открыт, попытаться его завершить
                if (prevWs.readyState === WebSocket.OPEN) {
                    prevWs.on('close', () => {
                        const startTime = new Date().getTime();
                        const realtimeWs = subscribeToMultiStream(symbols, intervals, socket, startTime, userID);
                        connections.set(socket.id, realtimeWs);
                    });
                    prevWs.terminate();
                }
            } else {
                const startTime = new Date().getTime();
                const realtimeWs = subscribeToMultiStream(symbols, intervals, socket, startTime, userID);
                connections.set(socket.id, realtimeWs);
            }
        });

        socket.on('disconnect', () => {
            console.log(`Клиент отключен. ID: ${socket.id}, время: ${new Date()}\``);

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

function setPriceChange(symbol, newPriceChange) {
    console.log('symbol', symbol)
    console.log('newPriceChange', newPriceChange)
    priceChange[symbol] = parseFloat(newPriceChange);
    console.log('priceChange', priceChange)
}

// Экспортируем функцию initSocketIO, которая будет вызвана в index.js с сервером в качестве аргумента
module.exports = {initSocketIO, setPriceChange};