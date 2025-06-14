import { privateKeyToAccount } from "viem/accounts";
import { createUnionClient, http } from "@unionlabs/client";
import { formatEther } from "viem";

// Configuration
const PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";
const SEI_RPC_URL = "https://evm-rpc-testnet.sei-apis.com";
const CORN_RPC_URL = "https://testnet-rpc.usecorn.com";

// Contract addresses
const WRAPPED_ETH_CONTRACT_ADDRESS_ON_CORN = "0x5FbE74A283f7954f10AA04C2eDf55578811aeb03"; // Corn's Wrapped ETH contract address

// SEI and Corn Chain IDs (use actual values you find)
const SEI_CHAIN_ID = 1328;  // SEI testnet chain ID
const CORN_CHAIN_ID = 21000001;    // Assuming Corn testnet chain ID (you can adjust this)

const SEI_CONNECTION_ID = 9; // SEI's connection ID
const SEI_CHANNEL_ID = 2;    // SEI's channel ID

const CORN_CONNECTION_ID = 2; // Corn's connection ID
const CORN_CHANNEL_ID = 2;    // Corn's channel ID

// Create SEI client
const seiClient = createUnionClient({
  chainId: SEI_CHAIN_ID,  // Specify the chain ID for SEI
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http(SEI_RPC_URL)
});

// ETH amount in wei (0.000001 ETH = 10^12 wei)
const AMOUNT_TO_BRIDGE = 1000000000000n; // 0.000001 ETH
const RECEIVER_ADDRESS = "0x1D903e72F84d24B8544D58c0786370Cf08a35790"; // Replace with your Corn address

async function bridgeETH() {
  try {
    // Prepare transfer payload
    const transferPayload = {
      amount: AMOUNT_TO_BRIDGE,
      autoApprove: false,
      receiver: RECEIVER_ADDRESS,  // Your Corn address
      denomAddress: WRAPPED_ETH_CONTRACT_ADDRESS_ON_CORN,  // Wrapped ETH contract address on Corn
      gasPrice: 1200000000n,  // 1.2 Gwei in wei
      gas: 300000n,
      destinationChainId: CORN_CHAIN_ID,  // Destination chain ID (Corn)
      
      // Channel and Connection details (for cross-chain communication)
      sourceConnectionId: SEI_CONNECTION_ID, // Connection ID for SEI chain
      sourceChannelId: SEI_CHANNEL_ID,       // Channel ID for SEI chain
      destinationConnectionId: CORN_CONNECTION_ID, // Connection ID for Corn chain
      destinationChannelId: CORN_CHANNEL_ID,      // Channel ID for Corn chain
    };

    console.log(`Bridging ${formatEther(AMOUNT_TO_BRIDGE)} ETH from SEI to Corn...`);

    // 1. Approval
    console.log("Approving transaction...");
    const approval = await seiClient.approveTransaction(transferPayload);

    if (approval.isErr()) {
      console.error("Approval failed:", approval.error);
      process.exit(1);
    }

    console.log(`✅ Approval Tx Hash: ${approval.value}`);

    // 2. Transfer
    console.log("Initiating transfer...");
    const transfer = await seiClient.transferAsset(transferPayload);

    if (transfer.isErr()) {
      console.error("Transfer failed:", transfer.error);
      process.exit(1);
    }

    console.log(`✅ Transfer Tx Hash: ${transfer.value}`);
    console.log("Bridge initiated successfully!");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

bridgeETH();
