# First test payout

Solana devnet USDC only. The token is Circle's test USDC on Solana devnet.

You create a workspace, put test USDC where the payout can spend it, set the identity limit, send one payout, and send one refusal. Each result has a public receipt at `/r/<public_token>`.

Use https://tiba.rizqey.com. If you are running this repo yourself, set `TIBA_BASE` to your origin (for example `http://localhost:3000`). Do not commit keys.

## 1. Sign in, then create a workspace

Open https://tiba.rizqey.com/signin and sign in. A Solana wallet can sign in. Google and GitHub appear when this deployment has them configured.

Open https://tiba.rizqey.com/start in that same browser. Name the workspace. Paste a Solana devnet address you control, or leave the address blank to use the site's settlement address. Create the wallet.

Copy the agent key and the owner key. They are shown once. The cURL tab on that page has your `recipient_ref` and work order ref filled in. Keep those too.

```bash
export TIBA_BASE=https://tiba.rizqey.com
export AGENT_KEY="paste-the-agent-key"
export OWNER_KEY="paste-the-owner-key"
export RECIPIENT_REF="paste-recipient-ref"
export WORK_ORDER_REF="paste-work-order-ref"
```

The wallet has to be on the Solana devnet rail. If the page says payments from this wallet are simulated, no devnet USDC will move. That happens when you are signed out, when this account already has 3 devnet workspaces, or when the site has already created its daily number of devnet workspaces (20, unless `LIVE_ONBOARDING_DAILY_CAP` is set). Sign in and create again on an account that is under the cap.

The create request the server accepts is below. From a terminal it has no sign-in cookie, so the new workspace is simulated. Create the wallet in the browser while you are signed in.

```bash
curl -X POST "$TIBA_BASE/api/v1/workspaces" \
  -H "Content-Type: application/json" \
  -d '{"name":"First test payout","solana_address":"YOUR_DEVNET_ADDRESS"}'
```

A created workspace answers HTTP 201 with `agent_key`, `owner_key`, `recipient_ref`, `work_order_ref`, `rail`, and `solana_address`. You want `rail` to be `solana`.

`INVALID_SOLANA_ADDRESS` means the address is not a Solana address. `SOLANA_ADDRESS_REQUIRED` means you left the address blank and this deployment has no settlement address. `RATE_LIMITED` means this IP already created 5 workspaces in the last hour.

The new workspace also opens one invoice: work order ref from the response, ceiling 5 USDC, payer record `approved_amount_micros` `5000000` and `delivery_status` `verified_complete`. Both checks are required.

## 2. Get test USDC on Solana devnet

The payout sends USDC from the settlement account on https://tiba.rizqey.com/fund to the address you saved on the workspace. The first invoice is 5.00 USDC, so that account needs at least 5 USDC of Circle's devnet USDC, and a little devnet SOL for the fee.

Open /fund and read the balance. If it is already at least $5.00, go to the next step.

If it is short:

1. Devnet SOL, for fees: <https://faucet.solana.com>. Choose devnet and paste your wallet address.
2. Devnet USDC: <https://faucet.circle.com>. Choose Solana, then Devnet, and request USDC. The mint Tiba sends is `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
3. On /fund, connect the wallet that received the test USDC and deposit at least 5 USDC into the settlement account.

If a faucet fails:

- <https://faucet.solana.com> often stops after a limit. Wait, then request again. Or, with the Solana CLI: `solana airdrop 1 YOUR_ADDRESS --url https://api.devnet.solana.com`. That command is limited too. SOL in your wallet pays the deposit. The settlement account still needs its own SOL to send the payout. The deposit form moves USDC, and it does not add SOL to the settlement account.
- <https://faucet.circle.com> allows 20 USDC per address, per chain, every 2 hours. A limit message means wait, then request again. If the USDC never arrives, request once more, then ask in Circle's Discord. Keep this mint. Another USDC token will not fund the payout.

## 3. Set a limit

Creating the workspace sets the spending limits. The agent key cannot change them. They are 5 USDC per payment, 10 USDC and 5 payments per hour, and 20 USDC and 20 payments per day. Open https://tiba.rizqey.com/policies in the same browser tab. Limits shows the per-payment ceiling ($5.00) and the per-day limit ($20.00). The first invoice is 5.00 USDC, so it sits on the per-payment ceiling and is allowed.

The limit you turn on is identity verification. The example recipient was created already verified, so this payout still proceeds.

