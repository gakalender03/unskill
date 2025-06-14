const { ethers } = require('ethers');

// ================== CONFIGURATION ==================
const CHAINS = {
  SEI: 1328,
  CORN: 21000001,
};

const RPC_URLS = {
  SEI: 'https://evm-rpc-testnet.sei-apis.com',
  CORN: 'https://testnet.corn-rpc.com',
};

const UNION_CONTRACT = {
  SEI: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',  // REPLACE IF NEEDED
  CORN: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03', // REPLACE IF NEEDED
};

// Hardcoded test settings
const GAS_SETTINGS = {
  gasPrice: ethers.utils.parseUnits("1.2", "gwei"),
  gasLimit: ethers.BigNumber.from(300000),
};

const TEST_PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";

// IBC-specific parameters (adjust as needed)
const IBC_PARAMS = {
  channelId: 0,       // Replace with actual channel ID
  timeoutHeight: 0,   // Replace with block height timeout
  timeoutTimestamp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  salt: ethers.utils.formatBytes32String("sei-corn-bridge"), // Random salt
};

// ================== UTILITIES ==================
const providerCache = new Map();

function debugLog(message, data = {}) {
  const timestamp = new Date().toISOString();
  const safeData = {
    ...data,
    ...(data.value ? { value: data.value.toString() } : {}),
    ...(data.amount ? { amount: data.amount.toString() } : {}),
  };
  console.log(`[${timestamp}] DEBUG: ${message}`, JSON.stringify(safeData, null, 2));
}

async function getProvider(chainId) {
  if (!providerCache.has(chainId)) {
    const url = RPC_URLS[chainId];
    if (!url) throw new Error(`No RPC URL for ${chainId}`);

    try {
      const provider = new ethers.providers.JsonRpcProvider(url, {
        chainId: CHAINS[chainId],
        name: chainId.toLowerCase(),
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
    gasLimit: overrides.gasLimit.toString(),
  });

  const receipt = await txResponse.wait();
  debugLog("Transaction mined", {
    status: receipt.status === 1 ? "success" : "failed",
    gasUsed: receipt.gasUsed.toString(),
  });

  if (receipt.status !== 1) throw new Error("Transaction failed on chain");
  return receipt;
}

// ================== MAIN BRIDGE FUNCTION (IBC-compatible) ==================
async function bridgeETH({
  sourceChain,
  destChain,
  amount,
  privateKey,
  recipient = null,
}) {
  try {
    // Validate inputs
    if (!CHAINS[sourceChain] || !CHAINS[destChain]) {
      throw new Error(`Unsupported chain pair: ${sourceChain} -> ${destChain}`);
    }
    if (!privateKey || !privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error('Invalid private key format');
    }

    debugLog("Starting ETH bridge (IBC)", {
      from: sourceChain,
      to: destChain,
      amount: amount.toString(),
    });

    // Setup provider and wallet
    const provider = await getProvider(sourceChain);
    const wallet = new ethers.Wallet(privateKey, provider);
    const senderAddress = await wallet.getAddress();
    const recipientAddress = recipient || senderAddress;

    // Check bridge contract exists
    const bridgeAddress = UNION_CONTRACT[sourceChain];
    if (!bridgeAddress) throw new Error(`No bridge contract on ${sourceChain}`);

    // Create contract instance (ABI includes `send` function)
    const bridge = new ethers.Contract(
      bridgeAddress,
      [
        'function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction) payable',
      ],
      wallet
    );

    // Construct the IBC instruction (adjust based on contract requirements)
    const instruction = {
      // Example: (uint8 version, uint8 action, bytes payload)
      // Replace with actual values expected by the contract
      0: 1, // version
      1: 1, // action (1 = transfer)
      2: ethers.utils.defaultAbiCoder.encode(
        ["address", "uint256"],
        [recipientAddress, ethers.utils.parseEther(amount.toString())]
      ),
    };

    // Execute bridge transfer
    const tx = await executeTransaction(
      bridge,
      'send',
      [
        IBC_PARAMS.channelId,
        IBC_PARAMS.timeoutHeight,
        IBC_PARAMS.timeoutTimestamp,
        IBC_PARAMS.salt,
        instruction,
      ],
      {
        value: ethers.utils.parseEther(amount.toString()),
        ...GAS_SETTINGS,
      },
      'IBC Bridge Transfer'
    );

    return tx.hash;

  } catch (error) {
    debugLog("Bridge failed", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// ================== TEST EXECUTION ==================
(async function main() {
  try {
    console.log("🚀 Starting ETH bridge from SEI to CORN (IBC)");
    
    const txHash = await bridgeETH({
      sourceChain: 'SEI',
      destChain: 'CORN',
      amount: '0.000001', // 0.000001 ETH
      privateKey: TEST_PRIVATE_KEY,
    });

    console.log("✅ Bridge successful! TX Hash:", txHash);
    console.log("⏳ Check the blockchain explorer for confirmation");

  } catch (error) {
    console.error("❌ Bridge failed:", error.message);
    process.exit(1);
  }
})();
