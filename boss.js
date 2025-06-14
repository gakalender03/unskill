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

// IBC-specific parameters (based on your data)
const IBC_PARAMS = {
  channelId: 2, // uint32
  timeoutHeight: 0, // uint64
  timeoutTimestamp: "1749851613000000000", // uint64
  salt: "0x6b396f686fc220e5e22b48226140117c553f16b6c6ae2bd0150d4a4e068d2ec8", // bytes32
  instruction: {
    version: 0, // uint8
    action: 2, // uint8
    payload: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000", // bytes
  },
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

// ================== MAIN BRIDGE FUNCTION ==================
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

    debugLog("Starting ETH bridge", {
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

    // Create contract instance
    const bridge = new ethers.Contract(
      bridgeAddress,
      [
        'function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction) payable',
      ],
      wallet
    );

    // Execute bridge transfer
    const tx = await executeTransaction(
      bridge,
      'send',
      [
        IBC_PARAMS.channelId,
        IBC_PARAMS.timeoutHeight,
        IBC_PARAMS.timeoutTimestamp,
        IBC_PARAMS.salt,
        [IBC_PARAMS.instruction.version, IBC_PARAMS.instruction.action, IBC_PARAMS.instruction.payload],
      ],
      {
        value: ethers.utils.parseEther(amount.toString()),
        ...GAS_SETTINGS,
      },
      'ETH Bridge Transfer'
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
    console.log("🚀 Starting ETH bridge from SEI to CORN");
    
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
