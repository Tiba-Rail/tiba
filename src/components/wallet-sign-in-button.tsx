"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ConnectModal, useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { shortSuiAddress } from "@/app/format";

interface WalletChallenge {
  address: string;
  nonce: string;
  message: string;
}

function wasCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rejected|cancelled|canceled|declined|denied/i.test(message);
}

export function WalletSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithWallet() {
    if (!account || busy) return;

    setBusy(true);
    setError(null);
    try {
      const challengeResponse = await fetch("/api/auth/wallet/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: account.address })
      });
      const challenge = await challengeResponse.json().catch(() => ({})) as Partial<WalletChallenge> & { error?: string };
      if (!challengeResponse.ok || !challenge.message || !challenge.nonce) {
        throw new Error(challenge.error ?? "CHALLENGE_FAILED");
      }

      const signed = await signPersonalMessage({
        account,
        message: new TextEncoder().encode(challenge.message)
      });
      const result = await signIn("sui-wallet", {
        redirect: false,
        redirectTo: callbackUrl,
        address: account.address,
        nonce: challenge.nonce,
        message: challenge.message,
        signature: signed.signature
      });

      if (!result || result.error) {
        throw new Error(result?.error ?? "SIGN_IN_FAILED");
      }

      window.location.assign(callbackUrl);
    } catch (caught) {
      setError(
        wasCancelled(caught)
          ? "Signature request cancelled."
          : "Could not sign in with your wallet. Try again."
      );
      setBusy(false);
    }
  }

  const trigger = (
    <button
      type="button"
      className="btn btn-primary w-full"
      disabled={busy}
      aria-busy={busy}
      onClick={account ? signInWithWallet : undefined}
    >
      {busy ? "Signing in…" : "Continue with your wallet"}
    </button>
  );

  return (
    <div className="space-y-2">
      {account ? trigger : <ConnectModal trigger={trigger} />}
      {account && (
        <p className="text-center text-xs text-muted">
          Wallet selected: <span className="num">{shortSuiAddress(account.address)}</span>
        </p>
      )}
      {error && (
        <p className="text-sm text-red-ink" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
