import { describe, expect, it } from "vitest";
import { describeFailure, type ExtractionFailure } from "./failures";

describe("describeFailure", () => {
  it.each<[ExtractionFailure, string]>([
    [{ reason: "no_api_key" }, "Add ANTHROPIC_API_KEY to your .env file"],
    [{ reason: "unsupported_file", detail: "empty" }, "The file is empty."],
    [
      { reason: "unsupported_file", detail: "unknown_type" },
      "isn't a PDF, PNG, JPEG or WEBP",
    ],
    [
      { reason: "unsupported_file", detail: "too_large" },
      "PDFs can be up to 20 MB and images up to 7.5 MB",
    ],
    [
      { reason: "refusal", category: "cyber", fallbackTried: false },
      "Claude declined to read this document (category: cyber). Re-run it",
    ],
    [
      { reason: "refusal", category: null, fallbackTried: true },
      "declined to read this document, and so did the fallback model.",
    ],
    [
      { reason: "schema_invalid", stage: "json", issues: [] },
      "wasn't valid JSON",
    ],
    [
      {
        reason: "schema_invalid",
        stage: "format",
        issues: [{ path: "documents.0.total", code: "invalid_decimal" }],
      },
      "(documents.0.total: invalid_decimal)",
    ],
    [
      {
        reason: "schema_invalid",
        stage: "shape",
        issues: [{ path: "", code: "invalid_type" }],
      },
      "((the whole reply): invalid_type)",
    ],
    [{ reason: "output_too_long" }, "more lines than one answer can hold"],
    [
      { reason: "unexpected_stop", stopReason: "pause_turn" },
      "(stop reason: pause_turn)",
    ],
    [
      { reason: "rate_limited", status: 429, requestId: "req_1" },
      "rate-limiting this key; it was tried 4 times. Run it again later. Request ID: req_1.",
    ],
    [
      { reason: "overloaded", status: 529, requestId: null },
      "overloaded; it was tried 4 times. Run it again later.",
    ],
    [
      { reason: "invalid_api_key", status: 401, requestId: null },
      "rejected the key (HTTP 401)",
    ],
    [
      { reason: "api_error", status: 400, requestId: "req_2" },
      "returned an error (HTTP 400). Request ID: req_2.",
    ],
    [
      { reason: "api_error", status: null, requestId: null },
      "couldn't be reached",
    ],
  ])("describes %j", (failure, expected) => {
    expect(describeFailure(failure)).toContain(expected);
  });

  it("lists the first three schema issues and counts the rest", () => {
    const issues = ["a", "b", "c", "d", "e"].map((path) => ({
      path: `documents.0.${path}`,
      code: "invalid_type",
    }));
    expect(
      describeFailure({ reason: "schema_invalid", stage: "shape", issues }),
    ).toContain(
      "(documents.0.a: invalid_type; documents.0.b: invalid_type; documents.0.c: invalid_type; and 2 more)",
    );
  });
});
