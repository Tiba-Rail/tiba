import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

const SUI_TYPE_ARG = "0x2::sui::SUI";

export function getSettlementAddress(): string | null {
  const address = process.env.SUI_ADDRESS?.trim();
  return address ? address : null;
}

export async function getSettlementBalance(address: string): Promise<bigint> {
  const coinType = process.env.SUI_USDC_TYPE?.trim() || SUI_TYPE_ARG;
  const url = getJsonRpcFullnodeUrl("testnet");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_getBalance",
        params: [address, coinType]
      })
    });

    if (!response.ok) return 0n;

    const payload = (await response.json()) as {
      result?: { totalBalance?: string } | null;
      error?: { message?: string } | null;
    };

    if (payload.error || !payload.result?.totalBalance) return 0n;
    const raw = BigInt(payload.result.totalBalance);
    const isSui = coinType === SUI_TYPE_ARG;
    return isSui ? raw / 1_000n : raw;
  } catch {
    return 0n;
  }
}
