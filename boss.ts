import { createUnionClient, http } from "@unionlabs/client";
import { privateKeyToAccount } from "viem/accounts";

// Ensure your PRIVATE_KEY is set in the environment
const PRIVATE_KEY = process.env["0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52"];
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY is not set");

// Create the UnionLabs client for Sei (using the provided RPC URL)
export const seiClient = createUnionClient({
  chainId: "sei.1328",  // Replace with the actual Sei chain ID
  account: privateKeyToAccount(`0x${PRIVATE_KEY}`),
  transport: http("https://evm-rpc-testnet.sei-apis.com"),  // Sei Testnet RPC URL
});

// Create the UnionLabs client for Corne (using the provided RPC URL)
export const corneClient = createUnionClient({
  chainId: "corn.21000001",  // Replace with the actual Corne chain ID
  account: privateKeyToAccount(`0x${PRIVATE_KEY}`),
  transport: http("https://testnet.corn-rpc.com"),  // Corne Testnet RPC URL
});

// Define transfer payload
const transferPayload = {
  amount: 0.000001 * 1e18,  // Convert ETH to Wei (1 ETH = 10^18 Wei)
  autoApprove: false,  // Manual approval
  destinationChainId: "corne-vm-chain-id",  // Target chain (Corne)
  receiver: "0x1D903e72F84d24B8544D58c0786370Cf08a35790",  // Replace with the actual receiver address on Corne
  denomAddress: "0xSeiTokenContractAddress",  // Token contract address for Sei (if applicable)
};

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
