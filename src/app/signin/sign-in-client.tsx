"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { SignInProvider } from "@/lib/auth-providers";
import { WalletSignInButton } from "@/components/wallet-sign-in-button";

const oauthLabels = {
  google: "Continue with Google",
  github: "Continue with GitHub"
} as const;

export function SignInClient({
  providers,
  callbackUrl
}: {
  providers: SignInProvider[];
  callbackUrl: string;
}) {
  const [busyProvider, setBusyProvider] = useState<"google" | "github" | null>(null);
  const oauthProviders = providers.filter(
    (provider): provider is "google" | "github" => provider === "google" || provider === "github"
  );

  async function continueWithOAuth(provider: "google" | "github") {
    setBusyProvider(provider);
    await signIn(provider, { redirectTo: callbackUrl });
  }

  return (
    <div className="mt-8 max-w-md">
      <WalletSignInButton callbackUrl={callbackUrl} />

      {oauthProviders.length > 0 && (
        <div className="mt-7 border-t border-line pt-6">
          <p className="text-sm text-muted">Or use an account</p>
          <div className="mt-3 space-y-3">
            {oauthProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                className="btn btn-secondary w-full"
                disabled={busyProvider !== null}
                aria-busy={busyProvider === provider}
                onClick={() => void continueWithOAuth(provider)}
              >
                {busyProvider === provider ? "Opening…" : oauthLabels[provider]}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-5 text-muted">
        Wallet sign-in proves ownership of your address. It does not authorize a transaction or move funds.
      </p>
    </div>
  );
}
