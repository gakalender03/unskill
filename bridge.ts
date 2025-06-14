import {
  http,
  createMultiUnionClient
} from "@unionlabs/client";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = "0x63535fd448a93766c11bb51ae2db0e635f389e2a81b4650bd9304b1874237d52";

const clients = createMultiUnionClient([
  {
    chainId: "1328", // Sei Testnet EVM Chain ID
    transport: http("https://1328.rpc.thirdweb.com"),
    account: privateKeyToAccount(PRIVATE_KEY),
  },
  {
    chainId: "21000001", // Corn Testnet EVM Chain ID
    transport: http("https://testnet.corn-rpc.com"),
    account: privateKeyToAccount(PRIVATE_KEY),
  }
]);

console.log("Clients initialized:", clients);
