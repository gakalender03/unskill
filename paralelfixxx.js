const { ethers } = require('ethers');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  BASE_GAS_PRICE: ethers.parseUnits('1.2', 'gwei'),
  GAS_PRICE_INCREMENT: ethers.parseUnits('0.0000001', 'gwei'),
  MAX_GAS_PRICE: ethers.parseUnits('2', 'gwei'),
  EXPLORER_URL: 'https://seitrace.com',
  BATCH_SIZE: 2,
  TOTAL_TX: 1000,
  DELAY_BETWEEN_BATCHES: 10000,
  AMOUNT_TO_BRIDGE: '0.000001',
  PRIVATE_KEYS: [
    '0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe',
   '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52', 
    // Add more private keys here
  ],
  // Bridge-specific config
  CHANNEL_ID: 2,
  BRIDGE_CONTRACT: '0xE86bEd5B0813430dF660d17363b89fe9bd8232D8',
  ETH_TOKEN_ADDRESS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
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

  static generateSalt() {
    return ethers.hexlify(ethers.randomBytes(32));
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
  static async sendTransaction(wallet, to, amount, nonce, gasPrice, data) {
    try {
      const tx = await wallet.sendTransaction({
        to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice,
        nonce,
        data
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
    this.lock = false;
  }

  async getNextNonce() {
    while (this.lock) await Utils.delay(100);
    this.lock = true;
    try {
      this.currentNonce = this.currentNonce === null 
        ? await this.wallet.getNonce() 
        : this.currentNonce + 1;
      return this.currentNonce;
    } finally {
      this.lock = false;
    }
  }

  async resetNonce() {
    this.currentNonce = await this.wallet.getNonce();
  }
}

// ========== BRIDGE DATA GENERATOR ==========
class BridgeDataGenerator {
  static generateInstruction(walletAddress) {
    // Main instruction structure
    return [
      0, // instruction type
      2, // some flag
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['tuple(uint256,address,address,address,string,string,address)'],
        [[
          ethers.parseUnits("1000000", "wei"), // amount
          walletAddress,                       // sender
          walletAddress,                       // receiver 
          CONFIG.ETH_TOKEN_ADDRESS,            // token address
          "SEI",                               // token name
          "SEI",                               // token symbol
          CONFIG.BRIDGE_CONTRACT               // bridge contract
        ]]
      )
    ];
  }

  static generateTxData(wallet, amount) {
    const instruction = this.generateInstruction(wallet.address);
    const iface = new ethers.Interface([
      "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
    ]);
    
    return iface.encodeFunctionData("send", [
      CONFIG.CHANNEL_ID,
      0, // timeoutHeight
      BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000), // timeoutTimestamp
      Utils.generateSalt(),
      instruction
    ]);
  }
}

// ========== WALLET MANAGER ==========
class WalletManager {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    this.wallets = CONFIG.PRIVATE_KEYS.map(key => new ethers.Wallet(key, this.provider));
    this.currentIndex = 0;
  }

  getNextWallet() {
    const wallet = this.wallets[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.wallets.length;
    return wallet;
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor() {
    this.completedTx = 0;
    this.failedTx = 0;
    this.walletManager = new WalletManager();
    this.nonceManagers = new Map();
  }

  async getNonceManager(wallet) {
    if (!this.nonceManagers.has(wallet.address)) {
      this.nonceManagers.set(wallet.address, new NonceManager(wallet));
    }
    return this.nonceManagers.get(wallet.address);
  }

  async processBatch(batchSize) {
    const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);
    const promises = [];
    
    for (let i = 0; i < batchSize; i++) {
      const wallet = this.walletManager.getNextWallet();
      const nonceManager = await this.getNonceManager(wallet);
      const nonce = await nonceManager.getNextNonce();
      const gasPrice = Utils.increaseGasPrice(CONFIG.BASE_GAS_PRICE, CONFIG.GAS_PRICE_INCREMENT, this.completedTx + this.failedTx);
      const data = BridgeDataGenerator.generateTxData(wallet, amount);
      
      promises.push(
        TransactionManager.sendTransaction(wallet, CONFIG.CONTRACT_ADDRESS, amount, nonce, gasPrice, data)
          .then(result => {
            if (result.success) {
              this.completedTx++;
              Logger.success(`[${wallet.address.slice(0,6)}] Tx ${nonce} completed: ${CONFIG.EXPLORER_URL}/tx/${result.txHash}`);
            } else {
              this.failedTx++;
              Logger.error(`[${wallet.address.slice(0,6)}] Tx ${nonce} failed: ${result.error.message}`);
              if (result.error.message.includes('nonce too low')) {
                nonceManager.resetNonce();
              }
            }
            return result;
          })
      );
    }
    
    return Promise.all(promises);
  }
}

// ========== MAIN EXECUTION ==========
(async () => {
  try {
    Logger.info(`Starting bridge bot with ${CONFIG.PRIVATE_KEYS.length} wallets`);
    const bridgeManager = new BridgeManager();
    let remainingTx = CONFIG.TOTAL_TX;
    
    while (remainingTx > 0) {
      const batchSize = Math.min(CONFIG.BATCH_SIZE, remainingTx);
      Logger.info(`Processing batch (${batchSize} tx), Remaining: ${remainingTx}`);
      
      await bridgeManager.processBatch(batchSize);
      remainingTx -= batchSize;
      
      if (remainingTx > 0) {
        await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
      }
    }
    
    Logger.success(`\nBridge process completed!`);
    Logger.success(`Total: ${CONFIG.TOTAL_TX} | Success: ${bridgeManager.completedTx} | Failed: ${bridgeManager.failedTx}`);
  } catch (error) {
    Logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();
