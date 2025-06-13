const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 300000,  // Fixed gas limit
  EXPLORER_URL: 'https://seitrace.com',
  BRIDGE_AMOUNT: '0.00001', // SEI to bridge
  DESTINATION_CHAIN: 'corn', // Destination chain identifier
  RETRY_COUNT: 30, // Packet hash lookup retries
  RETRY_DELAY: 5000, // Delay between retries in ms
};

// ========== PRIVATE KEYS (Replace with yours) ==========
const PRIVATE_KEYS = [
  '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52', // Wallet 1
  '0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', // Wallet 2
  // Add more private keys...
];

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static formatAddressForHex(address) {
    return address.toLowerCase().replace('0x', '').padStart(40, '0');
  }

  static getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
  }
}

// ========== LOGGER ==========
class Logger {
  log(msg, color = 'white') {
    const colors = {
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[color] || colors.white}${msg}${colors.reset}`);
  }
  
  info(msg) { this.log(`[ℹ] ${msg}`, 'blue'); }
  error(msg) { this.log(`[✗] ${msg}`, 'red'); }
  success(msg) { this.log(`[✓] ${msg}`, 'green'); }
  loading(msg) { this.log(`[⟳] ${msg}`, 'cyan'); }
  warning(msg) { this.log(`[⚠] ${msg}`, 'yellow'); }
}

// ========== TRANSACTION MANAGER ==========
class TransactionManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
  }

  async sendTransaction(wallet, to, amount, options = {}) {
    try {
      const gasLimit = BigInt(CONFIG.GAS_LIMIT);
      const desiredFee = ethers.parseUnits('1.1', 18);
      const gasPrice = desiredFee / gasLimit;

      this.logger.loading(`Sending ${ethers.formatUnits(amount, 18)} SEI to ${to}`);
      this.logger.info(`Gas Price: ${ethers.formatUnits(gasPrice, 18)} SEI per gas`);
      this.logger.info(`Gas Limit: ${gasLimit.toString()}`);

      const tx = await wallet.sendTransaction({
        to,
        value: amount,
        gasLimit,
        gasPrice,
        ...options
      });

      this.logger.loading(`Transaction sent: ${CONFIG.EXPLORER_URL}/tx/${tx.hash}`);
      const receipt = await tx.wait();
      
      this.logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
      return { success: true, receipt };
    } catch (error) {
      this.logger.error(`Transaction failed: ${error.message}`);
      if (error.reason) this.logger.error(`Reason: ${error.reason}`);
      return { success: false, error };
    }
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
    this.txManager = new TransactionManager(provider, logger);
  }

  createInstructionHex(walletAddress) {
    const formattedAddress = Utils.formatAddressForHex(walletAddress);
    return `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014${formattedAddress}00000000000000000000000000000000000000000000000000000000000000000000000000000000000000014${formattedAddress}000000000000000000000000000000000000000000000000000000000000000000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000`;
  }

  async bridgeTokens(wallet, amount, destination) {
    try {
      this.logger.info(`\n=== Starting bridge process for ${wallet.address} ===`);
      this.logger.info(`Amount: ${ethers.formatUnits(amount, 18)} SEI`);
      this.logger.info(`Destination: ${destination}`);

      const instruction = [
        0, // instructionType (uint8)
        2, // instructionVersion (uint8)
        this.createInstructionHex(wallet.address),
      ];

      const iface = new ethers.Interface([
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
      ]);

      const currentTimestamp = Utils.getCurrentTimestamp();
      const timeoutTimestamp = BigInt(currentTimestamp) * BigInt(1000000000);

      const data = iface.encodeFunctionData("send", [
        2, // channelId
        0, // timeoutHeight
        timeoutTimestamp,
        ethers.hexlify(ethers.randomBytes(32)), // salt
        instruction,
      ]);

      const bridgeTx = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        amount,
        { data }
      );

      if (!bridgeTx.success) {
        throw new Error("Bridge transaction failed");
      }

      await this.pollPacketHash(bridgeTx.receipt.hash);
      return true;
    } catch (error) {
      this.logger.error(`Bridge failed for ${wallet.address}: ${error.message}`);
      throw error;
    }
  }

  async pollPacketHash(txHash) {
    this.logger.loading(`Looking up packet hash for tx ${txHash}`);
    
    for (let i = 0; i < CONFIG.RETRY_COUNT; i++) {
      try {
        const response = await axios.post(CONFIG.UNION_GRAPHQL, {
          query: `query ($submission_tx_hash: String!) {
            v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
              packet_hash
            }
          }`,
          variables: { submission_tx_hash: txHash }
        });

        if (response.data?.data?.v2_transfers[0]?.packet_hash) {
          const packetHash = response.data.data.v2_transfers[0].packet_hash;
          this.logger.success(`Packet tracked: https://app.union.build/explorer/transfers/${packet_hash}`);
          return packetHash;
        }
      } catch (error) {
        this.logger.warning(`Attempt ${i+1}/${CONFIG.RETRY_COUNT}: ${error.message}`);
      }
      await Utils.delay(CONFIG.RETRY_DELAY);
    }
    throw new Error("Packet hash not found after maximum retries");
  }
}

// ========== MAIN APPLICATION ==========
class App {
  constructor() {
    this.logger = new Logger();
  }

  async init() {
    try {
      this.logger.info('=== SEI Multi-Wallet Bridge ===');
      this.logger.info(`Network: ${CONFIG.SEI_RPC}`);
      this.logger.info(`Bridge Contract: ${CONFIG.CONTRACT_ADDRESS}`);
      this.logger.info(`Processing ${PRIVATE_KEYS.length} wallets...`);

      const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
      const bridgeManager = new BridgeManager(provider, this.logger);
      const amount = ethers.parseUnits(CONFIG.BRIDGE_AMOUNT, 18);

      for (const [index, privateKey] of PRIVATE_KEYS.entries()) {
        try {
          this.logger.info(`\n=== Processing Wallet ${index + 1}/${PRIVATE_KEYS.length} ===`);
          const wallet = new ethers.Wallet(privateKey, provider);
          
          this.logger.info(`Address: ${wallet.address}`);
          this.logger.info(`Balance: ${ethers.formatUnits(await provider.getBalance(wallet.address), 18)} SEI`);
          
          await bridgeManager.bridgeTokens(wallet, amount, CONFIG.DESTINATION_CHAIN);
          this.logger.success(`Wallet ${index + 1} bridge successful!`);
        } catch (error) {
          this.logger.error(`Error processing wallet ${index + 1}: ${error.message}`);
          continue; // Continue with next wallet even if one fails
        }
      }

      this.logger.success('\n=== All bridge operations completed ===');
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// ========== START ==========
(async () => {
  try {
    await new App().init();
  } catch (error) {
    console.error('Unhandled error:', error);
    process.exit(1);
  }
})();
