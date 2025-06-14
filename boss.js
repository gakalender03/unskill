const { ethers } = require('ethers');
const { randomBytes } = require('crypto');

const CONFIG = {
  RPC_URL: 'https://evm-rpc-testnet.sei-apis.com',
  CHAIN_ID: 1328,
  BRIDGE_CONTRACT: '0x5FbE74A283f7954f10AA04C2eDf55578811aeb03',
  TEST_PRIVATE_KEY: '0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52',
  FIXED_AMOUNT_ETH: '0.000001',
  GAS_LIMIT: 300000,
};

// Logger utility (mock implementation - replace with your actual logger)
const Logger = {
  info: (message) => console.log(message),
};

// Transaction manager (mock implementation)
const TransactionManager = {
  sendTransaction: async (wallet, to, value, nonce, gasPrice, txOptions) => {
    const tx = await wallet.sendTransaction({
      to,
      value,
      nonce,
      gasPrice,
      ...txOptions
    });
    return tx;
  }
};

function generateIBCCallData(senderAddress, recipientAddress) {
  const sender = ethers.utils.getAddress(senderAddress);
  const receiver = ethers.utils.getAddress(recipientAddress);

  // Constants for IBC call
  const channelId = 2;
  const timeoutHeight = 0;
  const timeoutTimestamp = BigInt(Math.floor(Date.now() / 1000)) * BigInt(1000000000);
  const salt = ethers.utils.hexlify(randomBytes(32));

  // Pre-defined instruction payload from your data
  const instructionPayload = "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c0000000000000000000000000000000000000000000000000000000e8d4a5100000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000280000000000000000000000000000000000000000000000000000000e8d4a510000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014a8068e71a3f46c888c39ea5deba318c16393573b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000014eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee00000000000000000000000000000000000000000000000000000000000000000000000000000000000000035345490000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000353656900000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000014e86bed5b0813430df660d17363b89fe9bd8232d8000000000000000000000000";

  // Instruction format: [type, subtype, payload]
  const instruction = [0, 2, instructionPayload];

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
    const nonce = await provider.getTransactionCount(senderAddress);
    const gasPrice = await provider.getGasPrice();
    
    // Log gas price info
    const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
    Logger.info(`[${wallet.address.slice(0, 6)}] Tx ${nonce} using gas price: ${parseFloat(gasPriceGwei).toFixed(5)} Gwei`);

    const data = generateIBCCallData(senderAddress, senderAddress);
    const amount = ethers.utils.parseEther(CONFIG.FIXED_AMOUNT_ETH);

    const result = await TransactionManager.sendTransaction(
      wallet,
      CONFIG.BRIDGE_CONTRACT,
      amount,
      nonce,
      gasPrice,
      { 
        data,
        chainId: CONFIG.CHAIN_ID,
        gasLimit: CONFIG.GAS_LIMIT
      }
    );

    console.log("✅ Transaction submitted:", {
      hash: result.hash,
      explorer: `https://testnet.seiscan.app/tx/${result.hash}`,
      data: data,
    });

    return result.hash;
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
