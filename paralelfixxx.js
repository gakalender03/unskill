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
    return increasedGasPrice > BigInt(CONFIG.MAX_GAS_PRICE) 
      ? BigInt(CONFIG.MAX_GAS_PRICE) 
      : increasedGasPrice;
  }

  static generateDynamicHex(privateKey) {
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address.toLowerCase().replace('0x', '');
    const paddedAddress = address.padStart(64, '0');

    // Fixed hex template with exact spacing as requested
    const hexTemplate = 
      '0000000000000000000000000000000000000000000000000000000000000020' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '0000000000000000000000000000000000000000000000000000000000000003' +
      '0000000000000000000000000000000000000000000000000000000000000060' +
      '00000000000000000000000000000000000000000000000000000000000002c0' +
      '0000000000000000000000000000000000000000000000000000000000000140' +
      '0000000000000000000000000000000000000000000000000000000000000180' +
      '00000000000000000000000000000000000000000000000000000000000001c0' +
      '0000000000000000000000000000000000000000000000000000000e8d4a5100' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      '0000000000000000000000000000000000000000000000000000000000000024' +
      '0000000000000000000000000000000000000000000000000000000000000012' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000028' +
      '0000000000000000000000000000000000000000000000000000000e8d4a5100' +
      '0000000000000000000000000000000000000000000000000000000000000001' +
      '{{ADDRESS}}' + // First address placeholder (64 chars)
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000014' +
      '{{ADDRESS}}' + // Second address placeholder (64 chars)
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000014' +
      'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' +
      '0000000000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000003' +
      '5345490000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000003' +
      '5365690000000000000000000000000000000000000000000000000000000000' +
      '0000000000000000000000000000000000000000000000000000000000000014' +
      'e86bed5b0813430df660d17363b89fe9bd8232d8' +
      '000000000000000000000000';

    return "0x" + hexTemplate.replace(/{{ADDRESS}}/g, paddedAddress);
  }
}

// ========== LOGGER ==========
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
        to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice,
        nonce,
        ...options
      });
      const receipt = await tx.wait();
      return { success: true, receipt, txHash: tx.hash, nonce };
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
  }

  async getNextNonce() {
    if (this.currentNonce === null) {
      this.currentNonce = await this.wallet.getNonce();
    } else {
      this.currentNonce++;
    }
    return this.currentNonce;
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
      
      Logger.info(`Tx ${nonce} using gas price: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei`);
      
      const dynamicHex = Utils.generateDynamicHex(wallet.privateKey);
      Logger.info(`Generated hex: ${dynamicHex}`); // For verification
      
      const instruction = [0, 2, dynamicHex];
      const iface = new ethers.Interface([
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
      ]);
      
      const data = iface.encodeFunctionData("send", [
        2, // channelId
        0, // timeoutHeight
        BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000), // timeoutTimestamp
        ethers.hexlify(ethers.randomBytes(32)), // salt
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
      } else {
        this.failedTx++;
        Logger.error(`Tx ${nonce} failed: ${result.error.message}`);
        if (result.error.message.includes('nonce too low')) {
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
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(this.bridgeTokens(wallet, nonceManager, amount, startTxCount + i));
    }
    return await Promise.all(promises);
  }
}

// ========== MAIN EXECUTION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot (${CONFIG.TOTAL_TX} tx target)`);
    
    const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    const privateKey = '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52';
    const wallet = new ethers.Wallet(privateKey, provider);
    const bridgeManager = new BridgeManager();
    const nonceManager = new NonceManager(wallet);
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);
    
    let totalTxCount = 0;
    while (totalTxCount < CONFIG.TOTAL_TX) {
      const remaining = CONFIG.TOTAL_TX - totalTxCount;
      const batchSize = Math.min(CONFIG.BATCH_SIZE, remaining);
      
      await bridgeManager.processBatch(wallet, nonceManager, batchSize, amount, totalTxCount);
      totalTxCount += batchSize;
      
      if (totalTxCount < CONFIG.TOTAL_TX) {
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    Logger.success(`\nCompleted ${bridgeManager.completedTx} successful transactions`);
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
