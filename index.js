const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com', // Sei testnet RPC
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03', // Union Bridge contract address
  GAS_LIMIT: 1000000, // Increased gas limit
  EXPLORER_URL: 'https://sepolia.etherscan.io', // Replace with Sei/Corn explorer if available
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
    console.log(`[${color}] ${msg}`);
  }

  info(msg) { this.log(`[ℹ] ${msg}`, 'green'); }
  warn(msg) { this.log(`[⚠] ${msg}`, 'yellow'); }
  error(msg) { this.log(`[✗] ${msg}`, 'red'); }
  success(msg) { this.log(`[✓] ${msg}`, 'green'); }
  loading(msg) { this.log(`[⟳] ${msg}`, 'cyan'); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
  }

  async sendTransaction(wallet, to, amount, options = {}) {
    try {
      // Estimate gas
      const gasLimit = await wallet.estimateGas({
        to: to,
        value: amount,
        ...options
      });
      this.logger.info(`Estimated gas: ${gasLimit}`);

      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit: gasLimit, // Use estimated gas
        ...options
      });
      const receipt = await tx.wait();
      return { success: true, receipt };
    } catch (error) {
      this.logger.error(`Transaction failed: ${error.message}`);
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
      this.logger.info(`Bridging ${ethers.formatUnits(amount, 18)} SEI to ${destination}`);
      this.logger.info(`Wallet: ${wallet.address}`);

      // Prepare parameters for the `send` function
      const channelId = 2; // Replace with the correct channel ID
      const timeoutHeight = 0; // Replace with the correct timeout height
      const timeoutTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const salt = ethers.hexlify(ethers.randomBytes(32)); // Random salt

      // Encode the `instruction` tuple as an array of its components
      const instruction = [
        1, // instructionType (replace with the correct value)
        1, // instructionVersion (replace with the correct value)
        ethers.toUtf8Bytes(destination), // instructionData (destination as bytes)
      ];

      // Encode the `send` function parameters
      const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint32', 'uint64', 'uint64', 'bytes32', 'tuple(uint8,uint8,bytes)'],
        [channelId, timeoutHeight, timeoutTimestamp, salt, instruction]
      );

      // Add the function selector for `send`
      const functionSelector = ethers.id('send(uint32,uint64,uint64,bytes32,(uint8,uint8,bytes))').slice(0, 10);
      const data = functionSelector + encodedData.slice(2);

      this.logger.info(`Encoded data: ${data}`);

      // Execute bridge (sending native SEI)
      this.logger.loading("Executing bridge transaction...");
      const bridgeTx = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        amount,
        { data } // Send encoded data
      );

      if (bridgeTx.success) {
        this.logger.success(`Bridge tx: ${CONFIG.EXPLORER_URL}/tx/${bridgeTx.receipt.hash}`);
        await this.pollPacketHash(bridgeTx.receipt.hash);
      } else {
        throw new Error("Bridge transaction failed");
      }
    } catch (error) {
      this.logger.error(error.message);
      throw error;
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
          return;
        }
      } catch (error) {
        this.logger.warn(`Retrying packet hash lookup... (${i+1}/${retries})`);
      }
      await Utils.delay(intervalMs);
    }
    throw new Error("Packet hash not found");
  }
}

// ========== MAIN APPLICATION ==========
class App {
  constructor() {
    this.logger = new Logger();
  }

  async init() {
    try {
      this.logger.info('Initializing bridge application...');
      
      // Setup provider and wallet (replace with your private key)
      const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
      const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider); // Replace with your actual private key
      
      // Initialize bridge manager
      const bridgeManager = new BridgeManager(provider, this.logger);
      
      // Set amount to bridge (0.0001 SEI)
      const amount = ethers.parseUnits('0.0001', 18); // 0.0001 SEI
      
      // Execute bridge to Corn testnet
      await bridgeManager.bridgeTokens(wallet, amount, 'corn');
      
      this.logger.info('Bridge completed successfully!');
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// ========== START APPLICATION ==========
new App().init();
