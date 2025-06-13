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
  AMOUNT_TO_BRIDGE: ethers.parseUnits('0.000001', 'ether'),
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
        to: to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice: gasPrice,
        nonce: nonce,
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
      return this.currentNonce;
    } finally {
      this.lock = false;
    }
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor() {
    this.completedTx = 0;
    this.failedTx = 0;
    // Generate new recipient wallet
    this.newRecipientWallet = ethers.Wallet.createRandom();
    this.newRecipientAddress = this.newRecipientWallet.address.toLowerCase().replace('0x', '');
    Logger.info(`Generated new recipient wallet: 0x${this.newRecipientAddress}`);
    Logger.info(`Recipient private key: ${this.newRecipientWallet.privateKey}`);
  }

  static replaceAddressInHex(hexString, oldAddress, newAddress) {
    const oldAddressPart = oldAddress.toLowerCase().replace('0x', '').padStart(40, '0');
    const newAddressPart = newAddress.toLowerCase().replace('0x', '').padStart(40, '0');
    return hexString.replace(new RegExp(oldAddressPart, 'gi'), newAddressPart);
  }

  async bridgeTokens(wallet, nonceManager, amount, txCount) {
    try {
      const nonce = await nonceManager.getNextNonce();
      const gasPrice = Utils.increaseGasPrice(CONFIG.BASE_GAS_PRICE, CONFIG.GAS_PRICE_INCREMENT, txCount);
      const gasPriceGwei = ethers.formatUnits(gasPrice, 'gwei');
      Logger.info(`Tx ${nonce} using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);

      const channelId = 2;
      const timeoutHeight = 0;
      const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
      const salt = ethers.hexlify(ethers.randomBytes(32));
      const walletAddress = wallet.address;

      // Original instruction with placeholder address
      const originalInstructionHex = '0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a51000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000';

      // Replace placeholder address with the new recipient address
      const modifiedInstructionHex = BridgeManager.replaceAddressInHex(
        originalInstructionHex,
        'a8068e71a3f46c888c39ea5deba318c16393573b',
        this.newRecipientAddress
      );

      // Prepare instruction array
      const instruction = [0, 2, modifiedInstructionHex];

      // Encode the transaction data
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

      // Send the transaction
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
  const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
  const wallet = new ethers.Wallet(privateKey, provider);

  const nonceManager = new NonceManager(wallet);
  const bridgeManager = new BridgeManager();

  Logger.info(`Starting bridge transactions from address: ${wallet.address}`);
  Logger.info(`Contract address: ${CONFIG.CONTRACT_ADDRESS}`);
  Logger.info(`Amount to bridge: ${ethers.formatEther(CONFIG.AMOUNT_TO_BRIDGE)} ETH`);

  let txCount = 1;

  for (let i = 0; i < CONFIG.TOTAL_TX; i++) {
    const success = await bridgeManager.bridgeTokens(wallet, nonceManager, CONFIG.AMOUNT_TO_BRIDGE, txCount);

    if (success) {
      Logger.success(`Successfully bridged tx ${txCount}`);
    } else {
      Logger.error(`Failed to bridge tx ${txCount}`);
    }
    txCount++;

    if (i % CONFIG.BATCH_SIZE === 0 && i > 0) {
      Logger.info(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
      await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }

  Logger.info(`Bridge process completed. Success: ${bridgeManager.completedTx}, Failed: ${bridgeManager.failedTx}`);
  Logger.info(`Recipient wallet address: 0x${bridgeManager.newRecipientAddress}`);
  Logger.info(`Recipient private key: ${bridgeManager.newRecipientWallet.privateKey}`);
})();
