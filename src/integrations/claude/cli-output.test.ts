import { describe, expect, it } from "vitest";
import {
  anExtractedDocument,
  anExtractionResult,
} from "../../core/__tests__/builders";
import { parseMoney } from "../../core/money";
import { formatSummary, maskBankDetails, maskTail } from "./cli-output";
import { EXTRACTION_MODEL } from "./config";
import type { ModelCall } from "./extract";

function aCall(overrides: Partial<ModelCall> = {}): ModelCall {
  return {
    requestedModel: EXTRACTION_MODEL,
    servedBy: EXTRACTION_MODEL,
    fallbackUsed: false,
    streamed: false,
    maxTokens: 16_000,
    effort: "medium",
    promptVersion: "x1",
    schemaVersion: "s1",
    stopReason: "end_turn",
    usage: [
      {
        model: EXTRACTION_MODEL,
        inputTokens: 5_600,
        cacheWrite5mTokens: 300,
        cacheWrite1hTokens: 0,
        cacheReadTokens: 400,
        outputTokens: 2_000,
      },
    ],
    costUsd: parseMoney("0.06248"),
    latencyMs: 8_250,
    requestId: "req_1",
    ...overrides,
  };
}

describe("maskTail", () => {
  it.each([
    ["000123456789", "****6789"],
    ["12345", "****2345"],
    ["1234", "****"],
    // Nothing printed: there is nothing to hide, and "****" would suggest there was.
    ["", ""],
    ["  ", "  "],
  ])("%j → %j", (value, expected) => {
    expect(maskTail(value)).toBe(expected);
  });
});

describe("maskBankDetails", () => {
  it("masks account and routing numbers and keeps everything else", () => {
    const withBank = anExtractedDocument({
      remit_to: {
        name: "Acme Fasteners Inc.",
        address: "PO Box 9",
        bank_name: "First Example Bank",
        account_number: "000123456789",
        routing_number: "123456780",
      },
    });
    const withoutBank = anExtractedDocument({ invoice_number: "INV-2" });
    const masked = maskBankDetails(anExtractionResult([withBank, withoutBank]));

    expect(masked.documents[0]?.remit_to).toEqual({
      name: "Acme Fasteners Inc.",
      address: "PO Box 9",
      bank_name: "First Example Bank",
      account_number: "****6789",
      routing_number: "****6780",
    });
    expect(masked.documents[1]).toEqual(withoutBank);
    expect(JSON.stringify(masked)).not.toContain("000123456789");
  });
});

describe("formatSummary", () => {
  it("shows the model, tokens, cost and request ID of one call", () => {
    expect(formatSummary([aCall()])).toBe(
      [
        "Call 1: claude-opus-5-5, effort medium, not streamed, max_tokens 16,000, stop reason end_turn, 8,250 ms",
        "  claude-opus-5-5 tokens: input 5,600, cache write 300, cache read 400, output 2,000",
        "  cost: $0.06248",
        "  request ID: req_1",
      ].join("\n"),
    );
  });

  it("shows a fallback, a streamed retry and the total of several calls", () => {
    const summary = formatSummary([
      aCall({ stopReason: "max_tokens", costUsd: parseMoney("0.3") }),
      aCall({
        servedBy: "claude-opus-4-8",
        fallbackUsed: true,
        streamed: true,
        maxTokens: 64_000,
        requestId: null,
        costUsd: parseMoney("0.45"),
      }),
    ]);
    expect(summary).toContain(
      "Call 2: claude-opus-4-8 (fallback from claude-opus-5-5), effort medium, streamed, max_tokens 64,000",
    );
    expect(summary).toContain("Total cost of 2 calls: $0.75");
    expect(summary.match(/request ID/g)).toHaveLength(1);
  });

  it("says when a cost is unknown, and for a call with no reply", () => {
    const summary = formatSummary([
      aCall({ costUsd: null }),
      aCall({ servedBy: null, stopReason: null, usage: [] }),
    ]);
    expect(summary).toContain("cost: unknown");
    expect(summary).toContain("Call 2: claude-opus-5-5, effort medium");
    expect(summary).toContain("stop reason none");
    expect(summary).toContain("Total cost of 2 calls: unknown");
  });
});
