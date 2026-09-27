# Zcash testnet payment

Work-order id in the memo: `WO-ZCASH-SPIKE-1`
Memo: `Tiba payout WO-ZCASH-SPIKE-1`
Amount: 100000 zatoshis (0.001 TAZ), shielded.
Transaction id: `6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac`
Explorer: https://testnet.cipherscan.app/tx/6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac

## Faucet

Listed at https://zechub.wiki/using-zcash/faucets (the testnet faucets on the ZecHub wiki; the developers index does not name a URL).
Tried first: https://fauzec.com — POST /api/v1/claim. That claim stayed pending and did not fund the wallet.
Fauzec record: `{"request_id":"01M3BY8D1BKZJFJZ99ZVF09ZV4","network":"testnet","state":"pending","error_code":"submission_ambiguous","claimedAt":"2026-09-25T09:29:32.212Z","source":"https://zechub.wiki/using-zcash/faucets"}`
Funded by https://zcashfaucet.jinolabs.xyz (same ZecHub faucet page; the proof-of-work was solved from this machine). Drip txid `e9522e21b45db94d8a86b6c5840789d2b7683662a3d3c16ecced51019ff61fed`. Explorer: https://testnet.cipherscan.app/tx/e9522e21b45db94d8a86b6c5840789d2b7683662a3d3c16ecced51019ff61fed

## Setup

1. Rust 1.97.1 (zingolib's toolchain file), protoc, cmake, clang, libsqlite3-dev, libssl-dev.
2. `git clone --depth 1 --branch zingolib_v6.0.0 https://github.com/zingolabs/zingolib.git`
3. `cargo build --release -p zingo-cli --no-default-features --features clearnet-test-mode`
4. `node scripts/zcash/spike.mjs`
5. Lightwalletd: `https://testnet.zec.rocks:443`. Chain: testnet. Wallets: `/home/ubuntu/.tiba-zcash-spike` (not in git).

## Timing

- Wallet create (includes the chain-tip request that sets the birthday): 54 ms
- First sync of the new payer wallet: 2049 ms
- Recipient birthday height: 4391626

## Viewing key

The recipient unified full viewing key read the memo back. `messages` on a
view-only wallet created with `--viewkey` and that birthday contained the
work-order id. The key is not a spending key. It is stored at `/home/ubuntu/.tiba-zcash-spike/recipient.ufvk`.
The public receipt says the viewing key is available on request; this file
does not need the seed, and the seed is not recorded here.

```
uviewtest1swp3xgmmmczlr2tkexu5xtmg02v72uaqh7y0nseqjs6uvj5tckz8r5vamvd5krc70n5ankn65dkaqvav98kuwm92jdlena3hn72p09yvxy7r25a9jm6hdvtrckk7l95frj82jpfuq9f6uc6axll8es00h7s4hyva0s0km4w0x8dvc3kssj44xna5l406ts2x0060kdavlyy24lz6vreegfahzn2g335n5tepvzq7m9kayygvd0v296gxqvtny675n0w3nu2fpzjqqkx4v88d7f39ynhtu65eg89vrfmkeheafmjnv6nyx2zdmyxm8wlmg8fg4rdpsfc9va5krq3sqwrf5tjjsd25xp2azrzykt3vsk86j02s928qrh0x23gyw8d92eg5c6l406vqqvdat3j4l38hnr5x8ly70vj656ghvfn3wmcel8h3yhqs4w6cc2pfwjeqxmh9rjd8l6jw5zk9jehrrr6kw2zg5a83gwtpfxchwuhm2pkx
```

Readback stdout:

```
{
  "value_transfers": [
    {
      "txid": "6a39f0b10b9e91af87b5d5efe5e52eeead388270931aca4e2a52f204f191a0ac",
      "datetime": 1790329124,
      "status": "mempool",
      "blockheight": 4391752,
      "transaction_fee": 10000,
      "zec_price": null,
      "kind": "received",
      "value": 100000,
      "recipient_address": null,
      "pools_sent_from": [],
      "pools_received": [
        "Ironwood"
      ],
      "memos": [
        "Tiba payout WO-ZCASH-SPIKE-1"
      ]
    }
  ]
}
```
