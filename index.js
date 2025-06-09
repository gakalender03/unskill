const { ethers } = require('ethers');
const axios = require('axios');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

// ========== CONFIGURATION ==========
const CONFIG = {
  SEI_RPC: 'https://evm-rpc-testnet.sei-apis.com',
  UNION_GRAPHQL: 'https://graphql.union.build/v1/graphql',
  CONTRACT_ADDRESS: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03', // Replace with actual Union contract
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
  constructor(logBox) {
    this.logBox = logBox;
  }

  log(msg, color = 'white') {
    this.logBox.log(`{${color}-fg}${msg}{/${color}-fg}`);
    screen.render();
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
      const tx = await contract[method](...args, { gasLimit: CONFIG.GAS_LIMIT, ...options });
      const receipt = await tx.wait();
      return { success: true, receipt };
    } catch (error) {
      return { success: false, error };
    }
  }

  async checkBalanceAndApprove(wallet, tokenAddress, abi, spender, tokenName) {
    const tokenContract = new ethers.Contract(tokenAddress, abi, wallet);
    const balance = await tokenContract.balanceOf(wallet.address);

    if (balance === 0n) {
      this.logger.error(`Insufficient ${tokenName} balance`);
      return false;
    }

    const allowance = await tokenContract.allowance(wallet.address, spender);
    if (allowance === 0n) {
      this.logger.loading(`Approving ${tokenName}...`);
      const { success } = await this.sendTransaction(
        wallet,
        tokenAddress,
        abi,
        'approve',
        [spender, ethers.MaxUint256]
      );

      if (!success) {
        this.logger.error(`Approval failed`);
        return false;
      }
    }
    return true;
  }
}

// ========== BRIDGE MANAGER ==========
class BridgeManager {
  constructor(provider, logger) {
    this.provider = provider;
    this.logger = logger;
    this.txManager = new TransactionManager(provider, logger);
  }

  async bridgeTokens(wallet, tokenAddress, abi, amount, destination) {
    try {
      // Step 1: Check balance and approve
      const approved = await this.txManager.checkBalanceAndApprove(
        wallet,
        tokenAddress,
        abi,
        CONFIG.CONTRACT_ADDRESS,
        'Token'
      );
      if (!approved) return;

      // Step 2: Send bridge transaction
      this.logger.loading(`Bridging tokens to ${destination}...`);
      const { success, receipt } = await this.txManager.sendTransaction(
        wallet,
        CONFIG.CONTRACT_ADDRESS,
        BRIDGE_ABI,
        'bridgeTokens',
        [tokenAddress, amount, destination]
      );

      if (success) {
        this.logger.success(`Bridge confirmed: ${CONFIG.EXPLORER_URL}/tx/${receipt.hash}`);
        await this.pollPacketHash(receipt.hash);
      } else {
        this.logger.error(`Bridge failed: ${receipt.error.message}`);
      }
    } catch (error) {
      this.logger.error(`Bridge error: ${error.message}`);
    }
  }

  async pollPacketHash(txHash, retries = 50, intervalMs = 5000) {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.post(CONFIG.UNION_GRAPHQL, {
          query: `query ($submission_tx_hash: String!) {
            v2_transfers(args: {p_transaction_hash: $submission_tx_hash}) {
              packet_hash
            }
          }`,
          variables: { submission_tx_hash: txHash.startsWith('0x') ? txHash : `0x${txHash}` },
        });

        const packetHash = res.data?.data?.v2_transfers[0]?.packet_hash;
        if (packetHash) {
          this.logger.success(`Packet submitted: https://app.union.build/explorer/transfers/${packetHash}`);
          return;
        }
      } catch (error) {
        this.logger.error(`Polling error: ${error.message}`);
      }
      await Utils.delay(intervalMs);
    }
    this.logger.error(`Packet hash not found for tx: ${txHash}`);
  }
}

// ========== MAIN APPLICATION ==========
class App {
  constructor() {
    this.ui = blessed.screen({ smartCSR: true, title: 'Sei EVM to Corn Bridge' });
    this.logBox = contrib.log({ fg: 'green', label: 'Logs', border: { type: 'line', fg: 'cyan' } });
    this.ui.append(this.logBox);
    this.logger = new Logger(this.logBox);
  }

  async init() {
    this.logger.info('Initializing bridge application...');
    const provider = new ethers.JsonRpcProvider(CONFIG.SEI_RPC);
    const bridgeManager = new BridgeManager(provider, this.logger);

    // Example wallet (replace with your wallet)
    const privateKey = '0x81f8cb133e86d1ab49dd619581f2d37617235f59f1398daee26627fdeb427fbe'; // Replace with actual private key
    const wallet = new ethers.Wallet(privateKey, provider);

    // Example token (replace with actual token details)
    const tokenAddress = 'native'; // Replace with actual token address
    const tokenAbi = [/* Your token ABI here */];

    // Bridge tokens
    const amount = ethers.parseUnits('10', 18); // 10 tokens (adjust decimals as needed)
    await bridgeManager.bridgeTokens(wallet, tokenAddress, tokenAbi, amount, 'corn');

    this.logger.info('Bridge process completed.');
  }
}

// ========== START APPLICATION ==========
const app = new App();
app.init().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
