"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { humanError } from "@/app/console/types";

// Approve a held payment from the Activity feed. Reads the owner key from this
// tab's sessionStorage — the same key the Send page uses. With no key in this
// tab, the row offers a link to Send, where the key field lives.
export function ApproveButton({ intentId }: { intentId: string }) {
  const router = useRouter();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHasKey(Boolean(window.sessionStorage.getItem("tiba_operator_token")));
  }, []);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const token = window.sessionStorage.getItem("tiba_operator_token") ?? "";
      const response = await fetch(`/api/v1/intents/${intentId}/override`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");
      router.refresh();
    } catch (caught) {
      setError(humanError(caught instanceof Error ? caught.message : null).text);
    } finally {
      setBusy(false);
    }
  }

  if (hasKey === false) {
    return (
      <Link className="link shrink-0 text-sm" href="/console#approvals">
        Approve on Send →
      </Link>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <button
        type="button"
        className="btn btn-secondary min-h-10 px-3 text-sm"
        disabled={busy || hasKey === null}
        aria-busy={busy}
        onClick={approve}
      >
        {busy ? "Approving…" : "Approve"}
      </button>
      {error ? <span className="text-xs text-refused">{error}</span> : null}
    </span>
  );
}
