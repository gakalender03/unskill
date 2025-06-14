const { ethers } = require('ethers');

const CONFIG = {
  RPC_URL: 'https://evm-rpc-testnet.sei-apis.com',
  CHAIN_ID: 1328,
  BRIDGE_CONTRACT: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  TEST_PRIVATE_KEY: '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52',
  GAS_LIMIT: 300000,
};

function generateStaticIBCCallData() {
  // This is the EXACT payload from your valid transaction
  const staticPayload = 
    '0000000000000000000000000000000000000000000000000000000000000020' + // Header (dynamic array offset)
    '0000000000000000000000000000000000000000000000000000000000000001' + // Instruction type (1 = IBC transfer)
    '0000000000000000000000000000000000000000000000000000000000000020' + // Payload offset
    '0000000000000000000000000000000000000000000000000000000000000001' + // Core parameters (1 field)
    '0000000000000000000000000000000000000000000000000000000000000060' + // Parameters offset
    '0000000000000000000000000000000000000000000000000000000000000003' + // Fields count
    '0000000000000000000000000000000000000000000000000000000000000180' + // Sender offset
    '00000000000000000000000000000000000000000000000000000000000001c0' + // Receiver offset
    '0000000000000000000000000000000000000000000000000000000000000240' + // SEI footer offset
    '00000000000000000000000000000000000000000000000000000000e8d4a510' + // Amount (0.000001 ETH)
    '0000000000000000000000000000000000000000000000000000000000000002' + // Denom (2 = ETH)
    '0000000000000000000000000000000000000000000000000000000000000000' + // Memo (empty)
    '00000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b' + // Sender address
    '00000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b' + // Receiver address
    '00000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' + // ??
    '0000000000000000000000000000000000000000000000000000000000000000' + // ??
    '0000000000000000000000000000000000000000000000000000000000000000' + // ??
    '0000000000000000000000000000000000000000000000000000000000000353' + // SEI marker pt1
    '4549000000000000000000000000000000000000000000000000000000000000' + // SEI marker pt2
    '0000000000000000000000000000000000000000000000000000000000000353' + // SEI marker pt3
    '6569000000000000000000000000000000000000000000000000000000000000' + // SEI marker pt4
    '00000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8' + // Salt (static)
    '0000000000000000000000000000000000000000000000001847b9e8b9b00000'; // timeoutTimestamp (1749901592280000000)

  // Instruction format: [type, subtype, payload]
  const instruction = [0, 2, '0x' + staticPayload];

  // ABI for bridge contract
  const iface = new ethers.utils.Interface([
    "function send(uint32 channelId, uint64 timeoutHeight, uint64 timeoutTimestamp, bytes32 salt, (uint8,uint8,bytes) instruction)",
  ]);

  // Static parameters matching the example
  return iface.encodeFunctionData("send", [
    2, // channelId
    0, // timeoutHeight
    '1749901592280000000', // timeoutTimestamp (static value)
    '0xe86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000', // static salt
    instruction
  ]);
}

async function sendFixedAmountIBCTransfer() {
  try {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(CONFIG.TEST_PRIVATE_KEY, provider);

    const data = generateStaticIBCCallData();

    const txRequest = {
      to: CONFIG.BRIDGE_CONTRACT,
      data: data,
      value: ethers.utils.parseEther("0.000001"), // Must match static amount
      chainId: CONFIG.CHAIN_ID,
      gasLimit: CONFIG.GAS_LIMIT,
    };

    // Set gas fees (can keep dynamic for better UX)
    const feeData = await provider.getFeeData();
    txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas?.mul(2) || ethers.utils.parseUnits("2", "gwei");
    txRequest.maxFeePerGas = feeData.maxFeePerGas?.mul(2) || ethers.utils.parseUnits("30", "gwei");

    console.log("🔄 Sending 0.000001 ETH via IBC (static payload)...");
    const tx = await wallet.sendTransaction(txRequest);

    console.log("✅ Transaction submitted:", {
      hash: tx.hash,
      explorer: `https://testnet.seiscan.app/tx/${tx.hash}`,
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
