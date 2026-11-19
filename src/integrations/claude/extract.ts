/**
 * The extraction client (doc 07): one Claude call that turns a supplier document into the
 * extraction schema.
 *
 * - Structured outputs constrain the reply to `ExtractionResult`. The call has no tools, so text
 *   inside a document can't make the model do anything but fill in the schema (CLAUDE.md rule 1).
 * - `stop_reason` is checked before anything is read. The reply is then parsed and checked
 *   here, not by the SDK's `messages.parse`, which parses first and puts parser messages (which
 *   can quote the reply) into its errors (docs/decisions.md, 2026-11-19).
 * - A refusal is retried on a fallback model server-side (`fallbacks: "default"`).
 * - A `max_tokens` stop is retried once, streamed, with a higher limit.
 *
 * This module never logs. It returns the extraction or a typed failure, plus a record of every
 * API call made (tokens, cost, latency) for the `extractions` table (doc 05).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type {
  BetaCacheCreation,
  BetaContentBlockParam,
  BetaJSONOutputFormat,
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages";
import {
  ExtractionResult,
  readExtraction,
  SCHEMA_VERSION,
  type CheckedExtraction,
} from "../../core/extraction-schema";
import { ZERO, type Money } from "../../core/money";
import {
  API_MAX_RETRIES,
  EXTRACTION_EFFORT,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_MODEL,
  EXTRACTION_RETRY_MAX_TOKENS,
  FALLBACK_BETA,
  type ExtractionEffort,
} from "./config";
import { costOf, type TokenUsage } from "./cost";
import type { ExtractionFailure } from "./failures";
import { checkInput, type ExtractionInput } from "./input";
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_INSTRUCTION } from "./prompt";

/**
 * The structured-output format: the wire schema through the SDK's strict-schema transform.
 * Only `schema` is kept, so the SDK never tries to parse a reply itself.
 */
export const OUTPUT_FORMAT: BetaJSONOutputFormat = {
  type: "json_schema",
  schema: betaZodOutputFormat(ExtractionResult).schema,
};

/** One API call, as the `extractions` table records it (doc 05). No content. */
export interface ModelCall {
  readonly requestedModel: string;
  /** The model that produced the reply; a fallback model if the requested one declined. */
  readonly servedBy: string | null;
  readonly fallbackUsed: boolean;
  readonly streamed: boolean;
  readonly maxTokens: number;
  readonly effort: ExtractionEffort;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  /** Null when the call failed without a reply. */
  readonly stopReason: string | null;
  readonly usage: readonly TokenUsage[];
  /** Exact USD; null when a model that ran isn't in the price table. */
  readonly costUsd: Money | null;
  readonly latencyMs: number;
  readonly requestId: string | null;
}

export type ExtractionOutcome =
  | {
      readonly ok: true;
      /** Amounts and quantities as `Money`, for core. */
      readonly extraction: CheckedExtraction;
      /** The reply as the model gave it (strings as printed): `extractions.raw_output`. */
      readonly raw: ExtractionResult;
      readonly calls: readonly ModelCall[];
    }
  | {
      readonly ok: false;
      readonly failure: ExtractionFailure;
      /** Calls that were made before it failed; they are billed. */
      readonly calls: readonly ModelCall[];
    };

export interface ExtractorOptions {
  /** `ANTHROPIC_API_KEY`. Missing or blank: every extraction fails with `no_api_key`. */
  readonly apiKey: string | undefined;
  /** Replaces the network. Tests pass a fake API here. */
  readonly fetch?: typeof globalThis.fetch;
}

export interface ExtractOptions {
  readonly effort?: ExtractionEffort;
}

export interface Extractor {
  extract(
    input: ExtractionInput,
    options?: ExtractOptions,
  ): Promise<ExtractionOutcome>;
}

export function createExtractor(options: ExtractorOptions): Extractor {
  const apiKey = options.apiKey?.trim() ?? "";
  const client =
    apiKey === ""
      ? null
      : new Anthropic({
          apiKey,
          // Only the key passed in authenticates: no ANTHROPIC_AUTH_TOKEN or `ant` profile.
          authToken: null,
          maxRetries: API_MAX_RETRIES,
          // Pinned, so ANTHROPIC_LOG=debug can't make the SDK log request and response
          // bodies: the document and the extraction (CLAUDE.md rule 7).
          logLevel: "warn",
          ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        });

  return {
    async extract(input, extractOptions = {}) {
      const problem = checkInput(input);
      if (problem) {
        return { ok: false, failure: problem, calls: [] };
      }
      if (client === null) {
        return { ok: false, failure: { reason: "no_api_key" }, calls: [] };
      }
      return runExtraction(
        client,
        input,
        extractOptions.effort ?? EXTRACTION_EFFORT,
      );
    },
  };
}

