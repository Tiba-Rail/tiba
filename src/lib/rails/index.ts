export interface PayoutRequest {
  recipientAddress: string;
  amountMicros: bigint;
  intentId: string;
}

export interface PayoutReceipt {
  digest: string;
  explorerUrl: string;
}

export interface PayoutRail {
  send(request: PayoutRequest): Promise<PayoutReceipt>;
}

const mockRail: PayoutRail = {
  async send(request) {
    const digest = `mock-testnet-${request.intentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
    return { digest, explorerUrl: `https://explorer.sui.io/txblock/${digest}?network=testnet` };
  }
};

export const rails: Record<string, PayoutRail> = { mock: mockRail };

export function payoutRail(name: string): PayoutRail {
  const rail = rails[name];
  if (!rail) throw new Error(`Unsupported rail: ${name}`);
  return rail;
}
