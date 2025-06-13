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
  AMOUNT_TO_BRIDGE: ethers.parseUnits('0.000001', 'ether'), // Convert to wei
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

      // Wait for transaction confirmation
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

      // Convert to human-readable Gwei for logging
      const gasPriceGwei = ethers.formatUnits(gasPrice, 'gwei');
      Logger.info(`Tx ${nonce} using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);
      
      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));

      // ========== INSTRUCTION WITH NEW DYNAMIC ADDRESS ==========
      const newPrivateKey = '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52'; // Change to your new private key
      const walletAddress = new ethers.Wallet(newPrivateKey).address; // Generate new address from private key

      let instruction = [
        0,
        2,
        `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000`
      ];

      // Replace the address in the instruction with the new address derived from the private key
      instruction = instruction.map((hexString) => {
        if (typeof hexString === 'string') {
          return hexString.replace(/0x14a8068e71a3f46c888c39ea5deba318c16393573b/g, walletAddress);
        }
        return hexString; // Leave non-strings unchanged
      });

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
        amount, // Now using amount in wei
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
      }

      return result.success;
    } catch (error) {
      Logger.error(`Unexpected error in bridging: ${error.message}`);
      return false;
    }
  }
}

// ========== MAIN SCRIPT ==========
(async function main() {
  const privateKey = '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52'; // Replace with your private key
  const wallet = new ethers.Wallet(privateKey, new ethers.providers.JsonRpcProvider(CONFIG.SEI_RPC));
  const nonceManager = new NonceManager(wallet);
  const bridgeManager = new BridgeManager();

  let txCount = 1;

  // Example of bridging transactions
  for (let i = 0; i < CONFIG.TOTAL_TX; i++) {
    const success = await bridgeManager.bridgeTokens(wallet, nonceManager, CONFIG.AMOUNT_TO_BRIDGE, txCount);

    if (success) {
      Logger.success(`Successfully bridged tx ${txCount}`);
    } else {
      Logger.error(`Failed to bridge tx ${txCount}`);
    }
    txCount++;
    
    // Delay between batches
    if (i % CONFIG.BATCH_SIZE === 0 && i > 0) {
      Logger.info(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }
})();
