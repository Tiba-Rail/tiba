import allowedReceipt from "./fixtures/receipt-01-mcp-allowed.json";
import blockedReceipt from "./fixtures/receipt-02-mcp-blocked.json";
import paymentReceipt from "./fixtures/receipt-03-solana-payment.json";
import revokedReceipt from "./fixtures/receipt-04-revoked.json";
import type { Receipt } from "./types";

export const demoReceipts = [
  allowedReceipt,
  blockedReceipt,
  paymentReceipt,
  revokedReceipt
] as unknown as Receipt[];

export const verifiedPaymentReceipt = paymentReceipt as unknown as Receipt;
export const verifiedPaymentReceiptJson = JSON.stringify(verifiedPaymentReceipt, null, 2);
export const tamperedPaymentReceiptJson = JSON.stringify(
  { ...verifiedPaymentReceipt, result: "failure" },
  null,
  2
);

export function explorerUrlForReceipt(receipt: Receipt): string | null {
  return receipt.evidence?.find((entry) => entry.type === "solana_transaction")?.url ?? null;
}
