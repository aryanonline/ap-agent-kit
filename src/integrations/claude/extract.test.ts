import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anExtractedDocument,
  anExtractedLine,
  anExtractionResult,
} from "../../core/__tests__/builders";
import { toDecimalString } from "../../core/money";
import {
  errorReply,
  fakeApi,
  fallbackBlock,
  iterationJson,
  jsonReply,
  messageJson,
  networkFailure,
  sseReply,
  textBlock,
  usageJson,
  type Json,
} from "./__tests__/fake-api";
import {
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_RETRY_MAX_TOKENS,
  FALLBACK_BETA,
  MAX_UNION_FIELDS,
} from "./config";
import {
  createExtractor,
  OUTPUT_FORMAT,
  type ExtractionOutcome,
} from "./extract";
import { describeFailure, type ExtractionFailure } from "./failures";
import { MAX_IMAGE_BYTES, type ExtractionInput } from "./input";
import { SYSTEM_PROMPT, USER_INSTRUCTION } from "./prompt";

/** Stands in for invoice content: it must never show up in a failure or a log line. */
const CANARY = "CANARY-41c2-invoice-content";

const PDF_BYTES = new TextEncoder().encode(`%PDF-1.7\n% ${CANARY}\n%%EOF\n`);
const PDF: ExtractionInput = { kind: "pdf", data: PDF_BYTES };
const PDF_BASE64 = Buffer.from(PDF_BYTES).toString("base64");

/** A valid reply that also carries the canary, as real invoice text would. */
const VALID_REPLY = anExtractionResult([
  anExtractedDocument({ notes: [CANARY] }),
]);
const VALID_TEXT = JSON.stringify(VALID_REPLY);

function setup() {
  const api = fakeApi();
  const extractor = createExtractor({ apiKey: "test-key", fetch: api.fetch });
  return { api, extractor };
}

function failureOf(outcome: ExtractionOutcome): ExtractionFailure {
  if (outcome.ok) {
    throw new Error("expected the extraction to fail");
  }
  return outcome.failure;
}

function expectNoContent(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toContain(CANARY);
  expect(text).not.toContain(PDF_BASE64);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the request", () => {
  it("sends the document with the extraction settings and nothing else", async () => {
    const { api, extractor } = setup();
    api.reply(jsonReply(messageJson({ text: VALID_TEXT })));

    await extractor.extract(PDF);

    expect(api.requests).toHaveLength(1);
    const [request] = api.requests;
    expect(request?.url).toContain("/v1/messages");
    // SDK 1.x sends the API key as a bearer token; only the key given is used.
    expect(request?.headers.get("authorization")).toBe("Bearer test-key");
    expect(request?.headers.get("anthropic-beta")).toContain(FALLBACK_BETA);
    expect(request?.body).toEqual({
      model: EXTRACTION_MODEL,
      max_tokens: EXTRACTION_MAX_TOKENS,
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: OUTPUT_FORMAT },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: PDF_BASE64,
              },
            },
            { type: "text", text: USER_INSTRUCTION },
          ],
        },
      ],
    });
  });

  it("sends a JSON schema with no tools, so the model can only fill in the schema", async () => {
    const { api, extractor } = setup();
    api.reply(jsonReply(messageJson({ text: VALID_TEXT })));

    await extractor.extract(PDF);

    const body = api.requests[0]?.body ?? {};
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(OUTPUT_FORMAT.type).toBe("json_schema");
    expect(OUTPUT_FORMAT.schema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["documents"],
    });
  });

  it("stays within the API's limit on nullable and union-typed fields", () => {
    // Counted the way the API's error counts them: `anyOf`, or `type` given as an array.
    function unionFields(node: unknown): number {
      if (Array.isArray(node)) {
        return node.reduce(
          (total: number, item) => total + unionFields(item),
          0,
        );
      }
      if (typeof node !== "object" || node === null) {
        return 0;
      }
      const own = "anyOf" in node || Array.isArray((node as Json).type) ? 1 : 0;
      return Object.values(node).reduce(
        (total: number, value) => total + unionFields(value),
        own,
      );
    }
    expect(unionFields(OUTPUT_FORMAT.schema)).toBe(10);
    expect(unionFields(OUTPUT_FORMAT.schema)).toBeLessThanOrEqual(
      MAX_UNION_FIELDS,
    );
  });

  it.each<{ input: ExtractionInput; block: Json }>([
    {
      input: {
        kind: "image",
        mediaType: "image/png",
        data: new Uint8Array([0x89, 0x50]),
      },
      block: {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "iVA=" },
      },
    },
    {
      input: { kind: "text", text: "Invoice 42" },
      block: {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: "Invoice 42" },
      },
    },
  ])(
    "sends a $input.kind input as its own block type",
    async ({ input, block }) => {
      const { api, extractor } = setup();
      api.reply(jsonReply(messageJson({ text: VALID_TEXT })));

      await extractor.extract(input);

      const messages = api.requests[0]?.body.messages as Json[];
      expect((messages[0]?.content as Json[])[0]).toEqual(block);
    },
  );

  it("uses the effort it is given", async () => {
    const { api, extractor } = setup();
    api.reply(jsonReply(messageJson({ text: VALID_TEXT })));

    await extractor.extract(PDF, { effort: "low" });

    expect(api.requests[0]?.body.output_config).toMatchObject({
      effort: "low",
    });
  });
});

