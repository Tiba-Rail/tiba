import { Connection, PublicKey } from "@solana/web3.js";

export function getSettlementAddress(): string | null {
  return process.env.SOLANA_ADDRESS?.trim() || null;
}

export async function getSettlementBalance(address: string): Promise<bigint> {
  try {
    const rpc = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
    const connection = new Connection(rpc, "confirmed");
    const result = await connection.getParsedTokenAccountsByOwner(new PublicKey(address), {
      mint: new PublicKey(process.env.SOLANA_USDC_MINT?.trim() || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    });
    return result.value.reduce((total, account) => total + BigInt(account.account.data.parsed.info.tokenAmount.amount), 0n);
  } catch {
    return 0n;
  }
}
