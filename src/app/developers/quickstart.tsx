import Link from "next/link";

function Command({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto rounded bg-background p-3 text-xs leading-5">
      <code>{children}</code>
    </pre>
  );
}

const createWorkspace = `curl -X POST "$TIBA_BASE/api/v1/workspaces" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"First test payout","solana_address":"YOUR_DEVNET_ADDRESS"}'`;

const setLimit = `curl -X POST "$TIBA_BASE/api/v1/policies" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $OWNER_KEY" \\
  -d '{"require_recipient_kyc": true}'`;

const pay = `curl -X POST "$TIBA_BASE/api/v1/intents" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AGENT_KEY" \\
  -d '{"idempotency_key":"quickstart-pay-'"$WORK_ORDER_REF"'","recipient_ref":"'"$RECIPIENT_REF"'","artifact":"DELIVERY NOTE\\nWork order: '"$WORK_ORDER_REF"'\\nDelivered: first invoice, accepted.\\nAmount due: 5.00 USDC\\nSigned: onboarding"}'`;

const script = `TIBA_BASE="$TIBA_BASE" \\
TIBA_AGENT_KEY="$AGENT_KEY" \\
TIBA_RECIPIENT_REF="$RECIPIENT_REF" \\
TIBA_WORK_ORDER_REF="$WORK_ORDER_REF" \\
node scripts/quickstart-payout.mjs`;

const refuse = `curl -X POST "$TIBA_BASE/api/v1/intents" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AGENT_KEY" \\
  -d '{"idempotency_key":"quickstart-refuse-'"$WORK_ORDER_REF"'","recipient_ref":"'"$RECIPIENT_REF"'","artifact":"DELIVERY NOTE\\nWork order: '"$WORK_ORDER_REF"'\\nDelivered: first invoice, accepted.\\nAmount due: 5.00 USDC\\nSigned: onboarding"}'`;

