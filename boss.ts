import { createUnionClient, http } from "@unionlabs/client";
import { privateKeyToAccount } from "viem/accounts";

// Use your actual private key directly here
const PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52"; // Your private key

// Create the UnionLabs client for Sei (using the provided RPC URL)
export const seiClient = createUnionClient({
  chainId: "sei.1328",  // Sei chain ID
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http("https://evm-rpc-testnet.sei-apis.com"),  // Sei Testnet RPC URL
});

// Create the UnionLabs client for Corne (using the provided RPC URL)
export const corneClient = createUnionClient({
  chainId: "corn.21000001",  // Corne chain ID
  account: privateKeyToAccount(PRIVATE_KEY),
  transport: http("https://testnet.corn-rpc.com"),  // Corne Testnet RPC URL
});

// Define the transfer payload
const transferPayload = {
  amount: 0.000001 * 1e18,  // Convert 0.000001 ETH to Wei (1 ETH = 10^18 Wei)
  autoApprove: false,  // Manual approval
  destinationChainId: "corn.21000001",  // Corne chain (target chain)
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
