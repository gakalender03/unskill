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

  const payloadSegments = [
    // Function selector
    "0xff0d7c2f",

    // Header with instruction 0 and 2
    "0000000000000000000000000000000000000000000000000000000000000000", // Instruction 0
    "0000000000000000000000000000000000000000000000000000000000000002", // Instruction 2

    // Core parameters
    "0000000000000000000000000000000000000000000000000000000000000020", // Data length
    "0000000000000000000000000000000000000000000000000000000000000001", // Version

    // Transaction details
    "0000000000000000000000000000000000000000000000000000000000000003", // Position 3
    "0000000000000000000000000000000000000000000000000000000000000060", // Offset for sender
    "00000000000000000000000000000000000000000000000000000000000002c0", // Offset for receiver
    "0000000000000000000000000000000000000000000000000000000000000140", // Offset for footer

    // Sender address (padded to 32 bytes)
    ethers.utils.hexZeroPad(sender.toLowerCase(), 32).slice(2),

    // Receiver address (padded to 32 bytes)
    ethers.utils.hexZeroPad(receiver.toLowerCase(), 32).slice(2),

    // Footer with SEI-specific data
    "0000000000000000000000000000000000000000000000000000000000000003", // Position 3 (enforced)
    "5345490000000000000000000000000000000000000000000000000000000000", // SEI identifier
    "0000000000000000000000000000000000000000000000000000000014e86bed", // SEI-specific data
    "5b0813430df660d17363b89fe9bd8232d8000000000000000000000000", // SEI-specific data
  ];

  return payloadSegments.join('');
}



// ================== TRANSACTION EXECUTOR ==================
async function sendFixedAmountIBCTransfer() {
  try {
    // 1. Initialize provider and wallet
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.TEST_PRIVATE_KEY, provider);
    
    // 2. Generate payload (sending to self in this example)
    const senderAddress = await wallet.getAddress();
    const payload = generateIBCCallData(senderAddress, senderAddress);
    
    // 3. Prepare transaction (with gas optimization)
    const txRequest = {
      to: CONFIG.BRIDGE_CONTRACT,
      data: "0xff0d7c2f" + payload.slice(2), // Function selector + payload
      value: ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH),
      chainId: CONFIG.CHAIN_ID,
      gasLimit: CONFIG.GAS_LIMIT,
    };
    
    // 4. Dynamic gas pricing (EIP-1559)
    const feeData = await provider.getFeeData();
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.mul(2) || ethers.utils.parseUnits("2", "gwei");
    txRequest.maxFeePerGas = feeData.maxFeePerGas?.mul(2) || ethers.utils.parseUnits("30", "gwei");
    
    // 5. Execute transfer
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
    process.exit(1); // Exit with error code
  }
})();
