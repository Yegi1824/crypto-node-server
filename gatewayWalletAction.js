const config = require('./walletsConfig');
const Web3 = require('web3').default;
const TronWeb = require('tronweb');
const BigNumber = require('bignumber.js');
const bitcoin = require('bitcoinjs-lib');
const {ECPairFactory} = require('ecpair');
const ecc = require('tiny-secp256k1');
const bip32 = require('bip32');
const axios = require('axios');

const ECPair = ECPairFactory(ecc); // Создаем экземпляр API ECPair
let isBitcoinTransactionPending = false;

const checkBitcoinBalanceAndTransfer = async (networkConfig) => {
    try {
        if (isBitcoinTransactionPending) {
            console.log('Previous transaction is still pending');
            return;
        }

        const mainnet = bitcoin.networks.bitcoin;

        // Проверка баланса
        const response = await axios.get(`${networkConfig.providerUrl}/addrs/${networkConfig.gatewayWalletAddress}`);
        const balance = response.data.final_balance;
        console.log(`Bitcoin Balance: ${balance} satoshis`);

        // Получение рекомендуемых ставок комиссий
        const feeData = await axios.get('https://api.blockcypher.com/v1/btc/main');
        const highPriorityFeePerKb = feeData.data.high_fee_per_kb; // satoshis per kilobyte
        const mediumPriorityFeePerKb = feeData.data.medium_fee_per_kb; // satoshis per kilobyte

        // Выбор ставки комиссии (высокий или средний приоритет)
        const feePerKb = highPriorityFeePerKb;

        // Перевод, если баланс больше нуля
        if (balance > 0) {
            isBitcoinTransactionPending = true;
            // Получение UTXOs
            const utxoResponse = await axios.get(`${networkConfig.providerUrl}/addrs/${networkConfig.gatewayWalletAddress}?unspentOnly=true`);
            const utxos = utxoResponse.data.txrefs;

            const keyPair = ECPair.fromWIF(networkConfig.gatewayWalletPrivateKey, mainnet);
            const psbt = new bitcoin.Psbt({network: mainnet});

            for (let utxo of utxos) {
                // Get the full transaction data
                const txResponse = await axios.get(`${networkConfig.providerUrl}/txs/${utxo.tx_hash}`);

                const script = txResponse.data.outputs[utxo.tx_output_n].script;
                const value = txResponse.data.outputs[utxo.tx_output_n].value;

                // Add the input with the full transaction buffer
                psbt.addInput({
                    hash: utxo.tx_hash,
                    index: utxo.tx_output_n,
                    witnessUtxo: {
                        script: Buffer.from(script, 'hex'),
                        value: value
                    }
                });
            }

            // Вычисление комиссии на основе размера транзакции и рекомендуемой ставки
            const estimatedInputSize = 148; // bytes
            const estimatedOutputSize = 34; // bytes

            const estimatedTxSize = (utxos.length * estimatedInputSize) + (1 * estimatedOutputSize); // 1 output

            // const estimatedTxSize = psbt.estimateSize(); // в байтах
            const fee = Math.ceil((estimatedTxSize / 1024) * feePerKb); // округляем вверх до ближайшего сатоши
            const totalUtxos = utxos.reduce((acc, utxo) => acc + utxo.value, 0);
            const transferAmount = totalUtxos - fee;

            // Добавление выхода
            psbt.addOutput({
                address: networkConfig.mainWalletAddress,
                value: transferAmount
            });

            // Подпись каждого входа
            for (let i = 0; i < utxos.length; i++) {
                psbt.signInput(i, keyPair);
            }

            // Финализация всех входов (это может также проверить подписи)
            psbt.finalizeAllInputs();

            // Получение готовой транзакции в виде hex
            const transactionHex = psbt.extractTransaction().toHex();

            // Отправка транзакции
            const sendTxResponse = await axios.post(`${networkConfig.providerUrl}/txs/push`, {
                tx: transactionHex
            });
            console.log(`Transaction sent with txid: ${sendTxResponse.data.tx.hash}`);

            // Проверка статуса транзакции, пока она не будет подтверждена
            const checkTransactionStatus = async (txid) => {
                const txInfo = await axios.get(`${networkConfig.providerUrl}/tx/${txid}`);
                if (txInfo.data.confirmations > 0) {
                    console.log(`Transaction ${txid} is confirmed.`);
                    isBitcoinTransactionPending = false;
                } else {
                    console.log(`Transaction ${txid} is still unconfirmed. Retrying in 10 seconds.`);
                    setTimeout(() => checkTransactionStatus(txid), 10000);
                }
            }

            await checkTransactionStatus(sendTxResponse.data.tx.hash);
        } else {
            console.log('No funds to transfer');
            // Сбрасываем статус, так как баланс отсутствует
            isBitcoinTransactionPending = false;
        }
    } catch (error) {
        console.error('Error during Bitcoin balance check and transfer:', error);
        // Сбрасываем статус, так как произошла ошибка
        isBitcoinTransactionPending = false;
    }
};

