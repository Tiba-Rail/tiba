"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ConnectModal, useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import type { SignInProvider } from "@/lib/auth-providers";

// Wallet sign-in is the front door. The server issues a nonce, the wallet signs it,
// the server verifies the signature against the address and opens a session.
export function SignInClient({ providers, callbackUrl }: { providers: SignInProvider[]; callbackUrl: string }) {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withWallet() {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account.address })
      });
      if (!res.ok) throw new Error("Could not start wallet sign-in.");
      const challenge = (await res.json()) as { address: string; nonce: string; message: string };
      const { signature } = await signMessage({ message: new TextEncoder().encode(challenge.message) });
      const result = await signIn("sui-wallet", {
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

  const social = providers.filter((p): p is "google" | "github" => p === "google" || p === "github");

  return (
    <div className="mt-8 flex max-w-sm flex-col gap-3">
      {account ? (
        <button type="button" className="btn btn-primary w-full" onClick={withWallet} disabled={busy}>
          {busy ? "Confirm in wallet…" : `Continue as ${account.address.slice(0, 6)}…${account.address.slice(-4)}`}
        </button>
      ) : (
        <ConnectModal trigger={<button type="button" className="btn btn-primary w-full">Continue with your wallet</button>} />
      )}

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
