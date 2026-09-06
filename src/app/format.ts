import { microsToUsdc } from "@/lib/money";

export function formatDollars(micros: bigint): string {
  const value = microsToUsdc(micros).replace(" USDC", "");
  return `$${value}`;
}

export function shortSuiAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function suiToMist(sui: string): bigint | null {
  const trimmed = sui.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const mist = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  return mist;
}
