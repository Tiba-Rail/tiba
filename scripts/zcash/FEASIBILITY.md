# Zcash rail spike — feasibility

Written before any payment was sent. Measured sync time and the transaction id are filled in after the run, in `PAYMENT.md` next to this file. If that file is missing, the live payment did not finish.

## What I assumed

- This cloud VM stands in for the laptop in the brief. It started with Node 22.22.2 (the repo asks for Node 24, CI uses Node 25) and Rust 1.83. Zingolib’s own pin is Rust 1.97.1. Cargo downloads that pin when the CLI is built. Nothing here changes Solana settlement.
- `https://zechub.wiki/developers` is an index. It names zingolib and lightwalletd, and it does not name a faucet. The current testnet faucets are on the same wiki at `https://zechub.wiki/using-zcash/faucets`: `fauzec.com` and `zcashfaucet.jinolabs.xyz`. I treat that page as the ZecHub doc the brief pointed at.
- One shielded testnet payment is enough. The memo carries work-order id `WO-ZCASH-SPIKE-1` (`Tiba payout WO-ZCASH-SPIKE-1`), the same sentence shape as the Solana memo. There is no Zcash work-order row in the database; this spike does not go through the intent pipeline.
- The Zcash rail, if the payment and the viewing-key readback both work, is an extra rail. Solana stays the default. The public receipt does not print the viewing key. It says the key is available on request.
- The seed phrase stays in the wallet file outside this repo (`~/.tiba-zcash-spike`). It is not committed. The unified full viewing key is the receipt credential.

## Pick

Drive `zingo-cli` from Node. Do not build a wallet from scratch, and do not link zingolib into the Next.js process.