async function runExtraction(
  client: Anthropic,
  input: ExtractionInput,
  effort: ExtractionEffort,
): Promise<ExtractionOutcome> {
  const calls: ModelCall[] = [];

  const first = await send(
    client,
    buildParams(input, effort, EXTRACTION_MAX_TOKENS),
    {
      streamed: false,
      effort,
    },
  );
  calls.push(first.call);
  if (!first.ok) {
    return { ok: false, failure: first.failure, calls };
  }

  let message = first.message;
  if (message.stop_reason === "max_tokens") {
    // Long enough to need streaming: a non-streaming request this large can time out.
    const retry = await send(
      client,
      buildParams(input, effort, EXTRACTION_RETRY_MAX_TOKENS),
      { streamed: true, effort },
    );
    calls.push(retry.call);
    if (!retry.ok) {
      return { ok: false, failure: retry.failure, calls };
    }
    message = retry.message;
    if (message.stop_reason === "max_tokens") {
      return { ok: false, failure: { reason: "output_too_long" }, calls };
    }
  }

  const reply = readReply(message);
  return reply.ok
    ? { ok: true, extraction: reply.value, raw: reply.raw, calls }
    : { ok: false, failure: reply.failure, calls };
}

export function buildParams(
  input: ExtractionInput,
  effort: ExtractionEffort,
  maxTokens: number,
): MessageCreateParamsNonStreaming {
  return {
    model: EXTRACTION_MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    // Explicit, so a fallback model (where omitting it can mean no thinking) thinks too.
    thinking: { type: "adaptive" },
    output_config: { effort, format: OUTPUT_FORMAT },
    // The same for every call, so it is cached; the document comes after the breakpoint.
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
          documentBlock(input),
          { type: "text", text: USER_INSTRUCTION },
        ],
      },
    ],
  };
}

function toBase64(data: Uint8Array): string {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
    "base64",
  );
}

function documentBlock(input: ExtractionInput): BetaContentBlockParam {
  switch (input.kind) {
    case "pdf":
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: toBase64(input.data),
        },
      };
    case "image":
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: input.mediaType,
          data: toBase64(input.data),
        },
      };
    case "text":
      return {
        type: "document",
        source: { type: "text", media_type: "text/plain", data: input.text },
      };
  }
}

type SendResult =
  | {
      readonly ok: true;
      readonly message: BetaMessage;
      readonly call: ModelCall;
    }
  | {
      readonly ok: false;
      readonly failure: ExtractionFailure;
      readonly call: ModelCall;
    };

async function send(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
  { streamed, effort }: { streamed: boolean; effort: ExtractionEffort },
): Promise<SendResult> {
  const started = performance.now();
  const record = (fields: {
    message: BetaMessage | null;
    requestId: string | null;
  }): ModelCall => {
    const usage = fields.message
      ? toTokenUsage(fields.message, params.model)
      : [];
    return {
      requestedModel: params.model,
      servedBy: fields.message?.model ?? null,
      fallbackUsed: fields.message ? fallbackServed(fields.message) : false,
      streamed,
      maxTokens: params.max_tokens,
      effort,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      stopReason: fields.message?.stop_reason ?? null,
      usage,
      // A call that failed without a reply has no usage, and isn't billed.
      costUsd: fields.message ? costOf(usage) : ZERO,
      latencyMs: Math.round(performance.now() - started),
      requestId: fields.requestId,
    };
  };

  // Only the SDK call is caught: an error in our own code below it still throws.
  let message: BetaMessage;
  let requestId: string | null;
  try {
    if (streamed) {
      const stream = client.beta.messages.stream(params);
      message = await stream.finalMessage();
      requestId = stream.request_id ?? null;
    } else {
      const response = await client.beta.messages.create(params).withResponse();
      message = response.data;
      requestId = response.request_id ?? null;
    }
  } catch (error) {
    const failure = toApiFailure(error);
    return {
      ok: false,
      failure,
      call: record({ message: null, requestId: failure.requestId }),
    };
  }
  return { ok: true, message, call: record({ message, requestId }) };
}

