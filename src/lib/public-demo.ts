// Pinned to the 11 Sep devnet payout of 0.01 USDC to recipient sol-test-0911. The newest PAID row
// was a treasury self-pay test that moved the money back into the payer's own account.
export const EXAMPLE_PAID_INTENT_ID = "0e4d1636-dad4-4369-8fde-1e4d1fa57fc3";

// Shown on the homepage when the database cannot be reached, so the marketing page
// still has a concrete example without querying a payout row.
export const STATIC_PAID_EXAMPLE = {
  amountLabel: "0.01 USDC",
  dateLabel: "11 Sep 2026",
  blurb: "0.01 USDC sent to a separate recipient wallet on the test network on 11 Sep 2026. No real money moved."
};