describe("a reply that matches the schema", () => {
  it("returns the extraction with Money values, the raw reply and the call record", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(
        messageJson({
          text: VALID_TEXT,
          usage: usageJson({
            input_tokens: 3000,
            cache_read_input_tokens: 900,
            cache_creation_input_tokens: 0,
            output_tokens: 1200,
          }),
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.raw).toEqual(VALID_REPLY);
    const line = outcome.extraction.documents[0]?.lines[0];
    expect(line?.amount && toDecimalString(line.amount)).toBe("42");
    expect(outcome.calls).toHaveLength(1);
    const [call] = outcome.calls;
    expect(call).toMatchObject({
      requestedModel: EXTRACTION_MODEL,
      servedBy: EXTRACTION_MODEL,
      fallbackUsed: false,
      streamed: false,
      maxTokens: EXTRACTION_MAX_TOKENS,
      effort: "medium",
      promptVersion: "x1",
      schemaVersion: "s1",
      stopReason: "end_turn",
      usage: [
        {
          model: EXTRACTION_MODEL,
          inputTokens: 3000,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          cacheReadTokens: 900,
          outputTokens: 1200,
        },
      ],
    });
    expect(call?.requestId).toMatch(/^req_test_/);
    expect(call?.latencyMs).toBeGreaterThanOrEqual(0);
    // 3,000 × $4 + 900 × $0.20 + 1,200 × $20, per million tokens.
    expect(call?.costUsd && toDecimalString(call.costUsd)).toBe("0.03618");
  });

  it("counts cache writes as 5-minute writes when the API gives no breakdown", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(
        messageJson({
          text: VALID_TEXT,
          usage: usageJson({
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 1000,
            cache_creation: null,
          }),
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.calls[0]?.usage[0]).toMatchObject({
      cacheWrite5mTokens: 1000,
      cacheWrite1hTokens: 0,
    });
    // 1,000 × $5 per million tokens.
    const cost = outcome.calls[0]?.costUsd;
    expect(cost && toDecimalString(cost)).toBe("0.005");
  });
});

describe("a reply that doesn't match the schema", () => {
  const withoutTotal: Json = { ...anExtractedDocument() };
  delete withoutTotal.total;

  it.each<{
    name: string;
    text: string;
    failure: ExtractionFailure;
  }>([
    {
      name: "not JSON",
      text: `{"documents": [${CANARY}`,
      failure: { reason: "schema_invalid", stage: "json", issues: [] },
    },
    {
      name: "empty",
      text: "",
      failure: { reason: "schema_invalid", stage: "json", issues: [] },
    },
    {
      name: "missing a field",
      text: JSON.stringify({
        documents: [{ ...withoutTotal, notes: [CANARY] }],
      }),
      failure: {
        reason: "schema_invalid",
        stage: "shape",
        issues: [{ path: "documents.0.total", code: "invalid_type" }],
      },
    },
    {
      name: "a number for a decimal",
      text: JSON.stringify(
        anExtractionResult([
          anExtractedDocument({
            lines: [{ ...anExtractedLine(), amount: 42 } as never],
          }),
        ]),
      ),
      failure: {
        reason: "schema_invalid",
        stage: "shape",
        issues: [{ path: "documents.0.lines.0.amount", code: "invalid_type" }],
      },
    },
    {
      name: "a decimal with a thousands separator",
      text: JSON.stringify(
        anExtractionResult([anExtractedDocument({ total: "1,234.50" })]),
      ),
      failure: {
        reason: "schema_invalid",
        stage: "format",
        issues: [{ path: "documents.0.total", code: "invalid_decimal" }],
      },
    },
    {
      name: "a US-style date",
      text: JSON.stringify(
        anExtractionResult([
          anExtractedDocument({ invoice_date: "11/18/2026" }),
        ]),
      ),
      failure: {
        reason: "schema_invalid",
        stage: "format",
        issues: [{ path: "documents.0.invoice_date", code: "invalid_date" }],
      },
    },
    {
      name: "a day that doesn't exist",
      text: JSON.stringify(
        anExtractionResult([anExtractedDocument({ due_date: "2026-02-30" })]),
      ),
      failure: {
        reason: "schema_invalid",
        stage: "format",
        issues: [{ path: "documents.0.due_date", code: "invalid_date" }],
      },
    },
  ])(
    "fails with schema_invalid when the reply is $name",
    async ({ text, failure }) => {
      const { api, extractor } = setup();
      api.reply(jsonReply(messageJson({ text })));

      const outcome = await extractor.extract(PDF);

      expect(failureOf(outcome)).toEqual(failure);
      expect(outcome.calls).toHaveLength(1);
      expectNoContent(outcome);
      expect(describeFailure(failureOf(outcome))).not.toContain(CANARY);
    },
  );
});

describe("a refusal", () => {
  it("fails with refusal and the category, without reading the content", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(
        messageJson({
          content: [textBlock(`{"documents": [{"notes": ["${CANARY}`)],
          stop_reason: "refusal",
          stop_details: {
            type: "refusal",
            category: "cyber",
            explanation: `explanation ${CANARY}`,
          },
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({
      reason: "refusal",
      category: "cyber",
      fallbackTried: false,
    });
    expect(outcome.calls[0]?.stopReason).toBe("refusal");
    expectNoContent(outcome);
  });

  it("reports that the fallback model was tried when it declined too", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(
        messageJson({
          model: "claude-opus-4-8",
          content: [fallbackBlock(EXTRACTION_MODEL, "claude-opus-4-8")],
          stop_reason: "refusal",
          stop_details: { type: "refusal", category: null, explanation: null },
          usage: usageJson({
            iterations: [
              iterationJson("message", EXTRACTION_MODEL),
              iterationJson("fallback_message", "claude-opus-4-8"),
            ],
          }),
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({
      reason: "refusal",
      category: null,
      fallbackTried: true,
    });
  });

  it("returns the fallback model's answer, priced per model", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(
        messageJson({
          model: "claude-opus-4-8",
          content: [
            fallbackBlock(EXTRACTION_MODEL, "claude-opus-4-8"),
            textBlock(VALID_TEXT),
          ],
          usage: usageJson({
            iterations: [
              iterationJson("message", null, { input_tokens: 2000 }),
              iterationJson("fallback_message", "claude-opus-4-8", {
                input_tokens: 2100,
                output_tokens: 900,
              }),
            ],
          }),
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.ok).toBe(true);
    const [call] = outcome.calls;
    expect(call).toMatchObject({
      servedBy: "claude-opus-4-8",
      fallbackUsed: true,
      usage: [
        { model: EXTRACTION_MODEL, inputTokens: 2000, outputTokens: 0 },
        { model: "claude-opus-4-8", inputTokens: 2100, outputTokens: 900 },
      ],
    });
    // 2,000 × $4 (Opus 5.5) + 2,100 × $5 + 900 × $25 (Opus 4.8), per million tokens.
    expect(call?.costUsd && toDecimalString(call.costUsd)).toBe("0.041");
  });
});

describe("a reply cut off at max_tokens", () => {
  const truncated = () =>
    jsonReply(
      messageJson({
        text: `{"documents": [{"notes": ["${CANARY}`,
        stop_reason: "max_tokens",
      }),
    );

  it("is retried once, streamed, with the higher limit", async () => {
    const { api, extractor } = setup();
    api.reply(
      truncated(),
      sseReply(messageJson({ content: [textBlock(VALID_TEXT)] })),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.raw).toEqual(VALID_REPLY);
    expect(api.requests).toHaveLength(2);
    expect(api.requests[1]?.body).toMatchObject({
      stream: true,
      max_tokens: EXTRACTION_RETRY_MAX_TOKENS,
    });
    expect(
      outcome.calls.map((call) => [call.streamed, call.stopReason]),
    ).toEqual([
      [false, "max_tokens"],
      [true, "end_turn"],
    ]);
    expect(outcome.calls[1]?.requestId).toMatch(/^req_test_/);
    expect(outcome.calls.every((call) => call.costUsd !== null)).toBe(true);
  });

  it("fails with output_too_long when the retry is cut off too", async () => {
    const { api, extractor } = setup();
    api.reply(
      truncated(),
      sseReply(
        messageJson({
          content: [textBlock(`{"documents": [${CANARY}`)],
          stop_reason: "max_tokens",
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({ reason: "output_too_long" });
    expect(outcome.calls).toHaveLength(2);
    expectNoContent(outcome);
  });

  it("ignores text before a fallback block in the streamed retry", async () => {
    const { api, extractor } = setup();
    api.reply(
      truncated(),
      sseReply(
        messageJson({
          content: [
            textBlock(`{"documents": [{"notes": ["${CANARY}`),
            fallbackBlock(EXTRACTION_MODEL, "claude-opus-4-8"),
            textBlock(VALID_TEXT),
          ],
          usage: usageJson({
            iterations: [
              iterationJson("message", EXTRACTION_MODEL),
              iterationJson("fallback_message", "claude-opus-4-8"),
            ],
          }),
        }),
      ),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.raw).toEqual(VALID_REPLY);
    expect(outcome.calls[1]).toMatchObject({
      servedBy: "claude-opus-4-8",
      fallbackUsed: true,
    });
  });

  it("returns the failure of a retry that errors", async () => {
    const { api, extractor } = setup();
    api.reply(truncated(), errorReply(400, "invalid_request_error"));

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toMatchObject({
      reason: "api_error",
      status: 400,
    });
    expect(outcome.calls).toHaveLength(2);
  });
});

describe("other stop reasons", () => {
  it.each([
    "pause_turn",
    "stop_sequence",
    "tool_use",
    "model_context_window_exceeded",
  ])("fail with unexpected_stop for %s", async (stopReason) => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(messageJson({ text: VALID_TEXT, stop_reason: stopReason })),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({
      reason: "unexpected_stop",
      stopReason,
    });
  });
});

describe("API errors", () => {
  it.each<{
    name: string;
    replies: (() => Response)[];
    failure: Partial<ExtractionFailure>;
  }>([
    {
      name: "429 four times",
      replies: Array.from({ length: 4 }, () =>
        errorReply(429, "rate_limit_error", CANARY),
      ),
      failure: { reason: "rate_limited", status: 429 },
    },
    {
      name: "529 four times",
      replies: Array.from({ length: 4 }, () =>
        errorReply(529, "overloaded_error", CANARY),
      ),
      failure: { reason: "overloaded", status: 529 },
    },
    {
      name: "500 four times",
      replies: Array.from({ length: 4 }, () =>
        errorReply(500, "api_error", CANARY),
      ),
      failure: { reason: "api_error", status: 500 },
    },
    {
      name: "401",
      replies: [errorReply(401, "authentication_error", CANARY)],
      failure: { reason: "invalid_api_key", status: 401 },
    },
    {
      name: "403",
      replies: [errorReply(403, "permission_error", CANARY)],
      failure: { reason: "invalid_api_key", status: 403 },
    },
    {
      name: "400",
      replies: [errorReply(400, "invalid_request_error", CANARY)],
      failure: { reason: "api_error", status: 400 },
    },
  ])(
    "$name → $failure.reason after $replies.length request(s)",
    async ({ replies, failure }) => {
      const { api, extractor } = setup();
      api.reply(...replies);

      const outcome = await extractor.extract(PDF);

      expect(api.requests).toHaveLength(replies.length);
      expect(failureOf(outcome)).toMatchObject(failure);
      expect(failureOf(outcome)).toHaveProperty(
        "requestId",
        expect.stringMatching(/^req_test_/),
      );
      expect(outcome.calls).toHaveLength(1);
      expect(outcome.calls[0]).toMatchObject({ stopReason: null, usage: [] });
      expectNoContent(outcome);
      expect(describeFailure(failureOf(outcome))).not.toContain(CANARY);
    },
  );

  it("succeeds when a retry after 429 or 529 gets through", async () => {
    const { api, extractor } = setup();
    api.reply(
      errorReply(429, "rate_limit_error"),
      errorReply(529, "overloaded_error"),
      jsonReply(messageJson({ text: VALID_TEXT })),
    );

    const outcome = await extractor.extract(PDF);

    expect(outcome.ok).toBe(true);
    expect(api.requests).toHaveLength(3);
  });

  it("fails with api_error and no status when the API can't be reached", async () => {
    vi.useFakeTimers();
    const { api, extractor } = setup();
    api.reply(...Array.from({ length: 4 }, networkFailure));

    const pending = extractor.extract(PDF);
    await vi.runAllTimersAsync();
    const outcome = await pending;

    expect(api.requests).toHaveLength(4);
    expect(failureOf(outcome)).toEqual({
      reason: "api_error",
      status: null,
      requestId: null,
    });
  });

  it("fails with api_error when a reply body isn't JSON, dropping the parser's message", async () => {
    const { api, extractor } = setup();
    api.reply(
      () =>
        new Response(`<html>proxy error ${CANARY}</html>`, {
          headers: { "content-type": "application/json" },
        }),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({
      reason: "api_error",
      status: null,
      requestId: null,
    });
    expectNoContent(outcome);
  });

  it("fails with api_error when the streamed retry ends without a message", async () => {
    const { api, extractor } = setup();
    api.reply(
      jsonReply(messageJson({ text: "{", stop_reason: "max_tokens" })),
      () =>
        new Response("", { headers: { "content-type": "text/event-stream" } }),
    );

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({
      reason: "api_error",
      status: null,
      requestId: null,
    });
    expect(outcome.calls.map((call) => call.streamed)).toEqual([false, true]);
  });
});

describe("nothing is sent", () => {
  it.each([undefined, "", "   "])("without an API key (%j)", async (apiKey) => {
    const api = fakeApi();
    const extractor = createExtractor({ apiKey, fetch: api.fetch });

    const outcome = await extractor.extract(PDF);

    expect(failureOf(outcome)).toEqual({ reason: "no_api_key" });
    expect(outcome.calls).toEqual([]);
    expect(api.requests).toHaveLength(0);
  });

  it.each<{ name: string; input: ExtractionInput; detail: string }>([
    {
      name: "an empty PDF",
      input: { kind: "pdf", data: new Uint8Array() },
      detail: "empty",
    },
    {
      name: "an image over the limit",
      input: {
        kind: "image",
        mediaType: "image/jpeg",
        data: new Uint8Array(MAX_IMAGE_BYTES + 1),
      },
      detail: "too_large",
    },
    {
      name: "blank text",
      input: { kind: "text", text: " \n " },
      detail: "empty",
    },
  ])("for $name", async ({ input, detail }) => {
    const { api, extractor } = setup();

    const outcome = await extractor.extract(input);

    expect(failureOf(outcome)).toEqual({ reason: "unsupported_file", detail });
    expect(api.requests).toHaveLength(0);
  });
});

describe("logging", () => {
  /** Everything written to the console or to stdout/stderr while `run` runs. */
  async function captureOutput(run: () => Promise<unknown>): Promise<string> {
    const written: unknown[] = [];
    const capture = (...args: unknown[]) => {
      written.push(...args);
    };
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation(capture);
    }
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(chunk);
      return true;
    });
    try {
      await run();
    } finally {
      vi.restoreAllMocks();
    }
    return written
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }

  it("the SDK logs request bodies at ANTHROPIC_LOG=debug unless its log level is pinned (control)", async () => {
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    const api = fakeApi();
    api.reply(jsonReply(messageJson({ text: VALID_TEXT })));
    const unpinned = new Anthropic({ apiKey: "test-key", fetch: api.fetch });

    const output = await captureOutput(() =>
      unpinned.beta.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 10,
        messages: [{ role: "user", content: CANARY }],
      }),
    );

    expect(output).toContain(CANARY);
  });

  it("writes no document content anywhere, even with ANTHROPIC_LOG=debug", async () => {
    vi.stubEnv("ANTHROPIC_LOG", "debug");
    const { api, extractor } = setup();
    api.reply(
      errorReply(429, "rate_limit_error", CANARY),
      jsonReply(messageJson({ text: VALID_TEXT, stop_reason: "max_tokens" })),
      sseReply(messageJson({ content: [textBlock(VALID_TEXT)] })),
      jsonReply(
        messageJson({
          text: JSON.stringify(
            anExtractionResult([anExtractedDocument({ total: CANARY })]),
          ),
        }),
      ),
    );

    const output = await captureOutput(async () => {
      expect((await extractor.extract(PDF)).ok).toBe(true);
      expect((await extractor.extract(PDF)).ok).toBe(false);
    });

    expect(output).not.toContain(CANARY);
    expect(output).not.toContain(PDF_BASE64);
  });
});
