import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { StartClient } from "./start-client";

export const metadata: Metadata = { title: "Start - Tiba" };

export default function StartPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="start" />
      <StartClient />
    </main>
  );
}
