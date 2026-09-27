import type { GonkaRequest, GonkaResult } from "./gonka.ts";
import { CANDIDATES, runGonka } from "./gonka.ts";
import type { ChannelRead } from "./fool-it.ts";
import { sandboxChannelRequests } from "./fool-it.ts";
import { artifactDecisionSchema, payerRecordDecisionSchema } from "./prompts.ts";

function unavailable(model: string): ChannelRead {
  return { ok: false, model, latencyMs: 0, errorCode: "INFERENCE_UNAVAILABLE" };
}

/**
 * The same two model calls a live payment makes. The payer call never receives the bill.
 * `gonka` defaults to the live reader; tests pass their own.
 */
export async function readSandboxChannels(
  input: { billText: string; receivedAt: string },
  gonka: (request: GonkaRequest) => Promise<GonkaResult> = runGonka
): Promise<{ artifact: ChannelRead; payer: ChannelRead }> {
  const messages = sandboxChannelRequests(input);
  const [artifactRun, payerRun] = await Promise.allSettled([
    gonka({ channel: "artifact", messages: messages.artifact, schema: artifactDecisionSchema }),
    gonka({ channel: "payer_record", messages: messages.payer, schema: payerRecordDecisionSchema })
  ]);
  return {
    artifact: artifactRun.status === "fulfilled" ? artifactRun.value : unavailable(CANDIDATES.artifact[0]),
    payer: payerRun.status === "fulfilled" ? payerRun.value : unavailable(CANDIDATES.payer_record[0])
  };
}
