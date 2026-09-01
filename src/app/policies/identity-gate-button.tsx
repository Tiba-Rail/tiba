"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IdentityGateButtonProps {
  current: boolean;
}

export function IdentityGateButton({ current }: IdentityGateButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const token = window.sessionStorage.getItem("tiba_operator_token");
    if (!token) {
      setError("Operator token required");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/policies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ require_recipient_kyc: !current })
      });

      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "REQUEST_FAILED");

      setMessage("Updated");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {(message || error) && (
        <div className={error ? "text-red-ink text-sm" : "text-paid text-sm"}>
          {error ?? message}
        </div>
      )}

      <button
        type="button"
        className={current ? "btn btn-secondary" : "btn btn-primary"}
        disabled={busy}
        aria-busy={busy}
        onClick={toggle}
      >
        {busy ? "Processing..." : (current ? "Stop requiring verified identity" : "Require verified identity")}
      </button>
    </div>
  );
}
