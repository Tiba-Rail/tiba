import { createElement, type ReactNode } from "react";
import { formatLatency } from "./money.ts";
import { PAYER_RECORD_RULES_MODEL } from "./payer-record-rules.ts";

/** Shown on the receipt when check 2 was the rules function, not a model. */
export const CHECK_2_RULES_LABEL = "Check 2: rules, no AI";

export type PayerRecordCheckProps = {
  model: string | null;
  fallback?: string | null;
  requestId?: string | null;
  latencyMs?: number | null;
};

/** The detail cell for check 2 on the public receipt. */
export function PayerRecordCheckDetail(props: PayerRecordCheckProps): ReactNode {
  if (props.model === PAYER_RECORD_RULES_MODEL) {
    return createElement("div", { className: "text-sm" }, CHECK_2_RULES_LABEL);
  }

  return createElement(
    "div",
    { className: "text-sm" },
    createElement("div", { className: "break-all" }, "Model used: ", props.model),
    props.fallback
      ? createElement(
          "div",
          { style: { color: "var(--held)" } },
          "The reading service swapped in a different model for this reader: ",
          createElement("span", { className: "num break-all text-xs" }, props.fallback)
        )
      : null,
    createElement(
      "div",
      null,
      "Reference (request ID): ",
      createElement("span", { className: "num break-all text-xs" }, props.requestId ?? "missing")
    ),
    createElement(
      "div",
      null,
      "Took: ",
      createElement("span", { className: "num" }, formatLatency(props.latencyMs))
    )
  );
}
