import type { ChannelView, ReceiptComparison } from "@/lib/receipt-comparison";

function channelBody(view: ChannelView): string {
  if (view.workOrderId && view.amount) return `Work order ${view.workOrderId}, ${view.amount}.`;
  return view.note ?? "";
}

function CompactComparison({ comparison }: { comparison: ReceiptComparison }) {
  return (
    <div className="mt-3 space-y-2 text-sm" aria-label="The bill, the record, and the mismatch">
      <p>
        <span className="font-medium">{comparison.bill.title}.</span> {comparison.bill.intro} {channelBody(comparison.bill)}
      </p>
      <p>
        <span className="font-medium">{comparison.record.title}.</span> {comparison.record.intro} {channelBody(comparison.record)}
      </p>
      <div>
        <p className="font-medium">The mismatch.</p>
        {comparison.fields.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {comparison.fields.map((field) => (
              <li key={field.label}>
                {field.label}:{" "}
                <span className="num rounded bg-refused-bg px-1 text-refused">{field.bill}</span>
                <span className="text-muted"> on the bill, </span>
                <span className="num rounded bg-refused-bg px-1 text-refused">{field.record}</span>
                <span className="text-muted"> on the record.</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1">{comparison.mismatchNote}</p>
        )}
      </div>
    </div>
  );
}

function ChannelPanel({ view }: { view: ChannelView }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">{view.title}</p>
      <p className="mt-2 text-sm text-muted">{view.intro}</p>
      {view.workOrderId && view.amount ? (
        <>
          <p className="mt-4 text-sm text-muted">Work order</p>
          <p className="num mt-1 break-all text-lg">{view.workOrderId}</p>
          <p className="mt-3 text-sm text-muted">Amount</p>
          <p className="num mt-1 text-lg">{view.amount}</p>
        </>
      ) : (
        <p className="mt-4 text-sm">{view.note}</p>
      )}
    </div>
  );
}

function MismatchPanel({ comparison }: { comparison: ReceiptComparison }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">The mismatch</p>
      {comparison.fields.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {comparison.fields.map((field) => (
            <div key={field.label}>
              <p className="text-sm font-medium">{field.label}</p>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-refused-bg px-2 py-1.5">
                  <p className="text-xs text-muted">Bill</p>
                  <p className="num mt-0.5 break-all text-sm font-medium text-refused">{field.bill}</p>
                </div>
                <div className="rounded-md bg-refused-bg px-2 py-1.5">
                  <p className="text-xs text-muted">Record</p>
                  <p className="num mt-0.5 break-all text-sm font-medium text-refused">{field.record}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm">{comparison.mismatchNote}</p>
      )}
    </div>
  );
}

/** The bill, the payer's own record, and any field that differed. Compact is the homepage card. */
export function BillRecordMismatch({
  comparison,
  compact = false
}: {
  comparison: ReceiptComparison;
  compact?: boolean;
}) {
  if (compact) return <CompactComparison comparison={comparison} />;

  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="The bill, the record, and the mismatch">
      <ChannelPanel view={comparison.bill} />
      <ChannelPanel view={comparison.record} />
      <MismatchPanel comparison={comparison} />
    </section>
  );
}
