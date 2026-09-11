import { defaultChain, type Chain } from "@/lib/rails";
import { getSolanaUsdcBalance, solanaTreasuryAddress } from "@/lib/rails/solana";

const TESTNET_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";


const SUI_TYPE_ARG = "0x2::sui::SUI";

/** Treasury address for a chain, default SETTLEMENT_CHAIN. */
export function getSettlementAddress(chain: Chain = defaultChain()): string | null {
  if (chain === "solana") return solanaTreasuryAddress();
  const address = process.env.SUI_ADDRESS?.trim();
  return address ? address : null;
}

/** Treasury balance in micros. Solana: USDC token account, 0n only if it does not exist yet. */
export async function getSettlementBalance(address: string, chain: Chain = defaultChain()): Promise<bigint> {
  if (chain === "solana") return getSolanaUsdcBalance(address);

  const coinType = process.env.SUI_USDC_TYPE?.trim() || SUI_TYPE_ARG;
  // JSON-RPC on public fullnodes is deprecated and now answers "Method not found", which made
  // every balance read silently return zero. Read it over GraphQL, the transport settlement uses.
  const query = `{ address(address: "${address}") { balance(coinType: "${coinType}") { totalBalance } } }`;

  try {
    const response = await fetch(TESTNET_GRAPHQL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store"
    });
    if (!response.ok) return 0n;

    const payload = (await response.json()) as {
      data?: { address?: { balance?: { totalBalance?: string } | null } | null } | null;
    };

    const total = payload.data?.address?.balance?.totalBalance;
    if (!total) return 0n;
    const raw = BigInt(total);
    const isSui = coinType === SUI_TYPE_ARG;
    return isSui ? raw / 1_000n : raw;
  } catch {
    return 0n;
  }
}
