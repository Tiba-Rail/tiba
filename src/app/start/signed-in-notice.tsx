import Link from "next/link";
import { auth } from "@/auth";

// Signing in first is what lets someone come back to this wallet later. Offered
// above the form, never required: the keys-only path below still works.
export async function SignedInNotice({ signupRef = null }: { signupRef?: string | null }) {
  let user = null;
  try {
    user = (await auth())?.user ?? null;
  } catch {
    user = null;
  }

  if (user?.id) {
    const label = user.name || user.email || "your account";
    return (
      <div className="mx-auto max-w-2xl px-4 pt-8 md:px-6 lg:px-8">
        <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted">
          Signed in as {label}. This wallet will be saved to your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 md:px-6 lg:px-8">
      <div className="rounded-md border border-line bg-surface px-4 py-4">
        <p className="text-sm font-medium">Sign in to pay on Solana's test network.</p>
        <p className="mt-1 text-sm text-muted">
          Without sign-in, payments are simulated and nothing moves on chain. Signed-in wallets are limited per account and per day.
        </p>
        <Link
          className="btn btn-primary mt-3"
          href={`/signin?callbackUrl=${encodeURIComponent(signupRef ? `/start?ref=${signupRef}` : "/start")}`}
        >
          Sign in first
        </Link>
        <p className="mt-3 text-sm text-muted">Or create one below without signing in and keep the two keys.</p>
      </div>
    </div>
  );
}
