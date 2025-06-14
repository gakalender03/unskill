// client.ts
import { privateKeyToAccount } from "viem/accounts";
import { createUnionClient, http } from "@unionlabs/client";
import { z } from "zod";

// Environment configuration with validation
const envSchema = z.object({
  PRIVATE_KEY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
});

const env = envSchema.parse({
  PRIVATE_KEY: process.env.PRIVATE_KEY ?? "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52",
});

// Remove 0x prefix if present (viem will add it)
const privateKey = env.PRIVATE_KEY.startsWith("0x") 
  ? env.PRIVATE_KEY.slice(2)
  : env.PRIVATE_KEY;

// Gas configuration
const GAS_PRICE = 1.2; // Gwei
const GAS_LIMIT = 300000;

// Create client for Sei with custom gas settings
export const seiUnionClient = createUnionClient({
  chainId: "sei.1328", // Sei Testnet channel ID
  account: privateKeyToAccount(`0x${privateKey}`),
  transport: http("https://evm-rpc-testnet.sei-apis.com", {
    batch: {
      wait: 50, // milliseconds
    },
    retryCount: 3,
  }),
  gasPrice: GAS_PRICE * 1e9, // Convert Gwei to wei
  gas: GAS_LIMIT,
});

// Create client for Corn (Berachain Testnet)
export const cornUnionClient = createUnionClient({
  chainId: "corn.21000001", // Corn channel ID
  account: privateKeyToAccount(`0x${privateKey}`),
  transport: http("https://testnet-rpc.usecorn.com"),
});
