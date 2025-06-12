const { ethers } = require('ethers');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'wss://evm-ws-testnet.sei-apis.com', // Updated to WebSocket endpoint
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  BASE_GAS_PRICE: ethers.parseUnits('1.2', 'gwei'), // Increased base gas price
  GAS_PRICE_INCREMENT: ethers.parseUnits('0.0000001', 'gwei'),
  MAX_GAS_PRICE: ethers.parseUnits('2', 'gwei'), // Increased max gas price
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
    return increasedGasPrice > BigInt(CONFIG.MAX_GAS_PRICE) ? 
      BigInt(CONFIG.MAX_GAS_PRICE) : increasedGasPrice;
  }

  static generateInstruction(walletAddress) {
    const baseHex = "00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000";
    const currentAddress = walletAddress.toLowerCase().replace('0x', '');
    const hardcodedAddress = 'a8068e71a3f46c888c39ea5deba318c16393573b';
    let modifiedHex = baseHex.replace(new RegExp(hardcodedAddress, 'g'), currentAddress);
    return [0, 2, "0x" + modifiedHex];
  }
}

// ========== LOGGER ==========
class Logger {
  static log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }
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

      Logger.info(`Transaction ${tx.hash} sent`);
      const receipt = await tx.wait();
      Logger.info(`Transaction ${tx.hash} mined in block ${receipt.blockNumber}`);
      return { 
        success: true, 
        receipt,
        txHash: tx.hash,
        nonce 
      };
    } catch (error) {
      Logger.error(`Transaction failed: ${error.message}`);
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
    while (this.lock) await Utils.delay(100);
    this.lock = true;
    try {
      if (this.currentNonce === null) {
        this.currentNonce = await this.wallet.getNonce();
      } else {
        this.currentNonce++;
      }
      Logger.info(`Using nonce: ${this.currentNonce}`);
      return this.currentNonce;
    } finally {
      this.lock = false;
    }
  }

  async resetNonce() {
    Logger.info('Resetting nonce');
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
      
      const gasFee = gasPrice * BigInt(CONFIG.GAS_LIMIT);
      Logger.info(`Estimated gas fee: ${ethers.formatEther(gasFee)} SEI`);

      const balance = await wallet.provider.getBalance(wallet.address);
      Logger.info(`Wallet balance: ${ethers.formatEther(balance)} SEI`);

      if (balance < (amount + gasFee)) {
        Logger.error(`Insufficient balance for transaction`);
        return { success: false, error: 'Insufficient balance' };
      }

      const gasPriceGwei = ethers.formatUnits(gasPrice, 'gwei');
      Logger.info(`Using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);
      
      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const instruction = Utils.generateInstruction(wallet.address);

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
        Logger.success(`Transaction confirmed in block ${result.receipt.blockNumber}`);
      } else {
        this.failedTx++;
        if (result.error?.message.includes('nonce too low')) {
          Logger.info('Nonce too low - resetting nonce manager');
          await nonceManager.resetNonce();
        }
      }

      return result;
    } catch (error) {
      this.failedTx++;
      Logger.error(`Transaction error: ${error.message}`);
      return { success: false, error };
    }
  }

  async processBatch(wallet, nonceManager, batchSize, amount, startTxCount) {
    Logger.info(`Starting batch of ${batchSize} transactions`);
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(this.bridgeTokens(wallet, nonceManager, amount, startTxCount + i));
      await Utils.delay(100); // Small delay between individual tx in batch
    }
    const results = await Promise.all(promises);
    Logger.info(`Batch completed with ${results.filter(r => r.success).length} successes`);
    return results;
  }
}

// ========== MAIN APPLICATION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot (${CONFIG.TOTAL_TX} tx target)`);
    
    // Initialize WebSocket provider
    const provider = new ethers.WebSocketProvider(CONFIG.SEI_RPC);
    provider.on('error', (error) => {
      Logger.error(`WebSocket error: ${error.message}`);
    });
    
    const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider);
    Logger.info(`Using wallet: ${wallet.address}`);
    
    const nonceManager = new NonceManager(wallet);
    const bridgeManager = new BridgeManager();
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);
    
    const totalBatches = Math.ceil(CONFIG.TOTAL_TX / CONFIG.BATCH_SIZE);
    let totalTxCount = 0;
    
    // Initial balance check
    const initialBalance = await provider.getBalance(wallet.address);
    Logger.info(`Initial balance: ${ethers.formatEther(initialBalance)} SEI`);
    
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
        Logger.info(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch`);
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    Logger.success(`\nBridge process completed!`);
    Logger.success(`Total transactions: ${CONFIG.TOTAL_TX}`);
    Logger.success(`Successful: ${bridgeManager.completedTx}`);
    Logger.success(`Failed: ${bridgeManager.failedTx}`);
    
    // Close WebSocket connection
    provider._websocket.close();
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
