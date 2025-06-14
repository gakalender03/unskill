const { ethers } = require('ethers');
const { randomBytes } = require('crypto');

const CONFIG = {
  RPC_URL: 'https://evm-rpc-testnet.sei-apis.com',
  CHAIN_ID: 1328,
  BRIDGE_CONTRACT: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  TEST_PRIVATE_KEY: '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52', // Replace with your private key
  FIXED_AMOUNT_ETH: '0.000001',
  GAS_LIMIT: 300000,
};

// Helper function to encode an address for the payload
function encodeAddress(address) {
  // Remove '0x' prefix and left-pad with zeros to 32 bytes
  return address.replace('0x', '').padStart(64, '0');
}

function generateIBCCallData(senderAddress, recipientAddress) {
  const sender = encodeAddress(senderAddress);
  const receiver = encodeAddress(recipientAddress);

  // Constants for IBC call
  const channelId = 2;
  const timeoutHeight = 0;
  const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000); // Nanoseconds
  const salt = ethers.utils.hexlify(randomBytes(32));

  // Pre-defined instruction payload (with placeholders for sender and receiver)
  const instructionPayload = [
    // Header (dynamic array offset)
    "0000000000000000000000000000000000000000000000000000000000000020",
    // Instruction type (1 = IBC transfer)
    "0000000000000000000000000000000000000000000000000000000000000001",
    // Dynamic offset for payload
    "0000000000000000000000000000000000000000000000000000000000000020",
    // Core parameters (3 fields)
    "0000000000000000000000000000000000000000000000000000000000000003",
    // Offset to sender (0x60)
    "0000000000000000000000000000000000000000000000000000000000000060",
    // Offset to receiver (0x2c0)
    "00000000000000000000000000000000000000000000000000000000000002c0",
    // Offset to SEI footer (0x140)
    "0000000000000000000000000000000000000000000000000000000000000140",
    // Sender address (dynamic - replaced below)
    sender,
    // Receiver address (dynamic - replaced below)
    receiver,
    // Amount (0.000001 ETH in wei)
    "00000000000000000000000000000000000000000000000000000000000f4240",
    // Denom (empty for ETH)
    "0000000000000000000000000000000000000000000000000000000000000000",
    // Memo (empty)
    "0000000000000000000000000000000000000000000000000000000000000000",
    // SEI footer
    "5345490000000000000000000000000000000000000000000000000000000000",
    // Salt
    salt.replace('0x', ''),
    // Timestamp (nanoseconds)
    timeoutTimestamp.toString(16).padStart(64, '0'),
    // Additional padding (matches valid tx)
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000000",
  ].join('');

  // Instruction format: [type, subtype, payload]
  const instruction = [0, 2, '0x' + instructionPayload];

  // ABI for bridge contract
  const iface = new ethers.utils.Interface([
    "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)",
  ]);

  // Encode transaction data
  return iface.encodeFunctionData("send", [
    channelId,
    timeoutHeight,
    timeoutTimestamp,
    salt,
    instruction,
  ]);
}

async function sendFixedAmountIBCTransfer() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.TEST_PRIVATE_KEY, provider);

    const senderAddress = await wallet.getAddress();
    const data = generateIBCCallData(senderAddress, senderAddress);

    const txRequest = {
      to: CONFIG.BRIDGE_CONTRACT,
      data: data,
      value: ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH),
      chainId: CONFIG.CHAIN_ID,
      gasLimit: CONFIG.GAS_LIMIT,
    };

    // Set competitive gas fees
    const feeData = await provider.getFeeData();
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.mul(2) || ethers.utils.parseUnits("2", "gwei");
    txRequest.maxFeePerGas = feeData.maxFeePerGas?.mul(2) || ethers.utils.parseUnits("30", "gwei");

    console.log(`🔄 Sending ${CONFIG.FIXED_AMOUNT_ETH} ETH via IBC...`);
    const tx = await wallet.sendTransaction(txRequest);

    console.log("✅ Transaction submitted:", {
      hash: tx.hash,
      explorer: `https://testnet.seiscan.app/tx/${tx.hash}`,
      data: data,
    });

    return tx.hash;
  } catch (error) {
    console.error("❌ Transfer failed:", error.reason || error.message);
    throw error;
  }
}

// Execute
(async () => {
  try {
    await sendFixedAmountIBCTransfer();
  } catch (error) {
    process.exit(1);
  }
})();