//TRON
const checkTronBalanceAndTransfer = async (networkConfig) => {
    try {
        const tronWeb = new TronWeb({
            fullHost: networkConfig.providerUrl,
            privateKey: networkConfig.gatewayWalletPrivateKey
        });

        const contract = await tronWeb.contract().at(networkConfig.contractAddress);

        // Проверка баланса
        let balance = await contract.balanceOf(networkConfig.gatewayWalletAddress).call();
        console.log(`Tron Balance: ${balance.toString()} (${networkConfig.networkType})`);

        //Для уведомления в TG:
        /*const decimals = 6; // количество десятичных знаков для USDT
        const balanceInUsdt = balance.toString() / Math.pow(10, decimals);
        console.log(`Tron Balance: ${balanceInUsdt} USDT`);*/

        // Перевод, если баланс больше нуля
        const feelLimit = 40000000;
        if (balance.gt(0)) {
            try {
                // Вызов метода transfer контракта токена TRC20
                const transaction = await contract.transfer(
                    networkConfig.mainWalletAddress,
                    balance
                ).send({
                    from: networkConfig.gatewayWalletAddress,
                    feeLimit: feelLimit
                });

                console.log(`Funds transferred: ${JSON.stringify(transaction)}`);
            } catch (error) {
                console.error('Error during transfer:', error);
            }
        } else {
            console.log('No funds to transfer');
        }
    } catch (error) {
        console.error('Error during Tron balance check and transfer:', error);
    }
};

//Ethereum
const checkEthereumBalanceAndTransfer = async (networkConfig) => {
    try {
        const web3 = new Web3(networkConfig.providerUrl);

        let balance;

        if (networkConfig.contractABI && networkConfig.contractAddress) {
            const contract = new web3.eth.Contract(networkConfig.contractABI, networkConfig.contractAddress);
            balance = await contract.methods.balanceOf(networkConfig.gatewayWalletAddress).call();
            balance = new BigNumber(balance); // Convert balance to BN for easy manipulation
        } else {
            const balanceInWei = await web3.eth.getBalance(networkConfig.gatewayWalletAddress);
            balance = new BigNumber(web3.utils.toWei(balanceInWei, 'ether'));
        }

        console.log(`Ethereum Balance: ${balance.toString()} (${networkConfig.networkType})`);

        if (balance.isGreaterThan(0)) {
            const gasPrice = await web3.eth.getGasPrice();
            let gasLimit = 21000;

            const rawTransaction = {
                from: networkConfig.gatewayWalletAddress,
                to: networkConfig.mainWalletAddress,
                value: '0x0',
                gasPrice: web3.utils.toHex(gasPrice)
            };

            if (networkConfig.contractABI && networkConfig.contractAddress) {
                const contract = new web3.eth.Contract(networkConfig.contractABI, networkConfig.contractAddress);
                rawTransaction.data = contract.methods.transfer(networkConfig.mainWalletAddress, '0x' + new BigNumber(balance).toString(16)).encodeABI();
                rawTransaction.to = networkConfig.contractAddress; // Send to the contract address
                gasLimit = await contract.methods.transfer(networkConfig.mainWalletAddress, '0x' + new BigNumber(balance).toString(16)).estimateGas({from: networkConfig.gatewayWalletAddress});
            } else {
                rawTransaction.value = web3.utils.toHex(balance.toString());
            }

            rawTransaction.gasLimit = web3.utils.toHex(gasLimit);

            const signedTransaction = await web3.eth.accounts.signTransaction(
                rawTransaction,
                networkConfig.gatewayWalletPrivateKey
            );

            const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);

            console.log(`Funds transferred: ${receipt.transactionHash}`);
        }
    } catch (error) {
        console.error('Error during balance check and transfer:', error);
    }
};

// Запуск функции для каждой сети из конфигурации
for (const network in config.networks) {
    if (config.networks[network].networkType === 'ethereum' || config.networks[network].networkType === 'bsc') {
        setInterval(() => checkEthereumBalanceAndTransfer(config.networks[network]), 10000);
    } else if (config.networks[network].networkType === 'tron') {
        setInterval(() => checkTronBalanceAndTransfer(config.networks[network]), 10000);
    } else if (config.networks[network].networkType === 'bitcoin') {
        setInterval(() => checkBitcoinBalanceAndTransfer(config.networks[network]), 10000);
    }
}