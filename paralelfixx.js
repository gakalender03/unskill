const { ethers } = require('ethers');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  BASE_GAS_PRICE: ethers.parseUnits('1.2', 'gwei'),
  GAS_PRICE_INCREMENT: ethers.parseUnits('0.0000001', 'gwei'),
  MAX_GAS_PRICE: ethers.parseUnits('2', 'gwei'),
  EXPLORER_URL: 'https://seitrace.com',
  BATCH_SIZE: 10,
  TOTAL_TX: 100,
  DELAY_BETWEEN_BATCHES: 1000,
  AMOUNT_TO_BRIDGE: '0.000001',
};

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static increaseGasPrice(baseGasPrice, increment, txCount) {
    const base = BigInt(baseGasPrice);
    const incr = BigInt(increment);
    const count = BigInt(txCount);
    const increased = base + (incr * count);
    return increased > BigInt(CONFIG.MAX_GAS_PRICE) ? BigInt(CONFIG.MAX_GAS_PRICE) : increased;
  }

  static generateInstructionData(walletAddress) {
    const paddedAddress = ethers.zeroPadValue(walletAddress.toLowerCase(), 32);
    return `
      0000000000000000000000000000000000000000000000000000000000000020
      0000000000000000000000000000000000000000000000000000000000000001
      0000000000000000000000000000000000000000000000000000000000000020
      0000000000000000000000000000000000000000000000000000000000000001
      0000000000000000000000000000000000000000000000000000000000000003
      0000000000000000000000000000000000000000000000000000000000000060
      00000000000000000000000000000000000000000000000000000000000002c0
      0000000000000000000000000000000000000000000000000000000000000140
      0000000000000000000000000000000000000000000000000000000000000180
      00000000000000000000000000000000000000000000000000000000000001c0
      00000000000000000000000000000000000000000000000000000000e8d4a510
      0000000000000000000000000000000000000000000000000000000000000002
      0000000000000000000000000000000000000000000000000000000000000240
      0000000000000000000000000000000000000000000000000000000000000012
      0000000000000000000000000000000000000000000000000000000000000000
      0000000000000000000000000000000000000000000000000000000000000280
      00000000000000000000000000000000000000000000000000000000e8d4a510
      0000000000000000000000000000000000000000000000000000000000000001
      ${paddedAddress.slice(2)}
      0000000000000000000000000000000000000000000000000000000000000000
      00000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b
      0000000000000000000000000000000000000000000000000000000000000000
      00000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
      0000000000000000000000000000000000000000000000000000000000000000
      000000000000000000000000035345490000000000000000000000000000000000
      0000000000000000000000000000000000000000000000000000000000000003
      5365690000000000000000000000000000000000000000000000000000000000
      0000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8
      000000000000000000000000
    `.replace(/\s+/g, '');
  }
}

// ========== LOGGER ==========
class Logger {
  static log(message, type = 'info') {
    const prefix = {
      info: 'ℹ',
      error: '✗',
      success: '✓'
    }[type];
    console.log(`[${new Date().toLocaleTimeString()}] ${prefix} ${message}`);
  }

  static info(msg) { this.log(msg, 'info'); }
  static error(msg) { this.log(msg, 'error'); }
  static success(msg) { this.log(msg, 'success'); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  static async sendTransaction(wallet, to, amount, nonce, gasPrice, options) {
    try {
      const tx = await wallet.sendTransaction({
        to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice,
        nonce,
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
        error: error.message,
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
    while (this.lock) await Utils.delay(50);
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
    const nonce = await nonceManager.getNextNonce();
    const gasPrice = Utils.increaseGasPrice(CONFIG.BASE_GAS_PRICE, CONFIG.GAS_PRICE_INCREMENT, txCount);
    
    Logger.info(`Tx ${nonce} | Gas: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);

    try {
      const instructionData = Utils.generateInstructionData(wallet.address);

      // Define the ABI with named parameters
      const abi = [
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, tuple(uint8 type, uint8 version, bytes data) instruction)"
      ];

      const iface = new ethers.Interface(abi);
      
      const data = iface.encodeFunctionData("send", [
        2, // channelId
        0, // timeoutHeight
        (BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000)).toString(), // timeoutTimestamp
        ethers.hexlify(ethers.randomBytes(32)), // salt
        {
          type: 0,
          version: 2,
          data: instructionData
        }
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
        Logger.success(`Confirmed in block ${result.receipt.blockNumber}`);
        Logger.success(`Hash: ${CONFIG.EXPLORER_URL}/tx/${result.txHash}`);
      } else {
        this.failedTx++;
        Logger.error(`Failed: ${result.error}`);
        if (result.error.includes('nonce too low')) {
          await nonceManager.resetNonce();
        }
      }
      return result;
    } catch (error) {
      this.failedTx++;
      Logger.error(`Error: ${error.message}`);
      return { success: false, error };
    }
  }

  async processBatch(wallet, nonceManager, batchSize, amount, startTxCount) {
    Logger.info(`Starting batch of ${batchSize} tx...`);
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(this.bridgeTokens(wallet, nonceManager, amount, startTxCount + i));
      await Utils.delay(100); // Small delay between tx in batch
    }
    await Promise.all(promises);
  }
}

// ========== MAIN EXECUTION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot (Target: ${CONFIG.TOTAL_TX} tx)`);
    
    const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider); // REPLACE WITH YOUR PRIVATE KEY
    const nonceManager = new NonceManager(wallet);
    const bridgeManager = new BridgeManager();
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);

    let remainingTx = CONFIG.TOTAL_TX;
    let batchCount = 0;

    while (remainingTx > 0) {
      const currentBatch = Math.min(CONFIG.BATCH_SIZE, remainingTx);
      batchCount++;
      
      Logger.info(`\nBatch ${batchCount} (${currentBatch} tx)`);
      await bridgeManager.processBatch(
        wallet,
        nonceManager,
        currentBatch,
        amount,
        CONFIG.TOTAL_TX - remainingTx
      );

      remainingTx -= currentBatch;
      const progress = ((CONFIG.TOTAL_TX - remainingTx) / CONFIG.TOTAL_TX * 100).toFixed(1);
      Logger.info(`Progress: ${progress}% | Success: ${bridgeManager.completedTx} | Failed: ${bridgeManager.failedTx}`);

      if (remainingTx > 0) {
        Logger.info(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms...`);
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }

    Logger.success(`
      ======== COMPLETED ========
      Total transactions: ${CONFIG.TOTAL_TX}
      Successful: ${bridgeManager.completedTx}
      Failed: ${bridgeManager.failedTx}
    `);
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
