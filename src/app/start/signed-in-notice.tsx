import Link from "next/link";
import { auth } from "@/auth";

// Signing in first is what lets someone come back to this wallet later. Offered
// above the form, never required: the keys-only path below still works.
export async function SignedInNotice() {
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
        <p className="text-sm font-medium">Want to come back to this wallet later?</p>
        <p className="mt-1 text-sm text-muted">
          Sign in first with your wallet, Google or GitHub, and it stays on your account.
        </p>
        <Link className="btn btn-primary mt-3" href="/signin?callbackUrl=/start">
          Sign in first
        </Link>
        <p className="mt-3 text-sm text-muted">Or just create one below and keep the two keys.</p>
      </div>
    </div>
  );
}
