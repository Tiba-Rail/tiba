"use client";

export default function ReceiptError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-16 pt-16 md:px-6 md:pt-24 lg:px-8">
        <p className="eyebrow">Tiba</p>
        <h1 className="display-l mt-2">Receipt not available right now</h1>
        <p className="lede mt-4 max-w-[52ch]">
          This receipt could not be loaded because the database is temporarily unavailable. Try
          again later.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn btn-ghost" href="/">
            Back to Tiba
          </a>
        </div>
      </div>
    </main>
  );
}
