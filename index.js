const { ethers } = require('ethers');
const axios = require('axios');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03', // Replace with actual Union bridge contract
  GAS_LIMIT: 500000,
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
  constructor() {}

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

  async sendTransaction(wallet, contractAddress, abi, method, args, options = {}) {
    try {
      const contract = new ethers.Contract(contractAddress, abi, wallet);
      const tx = await contract[method](...args, { 
        gasLimit: CONFIG.GAS_LIMIT, 
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

  async bridgeTokens(wallet, tokenAddress, abi, amount, destination) {
    try {
      this.logger.info(`Bridging ${ethers.formatUnits(amount, 18)} tokens to ${destination}`);
      this.logger.info(`Wallet: ${wallet.address}`);

      // Check token balance
      const tokenContract = new ethers.Contract(tokenAddress, abi, wallet);
      const balance = await tokenContract.balanceOf(wallet.address);

      if (balance < amount) {
        throw new Error(`Insufficient balance. Needed: ${ethers.formatUnits(amount, 18)}, Have: ${ethers.formatUnits(balance, 18)}`);
      }

      // Approve token spending
      this.logger.loading("Approving token spending...");
      const approveTx = await this.txManager.sendTransaction(
        wallet,
        tokenAddress,
        abi,
        'approve',
        [CONFIG.CONTRACT_ADDRESS, amount]
      );

      if (!approveTx.success) {
        throw new Error("Token approval failed");
      }

      // Execute bridge
      this.logger.loading("Executing bridge transaction...");
      const bridgeTx = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        BRIDGE_ABI,
        'bridgeTokens',
        [tokenAddress, amount, destination]
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
      const wallet = new ethers.Wallet('0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe', provider); // <- REPLACE THIS
      
      // Initialize bridge manager
      const bridgeManager = new BridgeManager(provider, this.logger);
      
      // Token details (replace with your token)
      const tokenAddress = 'native'; // <- REPLACE THIS
      const tokenAbi = [/* Your ERC20 ABI here */]; // <- REPLACE THIS
      const amount = ethers.parseUnits('10', 18); // 10 tokens
      
      // Execute bridge
      await bridgeManager.bridgeTokens(wallet, tokenAddress, tokenAbi, amount, 'corn');
      
      this.logger.info('Bridge completed successfully!');
    } catch (error) {
      this.logger.error(`Fatal error: ${error.message}`);
      process.exit(1);
    }
  }
}

// ========== BRIDGE ABI (SIMPLIFIED) ==========
const BRIDGE_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "token", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "string", "name": "destination", "type": "string"}
    ],
    "name": "bridgeTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ========== START APPLICATION ==========
new App().init();
