// bridge-sei-to-corn.ts
import { seiUnionClient } from "./client";
import type { TransferAssetsParameters } from "@unionlabs/client";

// Configuration constants
const AMOUNT_TO_BRIDGE = BigInt(1); // 0.000001 ETH = 1 wei (adjust if you need different precision)
const CORN_RECEIVER_ADDRESS = "0x1D903e72F84d24B8544D58c0786370Cf08a35790"; // Replace with your Corn address

async function bridgeSeiToCorn() {
  // Prepare transfer payload
  const transferPayload = {
    amount: AMOUNT_TO_BRIDGE,
    autoApprove: false, // We'll approve manually
    destinationChainId: "corn.21000001", // Corn channel ID
    receiver: CORN_RECEIVER_ADDRESS,
    denomAddress: "0x0000000000000000000000000000000000000000", // Native ETH address
  } satisfies TransferAssetsParameters<"sei.1328">;

  console.log("Starting Sei to Corn bridge...");
  console.log(`Amount: ${formatEther(AMOUNT_TO_BRIDGE)} ETH`);
  
  try {
    // 1. Approval step
    console.log("Approving token transfer...");
    const approval = await seiUnionClient.approveTransaction({
      ...transferPayload,
      gasPrice: 1.2 * 1e9, // 1.2 Gwei
      gas: 300000,
    });
    
    if (approval.isErr()) {
      console.error("Approval failed:", approval.error);
      throw approval.error;
    }
    
    console.log(`✅ Approval successful. Tx hash: ${approval.value}`);
    
    // 2. Transfer step
    console.log("Initiating bridge transfer...");
    const transfer = await seiUnionClient.transferAsset({
      ...transferPayload,
      gasPrice: 1.2 * 1e9, // 1.2 Gwei
      gas: 300000,
    });
    
    if (transfer.isErr()) {
      console.error("Transfer failed:", transfer.error);
      throw transfer.error;
    }
    
    console.log(`✅ Bridge initiated successfully. Tx hash: ${transfer.value}`);
    console.log("Check the Union dashboard for bridge status updates.");
    
    return {
      approvalTxHash: approval.value,
      bridgeTxHash: transfer.value,
    };
    
  } catch (error) {
    console.error("❌ Bridge process failed:", error);
    throw error;
  }
}

// Helper function to format ETH values
function formatEther(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(6);
}

// Execute the bridge
bridgeSeiToCorn()
  .then((result) => console.log("Bridge result:", result))
  .catch(() => process.exit(1));
