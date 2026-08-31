"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OperatorTokenField } from "@/components/operator-token-field";

interface KillSwitchButtonProps {
  current: boolean;
}

export function KillSwitchButton({ current }: KillSwitchButtonProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggleKillSwitch() {
    const token = window.sessionStorage.getItem("tiba_operator_token");
    if (!token) {
      setError("Operator token required");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/v1/kill", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: !current })
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
      <OperatorTokenField className="w-full" />

      {(message || error) && (
        <div className={error ? "text-red-ink text-sm" : "text-paid text-sm"}>
          {error ?? message}
        </div>
      )}

      <button
        type="button"
        className={current ? "btn btn-secondary text-red-ink" : "btn btn-primary"}
        disabled={busy}
        aria-busy={busy}
        onClick={toggleKillSwitch}
      >
        {busy ? "Processing..." : (current ? "Disable kill switch" : "Engage kill switch")}
      </button>
    </div>
  );
}
