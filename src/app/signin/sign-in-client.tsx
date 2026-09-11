"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ConnectModal, useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { SignInProvider } from "@/lib/auth-providers";
import { OpenInSlush } from "@/components/open-in-slush";
import { defaultPublicChain, shortAddress } from "@/app/format";

type Challenge = { address: string; nonce: string; message: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Wallet sign-in is the front door. The server issues a nonce, the wallet signs it,
// the server verifies the signature against the address and opens a session.
export function SignInClient({ providers, callbackUrl }: { providers: SignInProvider[]; callbackUrl: string }) {
  const account = useCurrentAccount();
  const { mutateAsync: signSuiMessage } = useSignPersonalMessage();
  const solana = useWallet();
  const { setVisible: openSolanaModal } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withWallet(
    provider: "sui-wallet" | "solana-wallet",
    address: string,
    signMessage: (message: string) => Promise<string>
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address })
      });
      if (!res.ok) throw new Error("Could not start wallet sign-in.");
      const challenge = (await res.json()) as Challenge;
      const signature = await signMessage(challenge.message);
      const result = await signIn(provider, {
        address: challenge.address,
        nonce: challenge.nonce,
        message: challenge.message,
        signature,
        redirect: false
      });
      if (!result || result.error) throw new Error("The signature was not accepted.");
      window.location.assign(callbackUrl);
    } catch (caught) {
      // A declined signature is the user's choice, not a fault.
      const text = caught instanceof Error ? caught.message : "Sign-in failed.";
      if (!/reject|cancel|declin|denied/i.test(text)) setError(text);
    } finally {
      setBusy(false);
    }
  }

  function withSui() {
    if (!account) return;
    void withWallet("sui-wallet", account.address, async (message) => {
      const { signature } = await signSuiMessage({ message: new TextEncoder().encode(message) });
      return signature;
    });
  }

  function withSolana() {
    const { publicKey, signMessage } = solana;
    if (!publicKey) return;
    if (!signMessage) {
      setError("This wallet cannot sign a message. Try Phantom or Solflare.");
      return;
    }
    void withWallet("solana-wallet", publicKey.toBase58(), async (message) =>
      toBase64(await signMessage(new TextEncoder().encode(message)))
    );
  }

  const solanaFirst = defaultPublicChain === "solana";
  const solanaAddress = solana.publicKey?.toBase58();

  const solanaBlock = providers.includes("solana-wallet") ? (
    solanaAddress ? (
      <button key="solana" type="button" className={`btn ${solanaFirst ? "btn-primary" : "btn-secondary"} w-full`} onClick={withSolana} disabled={busy}>
        {busy ? "Confirm in wallet…" : `Continue as ${shortAddress(solanaAddress)} (Solana)`}
      </button>
    ) : (
      <button key="solana" type="button" className={`btn ${solanaFirst ? "btn-primary" : "btn-secondary"} w-full`} onClick={() => openSolanaModal(true)}>
        Continue with a Solana wallet
      </button>
    )
  ) : null;

  const suiBlock = account ? (
    <button key="sui" type="button" className={`btn ${solanaFirst ? "btn-secondary" : "btn-primary"} w-full`} onClick={withSui} disabled={busy}>
      {busy ? "Confirm in wallet…" : `Continue as ${shortAddress(account.address)} (Sui)`}
    </button>
  ) : (
    <div key="sui" className="flex flex-col gap-3">
      <ConnectModal
        trigger={
          <button type="button" className={`btn ${solanaFirst ? "btn-secondary" : "btn-primary"} w-full`}>
            Continue with a Sui wallet
          </button>
        }
      />
      <OpenInSlush />
    </div>
  );

  const social = providers.filter((p): p is "google" | "github" => p === "google" || p === "github");

  return (
    <div className="mt-8 flex max-w-sm flex-col gap-3">
      {solanaFirst ? [solanaBlock, suiBlock] : [suiBlock, solanaBlock]}

      {social.length > 0 ? (
        <>
          <p className="mt-2 text-center text-xs text-muted">or</p>
          {social.includes("google") ? (
            <button type="button" className="btn btn-secondary w-full" onClick={() => signIn("google", { callbackUrl })}>
              Continue with Google
            </button>
          ) : null}
          {social.includes("github") ? (
            <button type="button" className="btn btn-secondary w-full" onClick={() => signIn("github", { callbackUrl })}>
              Continue with GitHub
            </button>
          ) : null}
        </>
      ) : null}

      {error ? <p className="text-sm text-red-ink">{error}</p> : null}
    </div>
  );
}
