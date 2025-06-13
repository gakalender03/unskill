const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  GAS_LIMIT: 1000000,
  EXPLORER_URL: 'https://seitrace.com',
};

// ========== PRIVATE KEYS (Replace with yours) ==========
const PRIVATE_KEYS = [
  '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52', // Wallet 1 (0x1D90...)
  '0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', // Wallet 2
//  '0xabcd...', // Wallet 3
  // Add more private keys...
];

// ========== UTILITIES ==========
class Utils {
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static formatAddressForHex(address) {
    // Remove '0x' and pad to 40 characters (20 bytes)
    return address.toLowerCase().replace('0x', '').padStart(40, '0');
  }
}

// ========== LOGGER ==========
class Logger {
  log(msg, color = 'white') {
    console.log(`[${color}] ${msg}`);
  }
  info(msg) { this.log(`[ℹ] ${msg}`, 'green'); }
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
      const gasLimit = await wallet.estimateGas({
        to: to,
        value: amount,
        ...options
      });
      
      const tx = await wallet.sendTransaction({
        to: to,
        value: amount,
        gasLimit,
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
    this.txManager = new TransactionManager(provider, logger);
  }

  // Helper: Create instruction hex with dynamic wallet address
  createInstructionHex(walletAddress) {
    const formattedAddress = Utils.formatAddressForHex(walletAddress);
    // Hex template with wallet address injected (replaces old 0xa80...)
    return `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000000${formattedAddress}000000000000000000000000000000000000000000000000000000000000000000000000000000000000000${formattedAddress}000000000000000000000000000000000000000000000000000000000000000000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000`;
  }

  async bridgeTokens(wallet, amount, destination) {
    try {
      this.logger.info(`Bridging ${ethers.formatUnits(amount, 18)} SEI to ${destination}`);
      this.logger.info(`Wallet: ${wallet.address}`);

      const instruction = [
        0, // instructionType (uint8)
        2, // instructionVersion (uint8)
        this.createInstructionHex(wallet.address), // Dynamic wallet address injected
      ];

      const iface = new ethers.Interface([
        "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)"
      ]);

      const data = iface.encodeFunctionData("send", [
        2, // channelId
        0, // timeoutHeight
        BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000), // timeoutTimestamp
        ethers.hexlify(ethers.randomBytes(32)), // salt
        instruction,
      ]);

      this.logger.loading("Executing bridge transaction...");
      const bridgeTx = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        amount,
        { data }
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

        if (response.data?.data?.v2_transfers[0]?.packet_hash) {
          this.logger.success(`Packet tracked: https://app.union.build/explorer/transfers/${response.data.data.v2_transfers[0].packet_hash}`);
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
      this.logger.info('Initializing multi-wallet bridge...');
      const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
      const bridgeManager = new BridgeManager(provider, this.logger);
      const amount = ethers.parseUnits('0.000001', 18); // 0.0001 SEI

      // Loop through each private key & bridge tokens
      for (const privateKey of PRIVATE_KEYS) {
        this.logger.info(`\n==== Processing Wallet: ${privateKey.slice(0, 10)}... ====`);
        const wallet = new ethers.Wallet(privateKey, provider);
        await bridgeManager.bridgeTokens(wallet, amount, 'corn');
      }

      this.logger.success('All bridge transactions completed!');
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// ========== START ==========
new App().init();
