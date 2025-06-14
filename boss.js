import { ethers } from 'ethers';

// ================== CONFIGURATION ==================
const CHAINS = {
  SEI: 1328,        // SEI chain ID
  CORN: 21000001    // CORN chain ID
};

const RPC_URLS = {
  SEI: 'https://evm-rpc-testnet.sei-apis.com',  // SEI RPC
  CORN: 'https://testnet.corn-rpc.com'          // CORN RPC
};

const UNION_CONTRACT = {
  SEI: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',     // Add SEI bridge contract address
  CORN: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03'     // Add CORN bridge contract address
};

// Hardcoded gas settings
const GAS_SETTINGS = {
  maxFeePerGas: ethers.parseUnits("1.2", "gwei"),  // 1.2 Gwei
  maxPriorityFeePerGas: ethers.parseUnits("1.2", "gwei"),  // 1.2 Gwei
  gasLimit: 300000                                // 300,000 gas limit
};

// Hardcoded private key for testing
const TEST_PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";

// ================== UTILITIES ==================
const providerCache = new Map();

const debugLog = (message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] DEBUG: ${message}`, JSON.stringify({
    ...data,
    ...(data.value ? { value: data.value.toString() } : {}),
    ...(data.amount ? { amount: data.amount.toString() } : {})
  }, null, 2));
};

const getProvider = async (chainId) => {
  if (!providerCache.has(chainId)) {
    const url = RPC_URLS[chainId];
    if (!url) throw new Error(`No RPC URL configured for ${chainId}`);

    try {
      const provider = new ethers.JsonRpcProvider(url, {
        chainId: Number(CHAINS[chainId]),
        name: chainId.toLowerCase()
      });

      await provider.getBlockNumber(); // Test connection
      providerCache.set(chainId, provider);
      debugLog(`Connected to RPC`, { url, chainId });
      return provider;
    } catch (error) {
      debugLog(`RPC endpoint failed`, { url, error: error.message });
      throw new Error(`Failed to connect to RPC for ${chainId}`);
    }
  }
  return providerCache.get(chainId);
};

const executeTransaction = async (contract, method, args, overrides, operationName) => {
  const txResponse = await contract[method](...args, overrides);
  debugLog("Transaction submitted", {
    operation: operationName,
    hash: txResponse.hash,
    gasLimit: txResponse.gasLimit.toString()
  });

  const receipt = await txResponse.wait();
  debugLog("Transaction mined", {
    status: receipt.status === 1 ? "success" : "failed",
    gasUsed: receipt.gasUsed.toString()
  });

  if (receipt.status !== 1) throw new Error("Transaction failed");
  return receipt;
};

// ================== MAIN BRIDGE FUNCTION ==================
export const bridgeETH = async ({
  sourceChain,
  destChain,
  amount,
  privateKey,
  recipient = null,
  referral = ethers.ZeroAddress
}) => {
  // Validate inputs
  if (!CHAINS[sourceChain] || !CHAINS[destChain]) {
    throw new Error(`Unsupported chains: ${sourceChain} → ${destChain}`);
  }
  if (!privateKey?.match(/^0x[0-9a-fA-F]{64}$/)) {
    throw new Error('Invalid private key format');
  }

  debugLog("Starting ETH bridge transfer", { sourceChain, destChain, amount });

  const provider = await getProvider(sourceChain);
  const wallet = new ethers.Wallet(privateKey, provider);
  const senderAddress = await wallet.getAddress();
  const recipientAddress = recipient ? ethers.getAddress(recipient) : senderAddress;
  const bridgeAddress = UNION_CONTRACT[sourceChain];

  if (!bridgeAddress) throw new Error(`No bridge contract for ${sourceChain}`);

  // Bridge ETH (native token)
  const bridge = new ethers.Contract(bridgeAddress, [
    'function depositNative(uint16 destChainId, address recipient, address referral) payable'
  ], wallet);

  const value = ethers.parseEther(amount.toString());
  const tx = await executeTransaction(
    bridge,
    'depositNative',
    [CHAINS[destChain], recipientAddress, referral],
    { value, ...GAS_SETTINGS },
    'nativeDeposit'
  );

  return tx.hash;
};

// ================== EXAMPLE USAGE ==================
const exampleBridge = async () => {
  try {
    console.log("Starting ETH bridge from SEI to CORN...");

    const txHash = await bridgeETH({
      sourceChain: 'SEI',
      destChain: 'CORN',
      amount: '0.000001', // 0.000001 ETH
      privateKey: TEST_PRIVATE_KEY
    });

    console.log('Bridge successful! TX Hash:', txHash);
  } catch (error) {
    console.error('Bridge failed:', error.message);
    process.exit(1);
  }
};

// Execute the bridge example
exampleBridge();
