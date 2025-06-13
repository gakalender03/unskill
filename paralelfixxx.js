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

      // Defining instruction as a hex string
      const instructionHex = "0x0000000000000000000000000000000000000000000000000000000000000020" +
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

      const instructionBytes = ethers.arrayify(instructionHex);

      const iface = new ethers.Interface([
        "function transfer(address to, uint256 amount, bytes memory instruction) public returns (bool)"
      ]);
      
      const encodedData = iface.encodeFunctionData('transfer', [wallet.address, amount, instructionBytes]);

      // Send Transaction
      const txResult = await TransactionManager.sendTransaction(
        wallet, 
        CONFIG.CONTRACT_ADDRESS, 
        amount, 
        nonce, 
        gasPrice, 
        { data: encodedData }
      );

      return txResult;

    } catch (err) {
      Logger.error('Error in bridging transaction:', err);
    }
  }
}

// ========== MAIN SCRIPT ==========
async function main() {
  const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
  const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider);

  const nonceManager = new NonceManager(wallet);
  const bridgeManager = new BridgeManager();

  for (let txCount = 0; txCount < CONFIG.TOTAL_TX; txCount++) {
    const result = await bridgeManager.bridgeTokens(
      wallet, 
      nonceManager, 
      CONFIG.AMOUNT_TO_BRIDGE, 
      txCount
    );

    if (result.success) {
      Logger.success(`Transaction successful: ${result.txHash}`);
    } else {
      Logger.error(`Transaction failed (Nonce ${result.nonce}): ${result.error}`);
    }

    // Introduce delay between transactions if needed
    if ((txCount + 1) % CONFIG.BATCH_SIZE === 0) {
      await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }
}

main().catch(err => Logger.error(err));
