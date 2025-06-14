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
  const timeoutTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
  const salt = ethers.utils.hexlify(randomBytes(32));

  // Construct the IBC transfer payload
  const payload = {
    sender: sender,
    receiver: receiver,
    amount: ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH).toString(),
    denom: "", // Empty for ETH
    memo: "", // Empty memo
  };

  // Create the instruction
  const instruction = {
    type: 0, // IBC type
    subtype: 2, // Transfer subtype
    payload: ethers.utils.defaultAbiCoder.encode(
      [
        "tuple(address sender, address receiver, uint256 amount, string denom, string memo)",
      ],
      [payload]
    ),
  };

  // ABI for the bridge contract
  const iface = new ethers.utils.Interface([
    "function sendToCosmos(string calldata destination, address token, uint256 amount)",
    "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) calldata instruction)",
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
