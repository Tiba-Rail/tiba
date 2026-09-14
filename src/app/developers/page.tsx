import { SiteNav } from "@/components/site-nav";
import { SpecRenderer } from "@/components/spec-renderer";
import { TIBA_STANDARD_SPEC } from "@/lib/tiba-standard/spec-content";
import mandateSchema from "@/lib/tiba-standard/schemas/tiba-mandate-v0.1.schema.json";
import receiptSchema from "@/lib/tiba-standard/schemas/tiba-receipt-v0.1.schema.json";
import revocationSchema from "@/lib/tiba-standard/schemas/tiba-revocation-list-v0.1.schema.json";

export const metadata = { title: "Developers — Tiba" };

const integrations = [
  { name: "AP2", adds: "A cross-protocol policy envelope and signed action receipt.", keeps: "Checkout mandates, credentials, payment receipts, and dispute evidence stay AP2." },
  { name: "x402", adds: "A pre-payment policy check, spend accounting, and a receipt for the whole action.", keeps: "Payment headers, facilitator verification, and settlement stay x402." },
  { name: "Visa TAP", adds: "User policy, non-payment tool-call receipts, and delegated permission chains.", keeps: "HTTP signatures, key-store rules, and payment containers stay TAP." },
  { name: "MCP", adds: "A semantic permit for each tools/call plus a signed action receipt.", keeps: "OAuth, access control, tool schemas, and tool results stay MCP." },
  { name: "A2A", adds: "A narrow signed mandate passed with a delegated task and an auditable completion receipt.", keeps: "Discovery, task lifecycle, message content, and authentication stay A2A." }
];

const schemas = [
  { name: "Mandate schema", file: "tiba-mandate-v0.1.schema.json", value: mandateSchema },
  { name: "Receipt schema", file: "tiba-receipt-v0.1.schema.json", value: receiptSchema },
  { name: "Revocation list schema", file: "tiba-revocation-list-v0.1.schema.json", value: revocationSchema }
];

export default function DevelopersPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav current="developers" />
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14 lg:px-8">
        <header className="max-w-3xl">
          <p className="eyebrow">Developers</p>
          <h1 className="display-l mt-2">A portable permission and proof layer for agents.</h1>
          <p className="mt-4 max-w-[62ch] text-sm leading-6 text-muted md:text-base">
            Tiba adds a signed permission slip before an agent acts and a signed receipt after it does. It works beside the protocols that already carry the action.
          </p>
        </header>

        <section className="mt-12 border-t border-line pt-8" aria-labelledby="fits-title">
          <p className="eyebrow">Where it fits</p>
          <h2 id="fits-title" className="display-m mt-2">Tiba adds the boundary. Your protocol keeps its job.</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {integrations.map((integration) => (
              <article key={integration.name} className="card p-5">
                <h3 className="title">{integration.name}</h3>
                <p className="mt-3 text-sm leading-6 text-foreground"><span className="font-medium">Tiba adds: </span>{integration.adds}</p>
                <p className="mt-3 text-sm leading-6 text-muted"><span className="font-medium text-foreground">Stays there: </span>{integration.keeps}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-line pt-8" aria-labelledby="schemas-title">
          <p className="eyebrow">Schemas</p>
          <h2 id="schemas-title" className="display-m mt-2">The signed objects</h2>
          <div className="mt-6 space-y-3">
            {schemas.map((schema) => (
              <details key={schema.file} className="card overflow-hidden" suppressHydrationWarning>
                <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
                  {schema.name} <span className="num ml-2 text-xs font-normal text-muted">{schema.file}</span>
                </summary>
                <pre className="max-h-[34rem] overflow-auto border-t border-line bg-surface p-5 text-xs leading-5 text-foreground"><code>{JSON.stringify(schema.value, null, 2)}</code></pre>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-line pt-8" aria-labelledby="spec-title">
          <p className="eyebrow">Specification</p>
          <h2 id="spec-title" className="display-m mt-2">Full specification</h2>
          <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted">
            Version 0.1. This page renders the complete normative specification used by the demo.
          </p>
          <div className="mt-8 max-w-4xl">
            <SpecRenderer source={TIBA_STANDARD_SPEC} />
          </div>
        </section>
      </div>
    </main>
  );
}
