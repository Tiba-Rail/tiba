import type { Metadata } from "next";
import Link from "next/link";
import { enabledSignInProviders } from "@/lib/auth-providers";
import { SignInClient } from "./sign-in-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in - Tiba" };

function safeCallbackUrl(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/workspaces";
  return value;
}

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 md:px-6 md:py-12 lg:px-8">
        <Link href="/" className="text-sm font-medium text-action transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
          Tiba
        </Link>
        <div className="my-auto py-16">
          <p className="eyebrow">Sign in</p>
          <h1 className="display-l mt-3">Sign in to Tiba</h1>
          <SignInClient providers={enabledSignInProviders()} callbackUrl={safeCallbackUrl(callbackUrl)} />
        </div>
      </div>
    </main>
  );
}
