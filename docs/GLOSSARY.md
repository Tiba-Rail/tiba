# Glossary — the sentence to say when a judge uses the word

- **Agent** — a piece of software that does a job on its own. Here, the thing deciding someone should be paid.
- **Intent** — a request to pay: who, how much, and the evidence. The agent sends it; Tiba decides.
- **Artifact** — the evidence. A delivery note or invoice text. Untrusted, because anyone can write one.
- **Two channels** — two separate checks. One reads the evidence; the other reads our own records and never sees the evidence. Both must name the same person and amount.
- **Refusal on disagreement** — if the two checks don't match, we don't pay. No averaging, no picking one. We stop.
- **Policy caps** — limits the operator sets once: max per payment, max per hour and day, who can be paid, and a kill switch.
- **Atomic** — the limit check and the spend happen as one step, so two payments can't both squeeze under the cap at the same moment.
- **Idempotency** — sending the same request twice pays once. A retry can never double-pay.
- **Node** — one of the many computers in Gonka's network that actually runs the AI model. Which one answers your request is luck of the draw, and some are slow.
- **Model** — the AI itself (Kimi, DeepSeek). The router picks a node to run it on.
- **Hedging** — each check goes to two AI models at the same time; the first valid answer wins. It's how we stay fast when one model is slow.
- **Request ID** — the router's receipt number for each AI call. It's on every public receipt so anyone can audit which call decided what.
- **Digest** — the blockchain's receipt number for a payment. Click it and you see the transaction.
- **Testnet** — the practice version of the blockchain. Real transactions, no real money. Mainnet with real funds is banned during the hackathon.
- **Stand-in** — we settle in the test network's own coin because test USDC wasn't available. Same mechanics, different coin.
- **PTB** — a way to bundle several payments into one blockchain transaction. We use it for batch payouts.
- **API v1** — just the label on the first version of our interface. There is no v2.
- **Identity gate** — an optional extra check, off by default: if the operator turns it on, a recipient who hasn't passed an identity (eKYC) check is refused before any AI runs. Today the check is a stand-in; a real provider plugs into the same slot.
