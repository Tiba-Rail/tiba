import { SiteNav } from "@/components/site-nav";
import { ReceiptVerifier } from "./receipt-verifier";

export const metadata = { title: "Verify a receipt — Tiba" };

export default function VerifyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="verify" />
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <header className="max-w-2xl">
          <p className="eyebrow">Verify a receipt</p>
          <h1 className="display-l mt-2">Check the proof in your browser.</h1>
          <p className="mt-4 max-w-[58ch] text-sm leading-6 text-muted md:text-base">
            Paste a signed receipt and verify its signature, permission chain, scope, budget, and payment evidence without sending it anywhere.
          </p>
        </header>
        <ReceiptVerifier />
      </div>
    </main>
  );
}
