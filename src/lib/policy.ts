/** Deterministic money controls. No model output is trusted here. */
export type DecisionClass = "AMBER" | "RED" | "PAID";

export type PolicyReason =
  | "INVALID_AMOUNT"
  | "INVALID_TIMESTAMP"
  | "NO_OPEN_OBLIGATION"
  | "WORK_ORDER_EXPIRED"
  | "WORK_ORDER_NOT_OPEN"
  | "RECIPIENT_INACTIVE"
  | "WORK_ORDER_CEILING"
  | "TRANSACTION_CEILING"
  | "KILL_SWITCH"
  | "HOUR_AMOUNT_CAP"
  | "DAY_AMOUNT_CAP"
  | "HOUR_COUNT_CAP"
  | "DAY_COUNT_CAP";

export interface AgentLimits {
  id: string;
  ceilingMicros: bigint;
  hourCapMicros: bigint;
  dayCapMicros: bigint;
  hourCountCap: number;
  dayCountCap: number;
  killSwitch: boolean;
}

export interface WorkOrderForPolicy {
  id: string;
  ceilingMicros: bigint;
  status: string;
  expiresAt: Date | string;
}

export interface PreDebitInput {
  agent: AgentLimits;
  workOrder: WorkOrderForPolicy | null;
  recipientActive: boolean;
  amountMicros: bigint;
  now?: Date;
}

export type PolicyResult =
  | { ok: true }
  | { ok: false; reasonCode: PolicyReason };

function validDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Checks that are deterministic before the database debit. A bad timestamp is
 * deliberately a refusal: expiry can never be interpreted in the caller's favour.
 */
export function evaluateBeforeDebit(input: PreDebitInput): PolicyResult {
  const now = input.now ?? new Date();
  if (!validDate(now)) return { ok: false, reasonCode: "INVALID_TIMESTAMP" };
  if (input.amountMicros <= 0n) return { ok: false, reasonCode: "INVALID_AMOUNT" };
  if (!input.workOrder) return { ok: false, reasonCode: "NO_OPEN_OBLIGATION" };
  const expiry = validDate(input.workOrder.expiresAt);
  if (!expiry) return { ok: false, reasonCode: "INVALID_TIMESTAMP" };
  if (input.workOrder.status !== "open") return { ok: false, reasonCode: "WORK_ORDER_NOT_OPEN" };
  if (expiry.getTime() <= now.getTime()) return { ok: false, reasonCode: "WORK_ORDER_EXPIRED" };
  if (!input.recipientActive) return { ok: false, reasonCode: "RECIPIENT_INACTIVE" };
  if (input.amountMicros > input.workOrder.ceilingMicros) {
    return { ok: false, reasonCode: "WORK_ORDER_CEILING" };
  }
  if (input.amountMicros > input.agent.ceilingMicros) {
    return { ok: false, reasonCode: "TRANSACTION_CEILING" };
  }
  if (input.agent.killSwitch) return { ok: false, reasonCode: "KILL_SWITCH" };
  return { ok: true };
}

export interface RollingCounters {
  spentMicrosHour: bigint;
  spentMicrosDay: bigint;
  countHour: number;
  countDay: number;
  windowStartedAt: Date;
  dayStartedAt: Date;
}

export interface MutableAgentState extends AgentLimits, RollingCounters {}

function resetWindows(state: MutableAgentState, now: Date): void {
  if (now.getTime() - state.windowStartedAt.getTime() >= 60 * 60 * 1000) {
    state.spentMicrosHour = 0n;
    state.countHour = 0;
    state.windowStartedAt = now;
  }
  if (now.getTime() - state.dayStartedAt.getTime() >= 24 * 60 * 60 * 1000) {
    state.spentMicrosDay = 0n;
    state.countDay = 0;
    state.dayStartedAt = now;
  }
}

/** In-memory reference implementation used by the Linux-runnable unit tests. */
export async function debitInMemory(
  state: MutableAgentState,
  amountMicros: bigint,
  now = new Date()
): Promise<PolicyResult> {
  if (!validDate(now)) return { ok: false, reasonCode: "INVALID_TIMESTAMP" };
  resetWindows(state, now);
  if (state.killSwitch) return { ok: false, reasonCode: "KILL_SWITCH" };
  if (state.spentMicrosHour + amountMicros > state.hourCapMicros) {
    return { ok: false, reasonCode: "HOUR_AMOUNT_CAP" };
  }
  if (state.spentMicrosDay + amountMicros > state.dayCapMicros) {
    return { ok: false, reasonCode: "DAY_AMOUNT_CAP" };
  }
  if (state.countHour >= state.hourCountCap) return { ok: false, reasonCode: "HOUR_COUNT_CAP" };
  if (state.countDay >= state.dayCountCap) return { ok: false, reasonCode: "DAY_COUNT_CAP" };
  state.spentMicrosHour += amountMicros;
  state.spentMicrosDay += amountMicros;
  state.countHour += 1;
  state.countDay += 1;
  return { ok: true };
}

export interface SqlExecutor {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/**
 * The production debit: cap predicates and counter increments are one SQL
 * conditional update. A zero-row result is a refusal, never a retryable race.
 */
export async function debitAtomically(
  db: SqlExecutor,
  agent: AgentLimits,
  amountMicros: bigint,
  now = new Date()
): Promise<PolicyResult> {
  if (!validDate(now)) return { ok: false, reasonCode: "INVALID_TIMESTAMP" };
  if (amountMicros <= 0n) return { ok: false, reasonCode: "INVALID_AMOUNT" };
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000);
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE agents
    SET
      spent_micros_hour = CASE WHEN window_started_at <= ${hourStart} THEN ${amountMicros} ELSE spent_micros_hour + ${amountMicros} END,
      count_hour = CASE WHEN window_started_at <= ${hourStart} THEN 1 ELSE count_hour + 1 END,
      window_started_at = CASE WHEN window_started_at <= ${hourStart} THEN ${now} ELSE window_started_at END,
      spent_micros_day = CASE WHEN day_started_at <= ${dayStart} THEN ${amountMicros} ELSE spent_micros_day + ${amountMicros} END,
      count_day = CASE WHEN day_started_at <= ${dayStart} THEN 1 ELSE count_day + 1 END,
      day_started_at = CASE WHEN day_started_at <= ${dayStart} THEN ${now} ELSE day_started_at END
    WHERE id = ${agent.id}
      AND kill_switch = false
      AND (CASE WHEN window_started_at <= ${hourStart} THEN ${amountMicros} ELSE spent_micros_hour + ${amountMicros} END) <= hour_cap_micros
      AND (CASE WHEN day_started_at <= ${dayStart} THEN ${amountMicros} ELSE spent_micros_day + ${amountMicros} END) <= day_cap_micros
      AND (CASE WHEN window_started_at <= ${hourStart} THEN 1 ELSE count_hour + 1 END) <= hour_count_cap
      AND (CASE WHEN day_started_at <= ${dayStart} THEN 1 ELSE count_day + 1 END) <= day_count_cap
    RETURNING id
  `;
  if (rows.length > 0) return { ok: true };
  // Identify a useful binding rule without weakening the atomic SQL result.
  if (agent.killSwitch) return { ok: false, reasonCode: "KILL_SWITCH" };
  return { ok: false, reasonCode: "DAY_AMOUNT_CAP" };
}

export function boundedLossMicros(agent: AgentLimits, openWorkOrderCeilings: bigint[]): bigint {
  const registryBound = openWorkOrderCeilings.reduce((sum, ceiling) => sum + ceiling, 0n);
  return agent.dayCapMicros < registryBound ? agent.dayCapMicros : registryBound;
}
