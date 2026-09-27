import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { signupRefFrom } from "@/lib/signup-ref";
import { StartClient } from "./start-client";
import { SignedInNotice } from "./signed-in-notice";

export const metadata: Metadata = { title: "Start - Tiba" };

export default async function StartPage({
  searchParams
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { ref } = await searchParams;
  const signupRef = signupRefFrom(Array.isArray(ref) ? ref[0] : ref);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="start" />
      <SignedInNotice signupRef={signupRef} />
      <StartClient signupRef={signupRef} />
    </main>
  );
}