type ApiFailure = Extract<ExtractionFailure, { status: number | null }>;

/**
 * Maps whatever the SDK call threw to a failure, keeping only the HTTP status and the request
 * ID. Error messages are dropped: they are the API's text, or a parser's, which can quote what
 * it was parsing.
 */
function toApiFailure(error: unknown): ApiFailure {
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : null;
    const requestId = error.requestID ?? null;
    if (error instanceof Anthropic.RateLimitError) {
      return { reason: "rate_limited", status, requestId };
    }
    if (status === 529) {
      return { reason: "overloaded", status, requestId };
    }
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError
    ) {
      return { reason: "invalid_api_key", status, requestId };
    }
    return { reason: "api_error", status, requestId };
  }
  // Anything else from the SDK: a stream that ended without a message (AnthropicError), or a
  // reply body that isn't JSON (a SyntaxError that quotes the body).
  return { reason: "api_error", status: null, requestId: null };
}

/** The token fields shared by `usage` and each entry of `usage.iterations`. */
interface UsageFields {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number | null;
  readonly cache_creation_input_tokens: number | null;
  readonly cache_creation: BetaCacheCreation | null;
}

function tokenUsage(model: string, usage: UsageFields): TokenUsage {
  const cacheWrites = usage.cache_creation_input_tokens ?? 0;
  return {
    model,
    inputTokens: usage.input_tokens,
    // Without the TTL breakdown, every cache write is a 5-minute one (the only TTL we use).
    cacheWrite5mTokens:
      usage.cache_creation?.ephemeral_5m_input_tokens ?? cacheWrites,
    cacheWrite1hTokens: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    outputTokens: usage.output_tokens,
  };
}

/**
 * One entry per model that ran. With a fallback, `usage.iterations` is the per-attempt record
 * (the top-level `usage` covers only the attempt that produced the reply).
 */
function toTokenUsage(
  message: BetaMessage,
  requestedModel: string,
): TokenUsage[] {
  const entries: TokenUsage[] = [];
  for (const iteration of message.usage.iterations ?? []) {
    if (iteration.type === "message") {
      // A declined hop: the requested model, when the API leaves the model out.
      entries.push(tokenUsage(iteration.model ?? requestedModel, iteration));
    } else if (iteration.type === "fallback_message") {
      entries.push(tokenUsage(iteration.model, iteration));
    }
  }
  return entries.length > 0
    ? entries
    : [tokenUsage(message.model, message.usage)];
}

function fallbackServed(message: BetaMessage): boolean {
  return (message.usage.iterations ?? []).some(
    (iteration) => iteration.type === "fallback_message",
  );
}

function fallbackTried(message: BetaMessage): boolean {
  return (
    fallbackServed(message) ||
    message.content.some((block) => block.type === "fallback")
  );
}

/**
 * The reply's text. A streamed reply that fell back mid-output keeps the declined model's
 * partial text before the last `fallback` block, so only text after it counts.
 */
function replyText(message: BetaMessage): string {
  const lastFallback = message.content.findLastIndex(
    (block) => block.type === "fallback",
  );
  return message.content
    .slice(lastFallback + 1)
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}

type ReplyOutcome =
  | {
      readonly ok: true;
      readonly raw: ExtractionResult;
      readonly value: CheckedExtraction;
    }
  | { readonly ok: false; readonly failure: ExtractionFailure };

/** Checks `stop_reason` first, then parses and checks the reply. */
export function readReply(message: BetaMessage): ReplyOutcome {
  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      failure: {
        reason: "refusal",
        category: message.stop_details?.category ?? null,
        fallbackTried: fallbackTried(message),
      },
    };
  }
  if (message.stop_reason !== "end_turn") {
    return {
      ok: false,
      failure: {
        reason: "unexpected_stop",
        stopReason: message.stop_reason ?? "none",
      },
    };
  }

  let json: unknown;
  try {
    json = JSON.parse(replyText(message));
  } catch {
    // The parser's message can quote the reply, so it is dropped.
    return {
      ok: false,
      failure: { reason: "schema_invalid", stage: "json", issues: [] },
    };
  }
  const read = readExtraction(json);
  if (!read.ok) {
    return {
      ok: false,
      failure: {
        reason: "schema_invalid",
        stage: read.stage,
        issues: read.issues,
      },
    };
  }
  return { ok: true, raw: read.raw, value: read.value };
}