| Piece | Choice |
| --- | --- |
| Library | [zingolib](https://github.com/zingolabs/zingolib) tag `zingolib_v6.0.0` (8 Sep 2026, commit `c6381534f802b1022041beda4b01c106ad132329`). This tag includes Ironwood. Testnet in September 2026 is past that upgrade (`consensusBranchId` `37a5165b`). An older CLI that cannot read Ironwood compact blocks cannot spend. |
| Binary | `zingo-cli`, release build. No GitHub release ships a binary. |
| How Node calls it | `child_process` in `scripts/zcash/spike.mjs`. One command per process. Stdout is the JSON result. Logs go to stderr. |
| Chain | Zcash testnet (TAZ). |
| Server | `https://testnet.zec.rocks:443` |

Checked live on 25 Sep 2026 with `GetLightdInfo`:

- version `v0.5.4`, vendor ECC LightWalletD, chain `test`
- height `4391568` (matched the estimated height)
- backend `/Zakura:1.5.0/`
- protocol `v0.5.0`

No full node and no local lightwalletd. The public server is the indexer.

## Why this build flag

Ordinary `zingo-cli` v6 goes online only through the Nym mixnet, and that needs a second `nym-proxy` binary from another workspace. A build with `--no-default-features` refuses to go online at all.

The lightest path that can still pin the public testnet server is the quarantined test switch:

```bash
cargo build --release -p zingo-cli --no-default-features --features clearnet-test-mode
```

`clearnet-test-mode` is not a default. Zingo’s own comment says it is for tests, not ordinary wallets. That matches this spike: one TAZ payment, server pinned, no mixnet compile. The CLI prints a warning when that build goes online.

## What has to be installed

- Rust 1.97.1 (the `rust-toolchain.toml` in that tag). The README asks for 1.90 or newer.
- A C toolchain, `protoc`, `libsqlite3-dev`, `cmake`, `clang`, `libssl-dev`.
- Node, only to spawn the CLI. No new npm dependency.
- Network access to `testnet.zec.rocks:443` and `fauzec.com`.

Not required: zcashd, zebrad, a local lightwalletd, Docker, the Nym proxy, FROST.

Clone and build outside this repo (the binary is large and is not committed):

```bash
git clone --depth 1 --branch zingolib_v6.0.0 https://github.com/zingolabs/zingolib.git
cd zingolib
cargo build --release -p zingo-cli --no-default-features --features clearnet-test-mode
```

The Node scripts look for the binary in `ZINGO_CLI`, then `~/zingolib/target/release/zingo-cli`.

## How long the first sync takes

A brand-new wallet created while `--server` is set asks the indexer for the chain tip and sets its birthday to that height minus 100 blocks (`WalletConfig::NewSeed` in zingolib). The first sync then scans about a hundred compact blocks, not the chain from genesis and not from Sapling activation (testnet height 280000).

Measured on 25 Sep 2026: the new payer wallet's first sync took 2049 ms. Wallet create, including the chain-tip request, took 90 ms the first time. Details are in `PAYMENT.md`.

The slow path, which this spike does not take: restoring with `--birthday 0`, or creating the wallet offline. Offline, with no birthday override, the library birthday for this tag is testnet height `4134000`. From there to the tip on 25 Sep 2026 is about 257000 blocks. That is a long scan. Stop rather than start it.

`export_ufvk` and `messages` do not need a second full scan beyond the view-only wallet’s own birthday, which is the recipient wallet’s birthday (before the payment).

## Faucet

Source: `https://zechub.wiki/using-zcash/faucets` (ZecHub). Testnet entries listed there:

1. `https://fauzec.com` — HTTP API, shielded to a unified address or a Sapling address, 1 TAZ per address per 24 hours. This is the one the script calls.
2. `https://zcashfaucet.jinolabs.xyz` — 0.1 TAZ, gated by a hashcash proof of work (`sha256(seed:nonce)` with a set number of leading zero bits). A script can solve that. The live faucet on 25 Sep 2026 had a spendable balance and a synced node.

On 25 Sep 2026, `POST https://fauzec.com/api/v1/claim` with a body that had `network` but no address returned HTTP 400 and `error_code: malformed_request`. The API process is up. A real claim waits until the wallet has a unified address. If that claim errors, or the coins never show up in the wallet, the spike stops and says the faucet failed. It does not fall through to a second send.

## The one payment and the receipt proof

Commands the script uses (session flags omitted here; the script always passes `--chain testnet` and `--server https://testnet.zec.rocks:443`):

1. `addresses` — JSON array. The unified address is `encoded_address` (testnet prefix `utest1`).
2. `balance` — text, zatoshis with thousands separators (`100_000_000` is 1 TAZ).
3. `quicksend <address> <zatoshis> "<memo>"` — proposes and transmits in one process. Returns JSON `txids`. Amount is `100000` zatoshis (0.001 TAZ). The fee is extra and comes out of the sender balance.
4. `export_ufvk` — JSON `{ "ufvk", "birthday" }`. Run on the recipient wallet, offline.
5. A new data directory with `--viewkey` and `--birthday`, then `messages WO-ZCASH-SPIKE-1`. The filter matches memo text. That output is the proof that the viewing key can read the payment.

`send` only stores a proposal. A later process would have to `confirm` it, and the proposal has to still be in the wallet file. `quicksend` keeps propose and broadcast in one process, so that is what the script uses.

Explorer link shape: `https://testnet.cipherscan.app/tx/<txid>`. On 25 Sep 2026 `testnet.zcashexplorer.app` was still showing early-September blocks and returned 404 for this payment, while lightwalletd was at height 4391568. CipherScan returned the shielded transaction. The memo is not on that page. The viewing key is what makes the memo readable.

## What the 3 Oct workshop would add

Not in this spike.

The 3 Oct 2026 workshop (8am PT, FROST wallets and payments) is the threshold-signature step. Zcash Foundation frost-tools (`frostd` plus `frost-client`) lets two key-holders co-sign one spend. That is Tiba’s “both checks must agree” done in the signature: neither check’s share can move the funds alone. `zcash-devtool` has FROST support as well. Either one would replace the single spending key inside the payer wallet. It would not replace the viewing-key receipt. This job does not install frost-tools, does not generate a FROST key, and does not change the two-channel check.

## If it does not fit

Stop and say which stage died: compile, lightwalletd, first sync, or faucet. Do not invent a transaction id. Do not add `src/lib/rails/zcash.ts` unless the payment and the viewing-key readback both succeeded.

## What happened on 25 Sep 2026

Compile, lightwalletd, and the first sync all worked. The first sync was 2.0 seconds.

`fauzec.com` accepted a claim (`request_id` `01M3BY8D1BKZJFJZ99ZVF09ZV4`) and left it `pending` with `submission_ambiguous`. A later status read returned HTTP 503 `runtime_unavailable`. No TAZ from that claim showed up in the wallet.

The other faucet on the same ZecHub page, `zcashfaucet.jinolabs.xyz`, was funded and synced. Its proof of work is hashcash at 20 leading zero bits. Solving that from this machine returned a shielded drip:

- txid `e9522e21b45db94d8a86b6c5840789d2b7683662a3d3c16ecced51019ff61fed`
- https://testnet.cipherscan.app/tx/e9522e21b45db94d8a86b6c5840789d2b7683662a3d3c16ecced51019ff61fed
- 0.1 TAZ, received in the Ironwood pool

The payer then sent 100000 zatoshis (0.001 TAZ) to a second unified address with memo `Tiba payout WO-ZCASH-SPIKE-1`:

- txid `6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac`
- https://testnet.cipherscan.app/tx/6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac

A view-only wallet opened with the recipient unified full viewing key listed that transfer as `received`, pool `Ironwood`, memo `Tiba payout WO-ZCASH-SPIKE-1`. The seed phrase is not in the repo. `testnet.zcashexplorer.app` returned 404 for this txid (that explorer was behind the chain tip). CipherScan showed it.
