import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { StartClient } from "./start-client";
import { SignedInNotice } from "./signed-in-notice";

export const metadata: Metadata = { title: "Start - Tiba" };

export default async function StartPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="start" />
      <SignedInNotice />
      <StartClient />
    </main>
  );
}
