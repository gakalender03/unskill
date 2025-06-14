const { ethers } = require('ethers');
const { randomBytes } = require('crypto');

// ================== CONFIGURATION ==================
const CONFIG = {
  RPC_URL: 'https://evm-rpc-testnet.sei-apis.com',
  CHAIN_ID: 1328,
  BRIDGE_CONTRACT: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  TEST_PRIVATE_KEY: '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52',
  FIXED_AMOUNT_ETH: '0.000001', // Exactly 0.000001 ETH
  GAS_LIMIT: 300000,
};

// ================== IBC PAYLOAD GENERATOR ==================

function generateIBCCallData(senderAddress, recipientAddress) {
  const sender = ethers.utils.getAddress(senderAddress);
  const receiver = ethers.utils.getAddress(recipientAddress);

  // Constants for the IBC call
  const channelId = 2;
  const timeoutHeight = 0;
  const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
  const salt = ethers.utils.hexlify(randomBytes(32));

  // Helper function to ensure proper hex padding
  const toPaddedHex = (value, bytes = 32) => {
    const hex = ethers.utils.hexlify(value);
    return ethers.utils.hexZeroPad(hex, bytes).slice(2);
  };

  // Construct the payload parts
  const payloadHex = [
    // Header (dynamic array offset)
    "0000000000000000000000000000000000000000000000000000000000000020",
    // Instruction type (1 = IBC transfer)
    "0000000000000000000000000000000000000000000000000000000000000001",
    // Dynamic offset for payload (0x20 = 32 bytes)
    "0000000000000000000000000000000000000000000000000000000000000020",
    // Core parameters (3 fields)
    "0000000000000000000000000000000000000000000000000000000000000003",
    // Offset to sender (0x60 = 96 bytes)
    "0000000000000000000000000000000000000000000000000000000000000060",
    // Offset to receiver (0x2c0 = 704 bytes)
    "00000000000000000000000000000000000000000000000000000000000002c0",
    // Offset to SEI footer (0x140 = 320 bytes)
    "0000000000000000000000000000000000000000000000000000000000000140",
    // Sender address
    toPaddedHex(sender),
    // Receiver address
    toPaddedHex(receiver),
    // Amount (0.000001 ETH in wei)
    toPaddedHex(ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH)),
    // Denom (empty for ETH)
    "0000000000000000000000000000000000000000000000000000000000000000",
    // Memo (empty)
    "0000000000000000000000000000000000000000000000000000000000000000",
    // SEI-specific footer
    "5345490000000000000000000000000000000000000000000000000000000000",
    // Salt (now placed right after SEI footer)
    salt.slice(2),
    // Timestamp (now placed after salt)
    toPaddedHex(timeoutTimestamp)
  ].join('');

  // Validate the payloadHex
  if (!ethers.utils.isHexString('0x' + payloadHex)) {
    throw new Error('Generated payload is not a valid hex string');
  }

  // Instruction format: [type, subtype, payload]
  const instruction = [
    0, // Type 0 (IBC)
    2, // Subtype 2 (transfer)
    '0x' + payloadHex
  ];

  // ABI for the bridge contract
  const iface = new ethers.utils.Interface([
    "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)",
  ]);

  // Encode the transaction
  const data = iface.encodeFunctionData("send", [
    channelId,
    timeoutHeight,
    timeoutTimestamp,
    salt,
    instruction,
  ]);

  return data;
}

// ================== TRANSACTION EXECUTOR ==================
async function sendFixedAmountIBCTransfer() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.TEST_PRIVATE_KEY, provider);

    const senderAddress = await wallet.getAddress();
    const payload = generateIBCCallData(senderAddress, senderAddress);

    const txRequest = {
      to: CONFIG.BRIDGE_CONTRACT,
      data: payload,
      value: ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH),
      chainId: CONFIG.CHAIN_ID,
      gasLimit: CONFIG.GAS_LIMIT,
    };

    const feeData = await provider.getFeeData();
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.mul(2) || ethers.utils.parseUnits("2", "gwei");
    txRequest.maxFeePerGas = feeData.maxFeePerGas?.mul(2) || ethers.utils.parseUnits("30", "gwei");

    console.log(`🔄 Sending ${CONFIG.FIXED_AMOUNT_ETH} ETH via IBC...`);
    const tx = await wallet.sendTransaction(txRequest);

    console.log("✅ Transaction broadcasted:", {
      hash: tx.hash,
      explorer: `https://testnet.seiscan.app/tx/${tx.hash}`,
      amount: CONFIG.FIXED_AMOUNT_ETH,
    });

    return tx.hash;
  } catch (error) {
    console.error("❌ Transfer failed:", error.reason || error.message);
    throw error;
  }
}

// ================== MAIN EXECUTION ==================
(async () => {
  try {
    await sendFixedAmountIBCTransfer();
  } catch (error) {
    process.exit(1);
  }
})();
