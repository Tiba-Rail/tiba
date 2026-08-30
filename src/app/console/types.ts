export type Recipient = {
  ref: string;
  displayName: string;
  suiAddress: string;
  active: boolean;
};

export type WorkOrder = {
  ref: string;
  recipientRef: string;
  recipientName: string;
  ceiling: string;
  expiresAt: string;
  status: string;
};

export type HeldIntent = {
  id: string;
  createdAt: string;
  recipientName: string;
  amount: string;
  decisionClass: string;
  reasonCode: string | null;
};

export type Budget = {
  agentName: string;
  spentDay: string;
  capDay: string;
  spentHour: string;
  capHour: string;
  dayPercent: number;
  hourPercent: number;
  killSwitch: boolean;
};

export type TestIntentResponse = {
  decision: string;
  reasonCode?: string;
  digest?: string;
  explorerUrl?: string;
  publicToken?: string;
};

// Helper function to get explanation text based on reason code
export function explainDecision(decisionClass: string, reasonCode: string | null): string {
  if (decisionClass === "PAID" && !reasonCode) {
    return "Both channels agreed and the payment settled on Sui testnet.";
  }
  
  if (reasonCode === "QUORUM_SPLIT") {
    return "The two channels disagreed about the work order or the amount, so Tiba refused. It never guesses which one is right.";
  }
  
  if (reasonCode && reasonCode.includes("CAP")) {
    return "This would have pushed the agent past its spending cap, so it was refused.";
  }
  
  if (reasonCode && (reasonCode.includes("WORK_ORDER") || reasonCode.includes("NOT_FOUND"))) {
    return "There is no open work order that matches this artifact, so there was nothing to pay against.";
  }
  
  return "Refused by policy before any money moved.";
}

// The internal enum (RED/AMBER) is not what a person should read; a refusal is the
// product working, so it says so.
export function decisionWord(decisionClass: string): string {
  if (decisionClass === "AMBER") return "HELD";
  if (decisionClass === "RED") return "REFUSED";
  return decisionClass;
}