"use client";

import { useState, type ReactNode } from "react";
import { KillSwitchButton } from "./kill-switch-button";
import { IdentityGateButton } from "./identity-gate-button";

type LimitsClientProps = {
  agent: {
    killSwitch: boolean;
    requireRecipientKyc: boolean;
    ceiling: string;
    dayCap: string;
  };
  history: Array<{ id: string; changedAt: string; what: string }>;
};

export function LimitsClient({ agent, history }: LimitsClientProps) {
  const [tab, setTab] = useState<"limits" | "history">("limits");

  return (
    <section>
      <div className="flex gap-6 border-b border-line" role="tablist">
        <TabButton active={tab === "limits"} onClick={() => setTab("limits")}>
          Limits
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          History
        </TabButton>
      </div>

      {tab === "limits" ? (
        <div role="tabpanel" className="mt-2 divide-y divide-line border-t border-line">
          <LimitRow
            title="Identity verification"
            body="When required, anyone without a current identity check is refused before the checks even run."
            control={<IdentityGateButton current={agent.requireRecipientKyc} />}
          />
          <LimitRow
            title="Freeze"
            body={agent.killSwitch ? "Frozen: all payments refused." : "Not frozen."}
            control={<KillSwitchButton current={agent.killSwitch} />}
          />
          <LimitRow
            title="Per-invoice ceiling"
            body="Above this, the payment is refused and shown in Activity."
            control={
              <span className="font-medium text-foreground tabular-nums">
                {agent.ceiling}
              </span>
            }
          />
          <LimitRow
            title="Per-day limit"
            body="Resets at 00:00 UTC."
            control={
              <span className="font-medium text-foreground tabular-nums">
                {agent.dayCap}
              </span>
            }
          />
          <LimitRow
            title="Two checks"
            body="Two independent checks must agree. This cannot be turned off."
            control={<span className="text-sm text-muted">Always on</span>}
          />
        </div>
      ) : (
        <div role="tabpanel" className="py-8">
          {history.length === 0 ? (
            <p className="text-muted">No changes yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((row) => (
                <li key={row.id} className="py-3">
                  <p className="text-sm">{row.what}</p>
                  <p className="mt-1 text-xs text-muted">{row.changedAt}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`pb-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-action focus-visible:outline-offset-2 ${
        active
          ? "border-b-2 border-foreground text-foreground"
          : "text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function LimitRow({
  title,
  body,
  control
}: {
  title: string;
  body: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-6 md:flex-row md:items-start md:justify-between">
      <div className="max-w-xl">
        <h3 className="font-medium">{title}</h3>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
      <div className="w-full shrink-0 md:w-72">{control}</div>
    </div>
  );
}