In that same tab, on Limits, choose **Require verification**. The button posts your owner key, which /start stored for this tab. The same call from a terminal:

```bash
curl -X POST "$TIBA_BASE/api/v1/policies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_KEY" \
  -d '{"require_recipient_kyc": true}'
```

The response is `{ "require_recipient_kyc": true }`. The bearer token is the owner key. The agent key is refused.

## 4. Send one payout

The note has to name the open work order and 5.00 USDC, which is the `5000000` on the payer record. Use an idempotency key that includes your work order ref. The same key always returns the first result. A key somebody else already used returns their result.

Leave the command running. The two checks and the devnet transfer can take a couple of minutes.

```bash
curl -X POST "$TIBA_BASE/api/v1/intents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -d '{"idempotency_key":"quickstart-pay-'"$WORK_ORDER_REF"'","recipient_ref":"'"$RECIPIENT_REF"'","artifact":"DELIVERY NOTE\nWork order: '"$WORK_ORDER_REF"'\nDelivered: first invoice, accepted.\nAmount due: 5.00 USDC\nSigned: onboarding"}'
```

From a clone of this repo, the same request is `scripts/quickstart-payout.mjs`:

```bash
TIBA_BASE="$TIBA_BASE" \
TIBA_AGENT_KEY="$AGENT_KEY" \
TIBA_RECIPIENT_REF="$RECIPIENT_REF" \
TIBA_WORK_ORDER_REF="$WORK_ORDER_REF" \
node scripts/quickstart-payout.mjs
```

The script prints the status and the receipt link. A paid payout is HTTP 200, `status` `settled`, `decision_class` `PAID`, `chain` `solana`, and a `public_token`. The receipt is `$TIBA_BASE/r/<public_token>`. `digest` and `signature` are the devnet transaction id. `explorer_url` opens it with `cluster=devnet`.

If `chain` is `mock`, no devnet USDC moved. Go back to step 1.

If `status` is `held`, a check did not finish, or a person still has to decide. Open the receipt and read `reason_code`. That hold is a different outcome from the refusal in the next step.

If `status` is `refused` and `reason_code` is `SETTLEMENT_FAILED`, the settlement account could not send. Check USDC on /fund, and whether that account has devnet SOL for the fee. Send again with a new idempotency key, for example `quickstart-pay-2-$WORK_ORDER_REF`.

## 5. Trigger one refusal on purpose

After the receipt says `settled`, send the same note again with a new idempotency key. Paying the invoice closes it. This recipient has no other open invoice, so Tiba refuses before the checks run.

```bash
curl -X POST "$TIBA_BASE/api/v1/intents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_KEY" \
  -d '{"idempotency_key":"quickstart-refuse-'"$WORK_ORDER_REF"'","recipient_ref":"'"$RECIPIENT_REF"'","artifact":"DELIVERY NOTE\nWork order: '"$WORK_ORDER_REF"'\nDelivered: first invoice, accepted.\nAmount due: 5.00 USDC\nSigned: onboarding"}'
```

Or run `node scripts/quickstart-payout.mjs` again. Each run picks a new idempotency key.

You want HTTP 200, `status` `refused`, `decision_class` `RED`, `reason_code` `NO_OPEN_OBLIGATION`, and a new `public_token`. That link is the refusal receipt.

Run this only after the first receipt says `settled`. A second call before that is another attempt to pay.

If the payout has not settled and you still want a refusal receipt, add a recipient with no invoice and pay that recipient. Pick a ref only you will use. `RECIPIENT_REF_TAKEN` means someone else already has that ref.

```bash
curl -X POST "$TIBA_BASE/api/v1/recipients" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OWNER_KEY" \
  -d '{"ref":"no-invoice-'"$WORK_ORDER_REF"'","display_name":"No invoice","solana_address":"YOUR_DEVNET_ADDRESS"}'

TIBA_RECIPIENT_REF="no-invoice-$WORK_ORDER_REF" \
TIBA_IDEMPOTENCY_KEY="quickstart-refuse-$WORK_ORDER_REF" \
TIBA_BASE="$TIBA_BASE" \
TIBA_AGENT_KEY="$AGENT_KEY" \
TIBA_WORK_ORDER_REF="$WORK_ORDER_REF" \
node scripts/quickstart-payout.mjs
```

The same refusal comes back: `NO_OPEN_OBLIGATION`. This path does not send USDC.

Share your receipt link with Faris.
