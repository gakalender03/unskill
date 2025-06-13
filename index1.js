const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,
  EXPLORER_URL: 'https://seitrace.com',
  BRIDGE_AMOUNT: '0.000001', // SEI to bridge per wallet
  DELAY_BETWEEN_WALLETS: 30000, // 30 seconds between wallets
  MAX_RETRIES: 3, // Max retries per wallet
};

// Add your private keys here (in production, use environment variables)
const PRIVATE_KEYS = [
  '0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe',
  '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52',
  // '0x...add_more_keys_here',
];

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static timelog() {
    return new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
  }

  static formatProgress(current, total) {
    return `[${current}/${total}]`;
  }
}

// ========== LOGGER ==========
class Logger {
  constructor(showDebug = false) {
    this.showDebug = showDebug;
  }

  log(msg, color = 'white') {
    const colors = {
      white: '\x1b[37m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      cyan: '\x1b[36m',
    };
    console.log(`${colors[color]}${msg}\x1b[0m`);
  }

  debug(msg) { if (this.showDebug) this.log(`[DEBUG] ${msg}`, 'cyan'); }
  info(msg) { this.log(`[ℹ INFO] ${Utils.timelog()} - ${msg}`, 'green'); }
  warn(msg) { this.log(`[⚠ WARN] ${Utils.timelog()} - ${msg}`, 'yellow'); }
  error(msg) { this.log(`[✗ ERROR] ${Utils.timelog()} - ${msg}`, 'red'); }
  success(msg) { this.log(`[✓ SUCCESS] ${Utils.timelog()} - ${msg}`, 'green'); }
  progress(msg) { this.log(`[⟳ WORKING] ${Utils.timelog()} - ${msg}`, 'cyan'); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
  }

  async sendTransaction(wallet, to, amount, options = {}, retryCount = 0) {
    try {
      const gasLimit = await wallet.estimateGas({
        to: to,
        value: amount,
        ...options
      });
      this.logger.debug(`Estimated gas: ${gasLimit}`);

      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit: Math.min(gasLimit * 2n, BigInt(CONFIG.GAS_LIMIT)), // Add buffer but respect max
        ...options
      });
      
      this.logger.progress(`Tx submitted: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}`);
      const receipt = await tx.wait();
      this.logger.debug(`Tx mined in block: ${receipt.blockNumber}`);
      
      return { success: true, receipt };
    } catch (error) {
      if (retryCount < CONFIG.MAX_RETRIES) {
        const delay = 5000 * (retryCount + 1);
        this.logger.warn(`Retry ${retryCount + 1}/${CONFIG.MAX_RETRIES} in ${delay/1000}s...`);
        await Utils.delay(delay);
        return this.sendTransaction(wallet, to, amount, options, retryCount + 1);
      }
      this.logger.error(`Transaction failed after ${CONFIG.MAX_RETRIES} attempts: ${error.message}`);
      return { success: false, error };
    }
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
    this.txManager = new TransactionManager(provider, this.logger);
  }

  async bridgeTokens(wallet, amount, destination) {
    try {
      this.logger.info(`Bridging ${ethers.formatEther(amount)} SEI to ${destination} from ${wallet.address}`);
      
      // Bridge parameters
      const bridgeParams = {
        channelId: 2,               // uint32
        timeoutHeight: 0,           // uint64
        timeoutTimestamp: BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000), // uint64 (nanoseconds)
        salt: ethers.hexlify(ethers.randomBytes(32)), // bytes32
        instruction: [
          0, // instructionType (uint8)
          2, // instructionVersion (uint8)
          "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000"
        ]
      };

      // Encode the function call
      const iface = new ethers.Interface([
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
      ]);
      
      const data = iface.encodeFunctionData("send", [
        bridgeParams.channelId,
        bridgeParams.timeoutHeight,
        bridgeParams.timeoutTimestamp,
        bridgeParams.salt,
        bridgeParams.instruction
      ]);

      this.logger.debug(`Bridge data: ${data.slice(0, 100)}...`);

      // Execute bridge transaction
      const bridgeTx = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        amount,
        { data }
      );

      if (!bridgeTx.success) {
        throw new Error("Bridge transaction failed");
      }

      this.logger.success(`Bridge tx successful: ${CONFIG.EXPLORER_URL}/tx/${bridgeTx.receipt.hash}`);
      await this.pollPacketHash(bridgeTx.receipt.hash);
      
      return true;
    } catch (error) {
      this.logger.error(`Bridge failed for ${wallet.address}: ${error.message}`);
      return false;
    }
  }

  async pollPacketHash(txHash, retries = 30, intervalMs = 5000) {
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
          this.logger.success(`Packet tracked: https://app.union.build/explorer/transfers/${packetHash}`);
          return packetHash;
        }
      } catch (error) {
        this.logger.debug(`Packet lookup attempt ${i+1} failed: ${error.message}`);
      }
      
      if (i < retries - 1) {
        this.logger.progress(`Waiting for packet hash... (${i+1}/${retries})`);
        await Utils.delay(intervalMs);
      }
    }
    
    throw new Error("Packet hash not found after maximum retries");
  }
}

