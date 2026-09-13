"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { SignInProvider } from "@/lib/auth-providers";
import { shortAddress } from "@/app/format";

type Challenge = { address: string; nonce: string; message: string };
function toBase64(bytes: Uint8Array): string { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }

export function SignInClient({ providers, callbackUrl }: { providers: SignInProvider[]; callbackUrl: string }) {
  const wallet = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function withSolana() {
    const { publicKey, signMessage } = wallet;
    if (!publicKey || !signMessage) return setError("This wallet cannot sign a message. Try Phantom or Solflare.");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/wallet/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: publicKey.toBase58() }) });
      if (!res.ok) throw new Error("Could not start wallet sign-in.");
      const challenge = await res.json() as Challenge;
      const result = await signIn("solana-wallet", { address: challenge.address, nonce: challenge.nonce, message: challenge.message, signature: toBase64(await signMessage(new TextEncoder().encode(challenge.message))), redirect: false });
      if (!result || result.error) throw new Error("The signature was not accepted.");
      window.location.assign(callbackUrl);
    } catch (caught) { const text = caught instanceof Error ? caught.message : "Sign-in failed."; if (!/reject|cancel|declin|denied/i.test(text)) setError(text); } finally { setBusy(false); }
  }
  const address = wallet.publicKey?.toBase58();
  const social = providers.filter((p): p is "google" | "github" => p === "google" || p === "github");
  return <div className="mt-8 flex max-w-sm flex-col gap-3">
    {providers.includes("solana-wallet") ? <button type="button" className="btn btn-primary w-full" onClick={address ? withSolana : () => openWalletModal(true)} disabled={busy}>{busy ? "Confirm in wallet…" : address ? `Continue as ${shortAddress(address)} (Solana)` : "Continue with a Solana wallet"}</button> : null}
    {social.length > 0 ? <><p className="mt-2 text-center text-xs text-muted">or</p>{social.includes("google") ? <button type="button" className="btn btn-secondary w-full" onClick={() => signIn("google", { callbackUrl })}>Continue with Google</button> : null}{social.includes("github") ? <button type="button" className="btn btn-secondary w-full" onClick={() => signIn("github", { callbackUrl })}>Continue with GitHub</button> : null}</> : null}
    {error ? <p className="text-sm text-red-ink">{error}</p> : null}
  </div>;
}
