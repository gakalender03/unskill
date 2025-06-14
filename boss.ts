import {
  http,
  createUnionClient
} from "@unionlabs/client";
import { privateKeyToAccount } from "viem/accounts";

// Replace with your actual private key (NEVER expose private keys in production code)
const PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";

// Initialize clients for multiple chains
const clients = createUnionClient([
  {
    chainId: "1328", // Sei Testnet EVM Chain ID
    transport: http("https://evm-rpc-testnet.sei-apis.com"),
    account: privateKeyToAccount(PRIVATE_KEY),
  },
  {
    chainId: "21000001", // Corn Testnet EVM Chain ID
    transport: http("https://testnet.corn-rpc.com"),
    account: privateKeyToAccount(PRIVATE_KEY),
  }
]);

// Function to check connection status of each chain
async function checkConnections(): Promise<void> {
  console.log("Checking connections to all configured chains...\n");

  for (const client of clients) {
    const { chainId, transport } = client;

    try {
      // Send a basic request to get the latest block number
      const latestBlock = await transport.request({ method: "eth_blockNumber", params: [] });

      // Convert hex to decimal
      const blockNumber = parseInt(latestBlock, 16);

      console.log(`✅ Connected to Chain ID ${chainId}. Latest block number: ${blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to connect to Chain ID ${chainId}:`, (error as Error).message);
    }
  }
}

console.log("Clients initialized.");
checkConnections();
