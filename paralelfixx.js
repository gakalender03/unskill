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
      const gasPrice = Utils.increaseGasPrice(CONFIG.BASE_GAS_PRICE, CONFIG.GAS_PRICE_INCREMENT, txCount);
      const gasPriceGwei = ethers.formatUnits(gasPrice, 'gwei');
      Logger.info(`Tx ${nonce} using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);

      // Convert the wallet address to the correct format (address is 20 bytes)
      const walletAddress = wallet.address.toLowerCase(); // Ensure the wallet address is in lowercase
      const paddedAddress = ethers.hexZeroPad(walletAddress, 32); // Pad address to 32 bytes (required for ABI encoding)

      // Instruction with the injected wallet address
      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));

      // The instruction data, replacing a placeholder address with the wallet address
      const instruction = [
        0,
        2,
        "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000"
      ];

      // Replace placeholder address in the instruction with the actual wallet address
      instruction[10] = paddedAddress;

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

// ========== MAIN EXECUTION ==========
async function main() {
  // Initialize wallet, nonceManager, and bridgeManager
  const wallet = new ethers.Wallet('your_private_key', new ethers.JsonRpcProvider(CONFIG.SEI_RPC));
  const nonceManager = new NonceManager(wallet);
  const bridgeManager = new BridgeManager();

  const totalTransactions = CONFIG.TOTAL_TX;
  const batchSize = CONFIG.BATCH_SIZE;
  const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 'ether');
  
  for (let i = 0; i < totalTransactions; i += batchSize) {
    await bridgeManager.processBatch(wallet, nonceManager, batchSize, amount, i);
    Logger.info(`Waiting for next batch of ${batchSize} transactions...`);
    await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
  }
}

main().catch((err) => {
  Logger.error(`Error in main execution: ${err.message}`);
});
