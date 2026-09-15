"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { humanError } from "@/app/console/types";

export function UnlockForm() {
  const router = useRouter();
  const [ownerKey, setOwnerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const key = ownerKey.trim();
      const response = await fetch("/api/console/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner_key: key })
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");
      // The owner-only buttons (approve, freeze, save) read the key from this tab.
      window.sessionStorage.setItem("tiba_operator_token", key);
      router.refresh();
    } catch (caught) {
      setError(humanError(caught instanceof Error ? caught.message : null).text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={unlock} className="mt-6 space-y-3">
      <label className="block text-sm font-medium">
        Owner key
        <input
          className="field mt-1"
          type="password"
          autoComplete="current-password"
          spellCheck={false}
          value={ownerKey}
          onChange={(event) => setOwnerKey(event.target.value)}
          required
        />
      </label>
      {error ? <p className="text-sm text-red-ink">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy || !ownerKey.trim()}>
        {busy ? "Checking…" : "Open wallet"}
      </button>
    </form>
  );
}
