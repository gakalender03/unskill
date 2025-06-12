const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com', // Sei testnet RPC
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03', // Union Bridge contract address
  GAS_LIMIT: 300000, // Fixed gas limit
  GAS_PRICE: ethers.parseUnits('0.0000000011', 'ether'), // Fixed gas price (0.0000000011 SEI)
  EXPLORER_URL: 'https://seitrace.com', // Replace with Sei/Corn explorer if available
  BATCH_SIZE: 10, // Number of parallel transactions per batch
  TOTAL_TX: 1000, // Total transactions to send
  DELAY_BETWEEN_BATCHES: 30000, // 30 seconds between batches (milliseconds)
  AMOUNT_TO_BRIDGE: '0.000001', // Amount in SEI to bridge per transaction
};

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static timelog() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  }
}

// ========== LOGGER ==========
class Logger {
  log(msg, color = 'white') {
    console.log(`[${Utils.timelog()}] [${color}] ${msg}`);
  }

  info(msg) { this.log(`[ℹ] ${msg}`, 'green'); }
  warn(msg) { this.log(`[⚠] ${msg}`, 'yellow'); }
  error(msg) { this.log(`[✗] ${msg}`, 'red'); }
  success(msg) { this.log(`[✓] ${msg}`, 'green'); }
  loading(msg) { this.log(`[⟳] ${msg}`, 'cyan'); }
  system(msg) { this.log(`[⚙] ${msg}`, 'magenta'); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
  }

  async sendTransaction(wallet, to, amount, nonce, options = {}) {
    try {
      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit: CONFIG.GAS_LIMIT,
        gasPrice: CONFIG.GAS_PRICE,
        nonce: nonce,
        ...options
      });
      
      // Don't wait for confirmation here to speed up batch processing
      this.logger.success(`Tx ${nonce} submitted: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}`);
      return { success: true, txHash: tx.hash, nonce };
    } catch (error) {
      this.logger.error(`Tx ${nonce} failed: ${error.message}`);
      return { success: false, error, nonce };
    }
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
    this.txManager = new TransactionManager(provider, this.logger);
    this.pendingTx = new Map();
    this.completedTx = 0;
    this.failedTx = 0;
  }

  async bridgeTokens(wallet, amount, destination, nonce) {
    try {
      this.logger.loading(`Preparing tx ${nonce} (${ethers.formatUnits(amount, 18)} SEI to ${destination})`);

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

      const result = await this.txManager.sendTransaction(
        wallet,
        CONTRACT_ADDRESS,
        amount,
        nonce,
        { data }
      );

      if (result.success) {
        this.pendingTx.set(nonce, result.txHash);
      } else {
        this.failedTx++;
      }

      return result;
    } catch (error) {
      this.logger.error(`Error in tx ${nonce}: ${error.message}`);
      this.failedTx++;
      return { success: false, error };
    }
  }

  async startBatch(wallet, startNonce, batchSize, amount) {
    this.logger.system(`Starting batch with nonce range: ${startNonce} to ${startNonce + batchSize - 1}`);
    
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      const nonce = startNonce + i;
      promises.push(
        this.bridgeTokens(wallet, amount, 'corn', nonce)
      );
    }

    const results = await Promise.all(promises);
    this.completedTx += results.filter(r => r.success).length;
    
    // Process packet tracking for successful transactions in background
    this.trackPacketsInBackground();
    
    return results;
  }

  async trackPacketsInBackground() {
    for (const [nonce, txHash] of this.pendingTx) {
      try {
        await this.pollPacketHash(txHash);
        this.pendingTx.delete(nonce);
      } catch (error) {
        this.logger.warn(`Failed to track packet for tx ${nonce}: ${error.message}`);
      }
    }
  }

  async pollPacketHash(txHash, retries = 20, intervalMs = 10000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await axios.post(CONFIG.UNION_GRAPHQL, {
          query: `query ($submission_tx_hash: String!) {
            v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
              packet_hash
            }
          }`,
          variables: { submission_tx_hash: txHash }
        });

        const packetHash = response.data?.data?.v2_transfers[0]?.packet_hash;
        if (packetHash) {
          this.logger.success(`Packet tracked for tx ${txHash}: https://app.union.build/explorer/transfers/${packetHash}`);
          return;
        }
      } catch (error) {
        if (i === retries - 1) throw error;
      }
      await Utils.delay(intervalMs);
    }
    throw new Error(`Packet hash not found for tx ${txHash}`);
  }
}

// ========== MAIN APPLICATION ==========
class App {
  constructor() {
    this.logger = new Logger();
  }

  async init() {
    try {
      this.logger.system('==== SEI BRIDGE BOT STARTED ====');
      this.logger.info(`Configuration:`);
      this.logger.info(`- Target: ${CONFIG.TOTAL_TX} transactions`);
      this.logger.info(`- Batch size: ${CONFIG.BATCH_SIZE}`);
      this.logger.info(`- Amount per tx: ${CONFIG.AMOUNT_TO_BRIDGE} SEI`);
      this.logger.info(`- Gas price: ${ethers.formatUnits(CONFIG.GAS_PRICE, 'ether')} SEI`);
      this.logger.info(`- Gas limit: ${CONFIG.GAS_LIMIT}`);
      
      // Setup provider and wallet
      const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
      const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider);
      
      // Initialize bridge manager
      const bridgeManager = new BridgeManager(provider, this.logger);
      
      // Set amount to bridge
      const amount = ethers.parseUnits(CONFIG.AMOUNT_TO_BRIDGE, 18);
      
      // Get initial nonce
      let currentNonce = await wallet.getNonce();
      this.logger.info(`Starting nonce: ${currentNonce}`);
      
      // Calculate number of batches needed
      const totalBatches = Math.ceil(CONFIG.TOTAL_TX / CONFIG.BATCH_SIZE);
      
      // Main loop for batches
      for (let batch = 1; batch <= totalBatches; batch++) {
        const remainingTx = CONFIG.TOTAL_TX - (bridgeManager.completedTx + bridgeManager.failedTx);
        const currentBatchSize = Math.min(CONFIG.BATCH_SIZE, remainingTx);
        
        this.logger.system(`\nProcessing batch ${batch}/${totalBatches} (${currentBatchSize} tx)`);
        
        await bridgeManager.startBatch(wallet, currentNonce, currentBatchSize, amount);
        currentNonce += currentBatchSize;
        
        // Log progress
        const progress = Math.round(((bridgeManager.completedTx + bridgeManager.failedTx) / CONFIG.TOTAL_TX) * 100);
        this.logger.info(`Progress: ${progress}% (${bridgeManager.completedTx} succeeded, ${bridgeManager.failedTx} failed)`);
        
        // Don't wait after last batch
        if (batch < totalBatches) {
          this.logger.system(`Waiting ${CONFIG.DELAY_BETWEEN_BATCHES/1000} sec before next batch...`);
          await Utils.delay(CONFIG.DELAY_BETWEEN_BATCHES);
        }
      }
      
      // Final report
      this.logger.system('\n==== FINAL REPORT ====');
      this.logger.success(`Completed transactions: ${bridgeManager.completedTx}`);
      if (bridgeManager.failedTx > 0) {
        this.logger.error(`Failed transactions: ${bridgeManager.failedTx}`);
      }
      this.logger.system(`Total processed: ${bridgeManager.completedTx + bridgeManager.failedTx}/${CONFIG.TOTAL_TX}`);
      this.logger.system('==== BOT FINISHED ====');
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`Error details: ${JSON.stringify(error.response.data)}`);
      }
      process.exit(1);
    }
  }
}

// ========== START APPLICATION ==========
new App().init();
