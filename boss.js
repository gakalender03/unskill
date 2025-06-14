const { ethers } = require('ethers');

// ================== CONFIGURATION ==================
const CHAINS = {
  SEI: 1328,
  CORN: 21000001
};

const RPC_URLS = {
  SEI: 'https://evm-rpc-testnet.sei-apis.com',
  CORN: 'https://testnet.corn-rpc.com'
};

const UNION_CONTRACT = {
  SEI: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',  // REPLACE WITH ACTUAL CONTRACT
  CORN: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03' // REPLACE WITH ACTUAL CONTRACT
};

// Hardcoded test settings
const GAS_SETTINGS = {
  maxFeePerGas: ethers.parseUnits("1.2", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("1.2", "gwei"),
  gasLimit: 300000
};

const TEST_PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";

// ================== UTILITIES ==================
const providerCache = new Map();

function debugLog(message, data = {}) {
  const timestamp = new Date().toISOString();
  const safeData = {
    ...data,
    ...(data.value ? { value: data.value.toString() } : {}),
    ...(data.amount ? { amount: data.amount.toString() } : {})
  };
  console.log(`[${timestamp}] DEBUG: ${message}`, JSON.stringify(safeData, null, 2));
}

async function getProvider(chainId) {
  if (!providerCache.has(chainId)) {
    const url = RPC_URLS[chainId];
    if (!url) throw new Error(`No RPC URL for ${chainId}`);

    try {
      const provider = new ethers.providers.JsonRpcProvider(url, {
        chainId: Number(CHAINS[chainId]),
        name: chainId.toLowerCase()
      });

      // Test connection
      await provider.getBlockNumber();
      providerCache.set(chainId, provider);
      debugLog(`Connected to RPC`, { url, chainId });
      return provider;
    } catch (error) {
      debugLog(`RPC failed`, { url, error: error.message });
      throw new Error(`RPC connection failed for ${chainId}`);
    }
  }
  return providerCache.get(chainId);
}

async function executeTransaction(contract, method, args, overrides, operationName) {
  const txResponse = await contract[method](...args, overrides);
  debugLog("Transaction sent", {
    operation: operationName,
    hash: txResponse.hash,
    gasLimit: overrides.gasLimit
  });

  const receipt = await txResponse.wait();
  debugLog("Transaction mined", {
    status: receipt.status === 1 ? "success" : "failed",
    gasUsed: receipt.gasUsed.toString()
  });

  if (receipt.status !== 1) throw new Error("Transaction failed on chain");
  return receipt;
}

// ================== MAIN BRIDGE FUNCTION ==================
async function bridgeETH({
  sourceChain,
  destChain,
  amount,
  privateKey,
  recipient = null
}) {
  try {
    // Validate inputs
    if (!CHAINS[sourceChain] || !CHAINS[destChain]) {
      throw new Error(`Unsupported chain pair: ${sourceChain} -> ${destChain}`);
    }
    if (!privateKey || !privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error('Invalid private key format');
    }

    debugLog("Starting ETH bridge", {
      from: sourceChain,
      to: destChain,
      amount: amount.toString()
    });

    // Setup provider and wallet
    const provider = await getProvider(sourceChain);
    const wallet = new ethers.Wallet(privateKey, provider);
    const senderAddress = await wallet.getAddress();
    const recipientAddress = recipient || senderAddress;
    
    // Check bridge contract exists
    const bridgeAddress = UNION_CONTRACT[sourceChain];
    if (!bridgeAddress) throw new Error(`No bridge contract on ${sourceChain}`);

    // Create contract instance
    const bridge = new ethers.Contract(
      bridgeAddress,
      ['function depositNative(uint16 destChainId, address recipient) payable'],
      wallet
    );

    // Execute bridge transfer
    const tx = await executeTransaction(
      bridge,
      'depositNative',
      [
        CHAINS[destChain],   // destination chain ID
        recipientAddress     // recipient address
      ],
      {
        value: ethers.utils.parseEther(amount.toString()),
        ...GAS_SETTINGS
      },
      'ETH Bridge Transfer'
    );

    return tx.hash;

  } catch (error) {
    debugLog("Bridge failed", {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// ================== TEST EXECUTION ==================
(async function main() {
  try {
    console.log("🚀 Starting ETH bridge from SEI to CORN");
    
    const txHash = await bridgeETH({
      sourceChain: 'SEI',
      destChain: 'CORN',
      amount: '0.000001', // 0.000001 ETH
      privateKey: TEST_PRIVATE_KEY
    });

    console.log("✅ Bridge successful! TX Hash:", txHash);
    console.log("⏳ Check the blockchain explorer for confirmation");

  } catch (error) {
    console.error("❌ Bridge failed:", error.message);
    process.exit(1);
  }
})();
