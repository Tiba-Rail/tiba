# Tiba technical demo

Colosseum asked for a separate video on how the check works. Spoken lines are the ones that start with a time, like `0:14 -`. `scripts/narrate.py` reads those. Lines that start with `#` are stage directions. They are not spoken.

The pictures run to 2:56. The cap is 3:00. This is the Solana test network. No real money.

Do not record, and do not create a payment, until the two refusal receipts exist. Check the pages first:

```
node scripts/record-demo.mjs --check \
  --paid https://tiba.rizqey.com/r/8ecd74ca-ef81-4d60-b642-a9a1e8ece93c \
  --wrong-job https://tiba.rizqey.com/r/PASTE \
  --overcharge https://tiba.rizqey.com/r/PASTE
```

The same three links can be `DEMO_PAID_RECEIPT`, `DEMO_WRONG_JOB_RECEIPT`, and `DEMO_OVERCHARGE_RECEIPT`. The site address is `DEMO_BASE_URL` (default `https://tiba.rizqey.com`).

`--check` only opens pages and reads files. It does not record and it does not pay. `--record` is the silent picture, after the check passes. Then:

```
python scripts/narrate.py docs/DEMO_SCRIPT.md recordings/tiba-technical-demo.mp4 recordings/tiba-technical-demo-narrated.mp4 recordings/narration
```

`narrate.py` needs a local speech key. This script does not contain one.

## Where each claim comes from

| What you hear | Where it is |
| --- | --- |
| Test network, no real money | Live footer and the line under the title: https://tiba.rizqey.com — "test network" and "Test network only — no real money moves yet" (`src/app/page.tsx`, `src/components/site-footer.tsx`). The recorder also leaves that short phrase on screen. |
| The payer's record | https://tiba.rizqey.com/try — heading "Payer's record", work order, approved amount, delivery verified. Sample only. It does not send money (`src/app/try/fool-it.tsx`, `src/lib/fool-it-sample.ts`). |
| A matching bill was paid on Solana devnet | Pinned payment in `src/app/page.tsx` (`EXAMPLE_PAID_INTENT_ID`). Live receipt, read 27 Sep 2026: https://tiba.rizqey.com/r/8ecd74ca-ef81-4d60-b642-a9a1e8ece93c — "Paid on Solana devnet", 0.01 USDC. "Check 2 — read your own records" is the payer's record on that payment (`src/app/r/[token]/page.tsx`). |
| Explorer | That receipt's link: https://explorer.solana.com/tx/5NbsG6hTWC8mjBpp1qZNJtAqBiDTJ4fXBgjG5jZkoHG5W3ZHs3vgDfxGungok4eapDmPoHAx1TAqaqhwGZo3kE1Q?cluster=devnet — `cluster=devnet` is the test network (`src/lib/rails/solana.ts`). |
| Wrong job, bill beside record | Not created yet. When it exists, the receipt must say "The two checks named different invoices." (`src/app/console/types.ts`) and show Work order on the bill and on the record (`src/components/bill-record-mismatch.tsx`). Pass that link as `--wrong-job`. |
| Small overcharge, bill beside record | Not created yet. It must say "The two checks named different amounts." and show Amount on both sides. It must not be the old homepage refusal https://tiba.rizqey.com/r/a079bc29-b6bc-4fd0-9020-6e16bf697ce6 (999.999999 USDC against 0.01). Pass the new link as `--overcharge`. |
| "You will never receive the artifact" | `src/lib/prompts.ts` line 35, the payer-record instruction. The public GitHub `master` copy has the same line. The live branch is the one to show. |
| Both checks use the same two models | `src/lib/gonka.ts` lines 19–23. Line 19–20: the bill asks OpenAI first, the payer's record asks Alibaba first, and the other name is only the fallback. Lines 22–23 list `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` on both checks, in opposite order. "Alibaba" is the name used for the `qwen/` model (`src/lib/channel-makers.ts`). The 11 Sep receipt still shows DeepSeek, because that payment is older than the 19 Sep note at the top of `gonka.ts`. Do not open GitHub `master` for this file: that copy still lists the old router. |
| Tempo and Zcash are deployed and switched off | The live page says "Built and tested, not live" under Tempo and under Zcash, and "Solana · home rail" (https://tiba.rizqey.com, `src/app/page.tsx`). The code is in `src/lib/rails/evm.ts` and `src/lib/rails/zcash.ts`. `src/lib/rails/index.ts` defaults `RAIL` to solana, uses Tempo only when `RAIL` is tempo, and uses Zcash only when the rail name is zcash. New workspaces are solana or mock (`src/lib/rate-limit.ts`, `onboardingRail`). The paid receipt above says Solana devnet. |

The spoken line "one cent of test USDC" belongs to that pinned 0.01 USDC receipt. If you pass a different paid link, change the line before you record. The refusal lines assume a wrong job, and a right job whose amount is only a little high. If the receipts you create are a different case, change those lines too.

## Shot list

# Screen: https://tiba.rizqey.com. Title and footer. The words "test network" and "no real money" are on the page. Banner: "Test network, no real money".
0:00 - Tiba is the check before an AI agent's payment goes out. This is the test network. No real money.

# Screen: https://tiba.rizqey.com/try. Do not press either button. Show the card titled "Payer's record".
0:14 - Before it pays a person, it reads the bill against the payer's own record. The try page shows that record: the job, the approved amount, and that the work is already done. The bill cannot change it.

# Screen: the paid receipt passed in with --paid. For the line below, use https://tiba.rizqey.com/r/8ecd74ca-ef81-4d60-b642-a9a1e8ece93c. Show "Paid on Solana devnet" and "Check 2 — read your own records".
0:34 - Here the bill matched the record. Tiba paid one cent of test USDC on Solana devnet. The receipt says paid. Check two is the read of the payer's own records.

# Screen: same tab, the explorer link from that receipt. The address contains cluster=devnet. The link opens in a new tab on the site; the recorder follows it in this tab so it stays on camera.
0:50 - Open the explorer link on that receipt. The address says cluster equals devnet. Same test network. No real money.

# Screen: the wrong-job receipt (--wrong-job). Bill, record, and the work-order mismatch, side by side. Words on the page: "different invoices".
1:08 - This bill names the wrong job. The bill and the record sit side by side. The work order on the bill is not the work order on the record, so Tiba refuses. Nothing is sent.

# Screen: the small-overcharge receipt (--overcharge). Amount on the bill beside amount on the record. Words on the page: "different amounts". Not the old 999.999999 refusal.
1:26 - This bill is the right job, and the amount is only a little higher than the record. The amount does not match, so Tiba refuses this one too. Still nothing is sent.

# Screen: src/lib/prompts.ts line 35, the words "You will never receive the artifact".
1:44 - The record check never sees the bill. Line 35 of prompts.ts says: you will never receive the artifact.

# Screen: src/lib/gonka.ts lines 19 to 23. Same two model names on both checks. OpenAI first for the bill, Alibaba first for the record.
2:06 - Both checks may use the same two models. The bill asks OpenAI first. The payer's record asks Alibaba first. The other name is only the fallback. That is gonka.ts. The receipt shows whichever one answered.

# Screen: src/lib/rails/index.ts, the solana default, then the live page "Tempo · proof" and "Zcash · proof" — "Built and tested, not live".
2:26 - Tempo and Zcash are in the code, and this page says they are built and tested, not live. The rail that runs is Solana devnet. Those two are switched off.

# Screen: back to https://tiba.rizqey.com, footer in view. Banner still says "Test network, no real money".
2:44 - A match pays. A mismatch refuses. Either way you get a public receipt. Test network. No real money.

# End hold: 2:56