// ========== WALLET PROCESSOR ==========
class WalletProcessor {
  constructor(logger) {
    this.logger = logger;
    this.successCount = 0;
    this.failureCount = 0;
  }

  async processWallet(privateKey, index, total) {
    try {
      const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      this.logger.info(`${Utils.formatProgress(index + 1, total)} Processing ${wallet.address}`);
      
      // Check balance first
      const balance = await provider.getBalance(wallet.address);
      if (balance < ethers.parseEther(CONFIG.BRIDGE_AMOUNT)) {
        throw new Error(`Insufficient balance (${ethers.formatEther(balance)} SEI)`);
      }

      const bridgeManager = new BridgeManager(provider, this.logger);
      const amount = ethers.parseEther(CONFIG.BRIDGE_AMOUNT);
      
      const success = await bridgeManager.bridgeTokens(wallet, amount, 'corn');
      
      if (success) {
        this.successCount++;
        return true;
      } else {
        this.failureCount++;
        return false;
      }
    } catch (error) {
      this.logger.error(`${Utils.formatProgress(index + 1, total)} Failed to process wallet: ${error.message}`);
      this.failureCount++;
      return false;
    }
  }

  getStats() {
    return {
      total: this.successCount + this.failureCount,
      success: this.successCount,
      failure: this.failureCount
    };
  }
}

// ========== MAIN APPLICATION ==========
class App {
  constructor() {
    this.logger = new Logger(true); // Enable debug logging
  }

  async init() {
    try {
      if (PRIVATE_KEYS.length === 0) {
        throw new Error("No private keys configured");
      }

      this.logger.info(`Starting bridge for ${PRIVATE_KEYS.length} wallets`);
      this.logger.info(`Amount per wallet: ${CONFIG.BRIDGE_AMOUNT} SEI`);
      
      const processor = new WalletProcessor(this.logger);
      
      for (let i = 0; i < PRIVATE_KEYS.length; i++) {
        const startTime = Date.now();
        
        await processor.processWallet(PRIVATE_KEYS[i], i, PRIVATE_KEYS.length);
        
        // Add delay between wallets except after last one
        if (i < PRIVATE_KEYS.length - 1) {
          const elapsed = Date.now() - startTime;
          const delay = Math.max(0, CONFIG.DELAY_BETWEEN_WALLETS - elapsed);
          
          if (delay > 0) {
            this.logger.progress(`Waiting ${delay/1000} seconds before next wallet...`);
            await Utils.delay(delay);
          }
        }
      }
      
      const stats = processor.getStats();
      this.logger.info(`\n=== Bridge Complete ===`);
      this.logger.info(`Total wallets processed: ${stats.total}`);
      this.logger.info(`Successful bridges: ${stats.success}`);
      this.logger.info(`Failed bridges: ${stats.failure}`);
      
      if (stats.failure > 0) {
        process.exitCode = 1; // Exit with error code if any failures
      }
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// ========== START APPLICATION ==========
new App().init();
