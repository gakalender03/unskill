const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  GAS_PRICE: ethers.parseUnits('0.000000003', 'ether'),
  EXPLORER_URL: 'https://seitrace.com',
  BATCH_SIZE: 50,
  TOTAL_TX: 1000,
  DELAY_BETWEEN_BATCHES: 10000,
  AMOUNT_TO_BRIDGE: '0.000001',
};

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  static async sendTransaction(wallet, to, amount, nonce, options = {}) {
    try {
      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice: CONFIG.GAS_PRICE,
        nonce: nonce,
        ...options
      });
      return { success: true, txHash: tx.hash, nonce };
    } catch (error) {
      return { success: false, error, nonce };
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
    // Wait if another operation is in progress
    while (this.lock) {
      await Utils.delay(100);
    }

    this.lock = true;
    try {
      if (this.currentNonce === null) {
        // First time - get the current nonce from the network
        this.currentNonce = await this.wallet.getNonce();
      } else {
        // Increment the nonce
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

  async bridgeTokens(wallet, nonceManager, amount) {
    try {
      const nonce = await nonceManager.getNextNonce();
      
      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const instruction = [
        0,
        2,
        "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000"
      ];

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
        { data }
      );

      if (result.success) {
        this.completedTx++;
        Logger.success(`Tx ${nonce} success: ${CONFIG.EXPLORER_URL}/tx/${result.txHash}`);
      } else {
        this.failedTx++;
        Logger.error(`Tx ${nonce} failed: ${result.error.message}`);
        // If the failure is due to nonce being too low, reset the nonce manager
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

  async processBatch(wallet, nonceManager, batchSize, amount) {
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(this.bridgeTokens(wallet, nonceManager, amount));
    }
    return Promise.all(promises);
  }
}

// ========== MAIN APPLICATION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot (${CONFIG.TOTAL_TX} tx target)`);
    
    const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider);
    const nonceManager = new NonceManager(wallet);
    const bridgeManager = new BridgeManager();
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);
    
    const totalBatches = Math.ceil(CONFIG.TOTAL_TX / CONFIG.BATCH_SIZE);
    
    for (let batch = 1; batch <= totalBatches; batch++) {
      const remainingTx = CONFIG.TOTAL_TX - (bridgeManager.completedTx + bridgeManager.failedTx);
      if (remainingTx <= 0) break;
      
      const currentBatchSize = Math.min(CONFIG.BATCH_SIZE, remainingTx);
      
      Logger.info(`\nBatch ${batch}/${totalBatches} (${currentBatchSize} tx)`);
      await bridgeManager.processBatch(wallet, nonceManager, currentBatchSize, amount);
      
      const progress = ((bridgeManager.completedTx + bridgeManager.failedTx) / CONFIG.TOTAL_TX * 100).toFixed(1);
      Logger.info(`Progress: ${progress}% | Success: ${bridgeManager.completedTx} | Failed: ${bridgeManager.failedTx}`);
      
      if (batch < totalBatches) {
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    Logger.success(`\nCompleted: ${bridgeManager.completedTx} | Failed: ${bridgeManager.failedTx}`);
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
