const { ethers } = require('ethers');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  BASE_GAS_PRICE: ethers.parseUnits('1.2', 'gwei'), // Base gas price in Gwei
  GAS_PRICE_INCREMENT: ethers.parseUnits('0.0000001', 'gwei'), // 0.00001 Gwei increment per tx
  MAX_GAS_PRICE: ethers.parseUnits('2', 'gwei'), // Max gas price cap in Gwei
  EXPLORER_URL: 'https://seitrace.com',
  BATCH_SIZE: 10,
  TOTAL_TX: 1000,
  DELAY_BETWEEN_BATCHES: 1000,
  AMOUNT_TO_BRIDGE: '0.000001',
};

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static increaseGasPrice(baseGasPrice, increment, txCount) {
    baseGasPrice = BigInt(baseGasPrice);
    increment = BigInt(increment);

    let increasedGasPrice = baseGasPrice + (increment * BigInt(txCount));

    if (increasedGasPrice > BigInt(CONFIG.MAX_GAS_PRICE)) {
      increasedGasPrice = BigInt(CONFIG.MAX_GAS_PRICE);
    }

    return increasedGasPrice;
  }
}

// ========== SIMPLIFIED LOGGER ==========
class Logger {
  static log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
  }

  static info(msg) { this.log(`ℹ ${msg}`); }
  static error(msg) { this.log(`✗ ${msg}`); }
  static success(msg) { this.log(`✓ ${msg}`); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  static async sendTransaction(wallet, to, amount, nonce, gasPrice, options = {}) {
    try {
      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice: gasPrice,
        nonce: nonce,
        ...options
      });

      const receipt = await tx.wait();
      return {
        success: true,
        receipt,
        txHash: tx.hash,
        nonce
      };
    } catch (error) {
      return {
        success: false,
        error,
        nonce
      };
    }
  }
}

// ========== NONCE MANAGER ==========
class NonceManager {
  constructor(wallet) {
    this.wallet = wallet;
    this.currentNonce = null;
    this.lock = false;
  }

  async getNextNonce() {
    while (this.lock) {
      await Utils.delay(100);
    }

    this.lock = true;
    try {
      if (this.currentNonce === null) {
        this.currentNonce = await this.wallet.getNonce();
      } else {
        this.currentNonce++;
      }
      return this.currentNonce;
    } finally {
      this.lock = false;
    }
  }

  async resetNonce() {
    this.currentNonce = await this.wallet.getNonce();
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor() {
    this.completedTx = 0;
    this.failedTx = 0;
  }

  async bridgeTokens(wallet, nonceManager, amount, txCount) {
    try {
      const nonce = await nonceManager.getNextNonce();

      const gasPrice = Utils.increaseGasPrice(
        CONFIG.BASE_GAS_PRICE,
        CONFIG.GAS_PRICE_INCREMENT,
        txCount
      );

      const gasPriceGwei = ethers.formatUnits(gasPrice, 'gwei');
      Logger.info(`Tx ${nonce} using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);

      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));

      // Formatted hex string for instruction:
      
      const instructionHex = "0x" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000001" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000001" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "0000000000000000000000000000000000000000000000000000000000000060" +
  "00000000000000000000000000000000000000000000000000000000000002c0" +
  "0000000000000000000000000000000000000000000000000000000000000140" +
  "0000000000000000000000000000000000000000000000000000000000000180" +
  "00000000000000000000000000000000000000000000000000000000000001c0" +
  "0000000000000000000000000000000000000000000000000000000e8d4a5100" +
  "0000000000000000000000000000000000000000000000000000000000000002" +
  "0000000000000000000000000000000000000000000000000000000000000240" +
  "0000000000000000000000000000000000000000000000000000000000000012" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000028" +
  "0000000000000000000000000000000000000000000000000000000e8d4a5100" +
  "0000000000000000000000000000000000000000000000000000000000000014" +
  "a8068e71a3f46c888c39ea5deba318c16393573b" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000014" +
  "a8068e71a3f46c888c39ea5deba318c16393573b" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000014" +
  "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "5345490000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000003" +
  "5365690000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000014" +
  "e86bed5b0813430df660d17363b89fe9bd8232d8" +
  "0000000000000000000000000000000000000000000000000000000000000000";

const instruction = [0, 2, instructionHex];


      const iface = new ethers.Interface([
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
      ]);

      const data = iface.encodeFunctionData("send", [
        channelId,
        timeoutHeight,
        timeoutTimestamp,
        salt,
        instruction
      ]);

      const result = await TransactionManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        amount,
        nonce,
        gasPrice,
        { data }
      );

      if (result.success) {
        this.completedTx++;
        Logger.success(`Tx ${nonce} confirmed in block ${result.receipt.blockNumber}`);
        Logger.success(`Tx hash: ${CONFIG.EXPLORER_URL}/tx/${result.txHash}`);
      } else {
        this.failedTx++;
        Logger.error(`Tx ${nonce} failed: ${result.error.message}`);
        if (result.error.message.includes('nonce too low')) {
          Logger.info('Resetting nonce manager due to nonce too low error');
          await nonceManager.resetNonce();
        }
      }

      return result;
    } catch (error) {
      this.failedTx++;
      Logger.error(`Tx error: ${error.message}`);
      return { success: false, error };
    }
  }

  async processBatch(wallet, nonceManager, batchSize, amount, startTxCount) {
    Logger.info(`Starting batch of ${batchSize} transactions...`);

    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(this.bridgeTokens(wallet, nonceManager, amount, startTxCount + i));
    }

    const results = await Promise.all(promises);

    Logger.info(`Batch completed (${batchSize} tx)`);
    return results;
  }
}

// ========== MAIN APPLICATION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot (${CONFIG.TOTAL_TX} tx target)`);

    const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    const wallet = new ethers.Wallet('0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52', provider);
    const nonceManager = new NonceManager(wallet);
    const bridgeManager = new BridgeManager();
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);

    const totalBatches = Math.ceil(CONFIG.TOTAL_TX / CONFIG.BATCH_SIZE);
    let totalTxCount = 0;

    for (let batch = 1; batch <= totalBatches; batch++) {
      const remainingTx = CONFIG.TOTAL_TX - (bridgeManager.completedTx + bridgeManager.failedTx);
      if (remainingTx <= 0) break;

      const currentBatchSize = Math.min(CONFIG.BATCH_SIZE, remainingTx);

      Logger.info(`\nProcessing batch ${batch}/${totalBatches} (${currentBatchSize} tx)`);
      await bridgeManager.processBatch(wallet, nonceManager, currentBatchSize, amount, totalTxCount);
      totalTxCount += currentBatchSize;

      const progress = ((bridgeManager.completedTx + bridgeManager.failedTx) / CONFIG.TOTAL_TX * 100).toFixed(1);
      Logger.info(`Progress: ${progress}% | Success: ${bridgeManager.completedTx} | Failed: ${bridgeManager.failedTx}`);

      if (batch < totalBatches) {
        Logger.info(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...`);
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }

    Logger.success(`\nBridge process completed!`);
    Logger.success(`Total transactions: ${CONFIG.TOTAL_TX}`);
    Logger.success(`Successful: ${bridgeManager.completedTx}`);
    Logger.success(`Failed: ${bridgeManager.failedTx}`);
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