export function Quickstart() {
  return (
    <section className="mt-12 border-t border-line pt-8" aria-labelledby="quickstart-title" id="quickstart">
      <p className="eyebrow">Quickstart</p>
      <h2 id="quickstart-title" className="display-m mt-2">A first test payout, then a refusal.</h2>
      <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted">
        Solana devnet USDC only. Circle&apos;s test USDC. Create a workspace, fund the settlement account, set the identity limit, send one payout, and trigger one refusal. Each result has a public receipt at <span className="num">/r/&lt;public_token&gt;</span>. The same steps are in <span className="num">docs/QUICKSTART.md</span>.
      </p>

      <ol className="mt-8 list-none space-y-4 p-0">
        <li className="card p-5">
          <h3 className="title">1. Sign in, then create a workspace</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            <Link className="link" href="/signin">Sign in</Link>. A Solana wallet can sign in. Google and GitHub appear when this deployment has them configured. Then open <Link className="link" href="/start">Start</Link> in that same browser. Name the workspace, paste a Solana devnet address you control (or leave it blank to use the settlement address), and create the wallet.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Copy the agent key and the owner key. They are shown once. The cURL tab has your <span className="num">recipient_ref</span> and work order ref. Keep those. Do not commit the keys.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            The wallet has to come back on the Solana devnet rail. If the page says payments from this wallet are simulated, no devnet USDC will move. That happens when you are signed out, when this account already has 3 devnet workspaces, or when the site has hit its daily cap on new devnet workspaces (20, unless <span className="num">LIVE_ONBOARDING_DAILY_CAP</span> is set).
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            The server accepts this create request. A terminal call has no sign-in cookie, so that workspace is simulated. Use Start while you are signed in.
          </p>
          <Command>{createWorkspace}</Command>
          <p className="mt-3 text-sm leading-6 text-muted">
            HTTP 201 includes <span className="num">agent_key</span>, <span className="num">owner_key</span>, <span className="num">recipient_ref</span>, <span className="num">work_order_ref</span>, <span className="num">rail</span>, and <span className="num">solana_address</span>. You want <span className="num">rail</span> <span className="num">solana</span>. It also opens one invoice: ceiling 5 USDC, payer record <span className="num">approved_amount_micros</span> <span className="num">5000000</span>, <span className="num">delivery_status</span> <span className="num">verified_complete</span>, both checks required.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            <span className="num">INVALID_SOLANA_ADDRESS</span> means the address is not a Solana address. <span className="num">SOLANA_ADDRESS_REQUIRED</span> means the address was blank and this deployment has no settlement address. <span className="num">RATE_LIMITED</span> means this IP already created 5 workspaces in the last hour.
          </p>
        </li>

        <li className="card p-5">
          <h3 className="title">2. Get test USDC on Solana devnet</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            The payout sends USDC from the settlement account on <Link className="link" href="/fund">Add funds</Link> to the address you saved. The first invoice is 5.00 USDC, so that account needs at least 5 USDC, plus a little devnet SOL for the fee. If the balance there is already at least $5.00, go to the next step.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Devnet SOL for fees: <a className="link" href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer">faucet.solana.com</a>. Choose devnet and your wallet address. Devnet USDC: <a className="link" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">faucet.circle.com</a>. Choose Solana, then Devnet, and request USDC. The mint Tiba sends is <span className="num">4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU</span>. Then deposit at least 5 USDC on Add funds from the wallet that received it.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            If a faucet fails: Solana&apos;s faucet often stops after a limit. Wait and request again, or run <span className="num">solana airdrop 1 YOUR_ADDRESS --url https://api.devnet.solana.com</span>. That command is limited too. SOL in your wallet pays the deposit. The settlement account still needs its own SOL to send the payout, and the deposit form does not add that SOL. Circle allows 20 USDC per address, per chain, every 2 hours. A limit message means wait and request again. If the USDC never arrives, request once more, then ask in Circle&apos;s Discord. Keep this mint. Another USDC token will not fund the payout.
          </p>
        </li>

        <li className="card p-5">
          <h3 className="title">3. Set a limit</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            Creating the workspace sets the spending limits. The agent key cannot change them: 5 USDC per payment, 10 USDC and 5 payments per hour, and 20 USDC and 20 payments per day. Open <Link className="link" href="/policies">Limits</Link> in the same browser tab. You will see the per-payment ceiling ($5.00) and the per-day limit ($20.00). The first invoice is 5.00 USDC, so it is allowed.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            The limit you turn on is identity verification. The example recipient is already verified, so the payout still proceeds. In that same tab, choose Require verification. The same call with the owner key:
          </p>
          <Command>{setLimit}</Command>
          <p className="mt-3 text-sm leading-6 text-muted">
            The response is <span className="num">{`{ "require_recipient_kyc": true }`}</span>. The bearer token is the owner key.
          </p>
        </li>

        <li className="card p-5">
          <h3 className="title">4. Send one payout</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            The note names the open work order and 5.00 USDC, matching <span className="num">5000000</span> on the payer record. Put your work order ref in the idempotency key. The same key returns the first result. A key someone else already used returns their result. Leave the command running for a couple of minutes while the checks and the devnet transfer finish.
          </p>
          <Command>{pay}</Command>
          <p className="mt-3 text-sm leading-6 text-muted">
            From a clone of this repo, <span className="num">scripts/quickstart-payout.mjs</span> sends that same request and prints the status and the receipt link.
          </p>
          <Command>{script}</Command>
          <p className="mt-3 text-sm leading-6 text-muted">
            A paid payout is HTTP 200, <span className="num">status</span> <span className="num">settled</span>, <span className="num">decision_class</span> <span className="num">PAID</span>, <span className="num">chain</span> <span className="num">solana</span>, and a <span className="num">public_token</span>. The receipt is <span className="num">/r/&lt;public_token&gt;</span>. <span className="num">digest</span> and <span className="num">signature</span> are the devnet transaction id.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            If <span className="num">chain</span> is <span className="num">mock</span>, no devnet USDC moved. Go back to step 1. If <span className="num">status</span> is <span className="num">held</span>, open the receipt and read <span className="num">reason_code</span>. That hold is a different outcome from the refusal below. If the reason is <span className="num">SETTLEMENT_FAILED</span>, check USDC on Add funds and whether the settlement account has devnet SOL, then send a new idempotency key.
          </p>
        </li>

        <li className="card p-5">
          <h3 className="title">5. Trigger one refusal on purpose</h3>
          <p className="mt-3 text-sm leading-6 text-muted">
            After the receipt says <span className="num">settled</span>, send the same note with a new idempotency key. Paying closes the invoice. This recipient has no other open invoice, so Tiba refuses before the checks run. Run the script again, or send:
          </p>
          <Command>{refuse}</Command>
          <p className="mt-3 text-sm leading-6 text-muted">
            You want HTTP 200, <span className="num">status</span> <span className="num">refused</span>, <span className="num">decision_class</span> <span className="num">RED</span>, <span className="num">reason_code</span> <span className="num">NO_OPEN_OBLIGATION</span>, and a new receipt link. Do this only after the first receipt says settled. A second call before that is another attempt to pay.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            If the payout has not settled and you still want a refusal receipt, add a recipient with no invoice (owner key, a ref only you will use, your devnet address) at <span className="num">/api/v1/recipients</span>, then point the script at that <span className="num">TIBA_RECIPIENT_REF</span>. The same <span className="num">NO_OPEN_OBLIGATION</span> receipt comes back, and no USDC is sent. <span className="num">RECIPIENT_REF_TAKEN</span> means pick another ref.
          </p>
          <p className="mt-4 text-sm font-medium text-foreground">Share your receipt link with Faris.</p>
        </li>
      </ol>
    </section>
  );
}
