/**
 * Output for `pnpm extract` (scripts/extract.ts): the extraction as JSON, with bank numbers
 * masked unless asked for (CLAUDE.md rule 7), and a summary of each API call made of numbers
 * and enum values only.
 */
import type { ExtractionResult } from "../../core/extraction-schema";
import { sum, toDecimalString, type Money } from "../../core/money";
import type { ModelCall } from "./extract";

/**
 * Keeps only the last 4 characters, the way bank numbers are stored (doc 09): `****6789`.
 * An empty value (nothing printed) stays empty.
 */
export function maskTail(value: string): string {
  if (value.trim() === "") {
    return value;
  }
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

/** The extraction with every remit-to account and routing number masked. */
export function maskBankDetails(result: ExtractionResult): ExtractionResult {
  return {
    documents: result.documents.map((document) =>
      document.remit_to === null
        ? document
        : {
            ...document,
            remit_to: {
              ...document.remit_to,
              account_number: maskTail(document.remit_to.account_number),
              routing_number: maskTail(document.remit_to.routing_number),
            },
          },
    ),
  };
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function formatCall(call: ModelCall, number: number): string[] {
  const model =
    call.fallbackUsed && call.servedBy !== null
      ? `${call.servedBy} (fallback from ${call.requestedModel})`
      : (call.servedBy ?? call.requestedModel);
  const how = call.streamed ? "streamed" : "not streamed";
  const lines = [
    `Call ${String(number)}: ${model}, effort ${call.effort}, ${how}, max_tokens ${count(call.maxTokens)}, stop reason ${call.stopReason ?? "none"}, ${count(call.latencyMs)} ms`,
  ];
  for (const usage of call.usage) {
    lines.push(
      `  ${usage.model} tokens: input ${count(usage.inputTokens)}, cache write ${count(usage.cacheWrite5mTokens + usage.cacheWrite1hTokens)}, cache read ${count(usage.cacheReadTokens)}, output ${count(usage.outputTokens)}`,
    );
  }
  lines.push(
    call.costUsd === null
      ? "  cost: unknown (a model that ran isn't in the price table)"
      : `  cost: $${toDecimalString(call.costUsd)}`,
  );
  if (call.requestId !== null) {
    lines.push(`  request ID: ${call.requestId}`);
  }
  return lines;
}

/** One block per API call, then the total when there was more than one. */
export function formatSummary(calls: readonly ModelCall[]): string {
  const lines = calls.flatMap((call, index) => formatCall(call, index + 1));
  if (calls.length > 1) {
    const known = calls
      .map((call) => call.costUsd)
      .filter((cost): cost is Money => cost !== null);
    const total =
      known.length === calls.length
        ? `$${toDecimalString(sum(known))}`
        : "unknown";
    lines.push(`Total cost of ${String(calls.length)} calls: ${total}`);
  }
  return lines.join("\n");
}
