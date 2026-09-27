import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { TryClient } from "./try-client";

export const metadata: Metadata = { title: "Try it - Tiba" };

export default function TryPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="try" />
      <TryClient />
    </main>
  );
}
