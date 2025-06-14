import { createUnionClient, http } from "@unionlabs/client";
import { privateKeyToAccount } from "viem/accounts";

// Chain IDs (use these for correct network reference)
export const CHAINS = {
  SEI: 1328,  // Sei Chain ID
  CORN: 21000001,  // Corne Chain ID
};

// RPC URLs (use these for connecting to the respective blockchains)
export const RPC_URLS = {
  SEI: "https://evm-rpc-testnet.sei-apis.com",  // Sei Testnet RPC URL
  CORN: "https://testnet.corn-rpc.com",  // Corne Testnet RPC URL
};

// Your private key (keep this secure in production)
const PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52"; // Replace with your actual private key

// Create UnionLabs client for Sei
export const seiClient = createUnionClient({
  chainId: CHAINS.SEI,  // Use the Sei chain ID from the CHAINS object
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http(RPC_URLS.SEI),  // Use the Sei RPC URL from the RPC_URLS object
});

// Create UnionLabs client for Corne
export const corneClient = createUnionClient({
  chainId: CHAINS.CORN,  // Use the Corne chain ID from the CHAINS object
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http(RPC_URLS.CORN),  // Use the Corne RPC URL from the RPC_URLS object
});

// Define the transfer payload
const transferPayload = {
  amount: 0.000001 * 1e18,  // Convert 0.000001 ETH to Wei (1 ETH = 10^18 Wei)
  autoApprove: false,  // Manual approval
  destinationChainId: CHAINS.CORN,  // Corne chain (target chain)
  receiver: "0x1D903e72F84d24B8544D58c0786370Cf08a35790",  // Receiver address on Corne
  gasPrice: 1.2e9,  // Gas price (1.2 Gwei)
  gasLimit: 300000,  // Gas limit
};

// Async function to approve and transfer assets
async function transferAssets() {
  try {
    // Step 1: Approve the transaction on Sei
    const approval = await seiClient.approveTransaction(transferPayload);
    if (approval.isErr()) {
      console.error("Approval failed:", approval.error);
      process.exit(1);
    }
    console.info(`Approval successful! Approval hash: ${approval.value}`);

    // Step 2: Transfer the asset from Sei to Corne
    const transfer = await seiClient.transferAsset(transferPayload);
    if (transfer.isErr()) {
      console.error("Transfer failed:", transfer.error);
      process.exit(1);
    }
    console.info(`Transfer successful! Transfer hash: ${transfer.value}`);
  } catch (error) {
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

// Call the async function
transferAssets();
