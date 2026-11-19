/**
 * A fake Anthropic API for tests: a `fetch` that returns queued replies and records every
 * request. The real SDK runs on top of it, so the tests exercise its request serialisation,
 * retries, streaming and error classes. Nothing reaches the network.
 */
import { EXTRACTION_MODEL } from "../config";

export type Json = Record<string, unknown>;

export interface CapturedRequest {
  readonly url: string;
  readonly headers: Headers;
  readonly body: Json;
}

type Reply = () => Response;

export interface FakeApi {
  readonly fetch: typeof globalThis.fetch;
  readonly requests: CapturedRequest[];
  /** Queues replies, used in order, one per request (retries included). */
  reply(...replies: Reply[]): void;
}

export function fakeApi(): FakeApi {
  const queue: Reply[] = [];
  const requests: CapturedRequest[] = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      headers: request.headers,
      body: JSON.parse(await request.text()) as Json,
    });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("fake API: no reply queued for this request");
    }
    return next();
  };
  return {
    fetch,
    requests,
    reply(...replies) {
      queue.push(...replies);
    },
  };
}

let requestCounter = 0;

function requestId(): string {
  requestCounter += 1;
  return `req_test_${String(requestCounter)}`;
}

/** Token usage as the API reports it; the defaults are a small, uncached call. */
export function usageJson(overrides: Json = {}): Json {
  return {
    input_tokens: 3000,
    output_tokens: 1200,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: {
      ephemeral_5m_input_tokens: 0,
      ephemeral_1h_input_tokens: 0,
    },
    iterations: null,
    server_tool_use: null,
    service_tier: "standard",
    ...overrides,
  };
}

/** One iteration entry for `usage.iterations`. */
export function iterationJson(
  type: "message" | "fallback_message",
  model: string | null,
  overrides: Json = {},
): Json {
  return {
    type,
    model,
    input_tokens: 2000,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: null,
    ...overrides,
  };
}

export function textBlock(text: string): Json {
  return { type: "text", text, citations: null };
}

export function fallbackBlock(from: string, to: string): Json {
  return {
    type: "fallback",
    from: { model: from },
    to: { model: to },
    trigger: { type: "refusal", category: null },
  };
}

/** A complete message as the API returns it. Content defaults to one text block. */
export function messageJson(
  fields: {
    text?: string;
    content?: Json[];
    stop_reason?: string;
    stop_details?: Json | null;
    model?: string;
    usage?: Json;
  } = {},
): Json {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: fields.model ?? EXTRACTION_MODEL,
    content: fields.content ?? [
      { type: "thinking", thinking: "", signature: "sig_test" },
      textBlock(fields.text ?? "{}"),
    ],
    stop_reason: fields.stop_reason ?? "end_turn",
    stop_sequence: null,
    stop_details: fields.stop_details ?? null,
    container: null,
    context_management: null,
    usage: fields.usage ?? usageJson(),
  };
}

/** A non-streaming reply. */
export function jsonReply(body: Json, status = 200): Reply {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "request-id": requestId(),
      },
    });
}

/**
 * An API error. Retryable statuses carry `retry-after-ms: 1` so the SDK's backoff is short.
 * `message` lets a test put a canary in the API's error text.
 */
export function errorReply(
  status: number,
  type: string,
  message = "fake error",
): Reply {
  return () =>
    new Response(JSON.stringify({ type: "error", error: { type, message } }), {
      status,
      headers: {
        "content-type": "application/json",
        "request-id": requestId(),
        "retry-after-ms": "1",
      },
    });
}

/** A connection failure: `fetch` itself rejects. */
export function networkFailure(): Reply {
  return () => {
    throw new TypeError("fetch failed");
  };
}

function sseEvent(data: Json): string {
  return `event: ${String(data.type)}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * A streamed reply carrying the given message: `message_start`, one start/delta/stop group per
 * content block (text and fallback blocks only), `message_delta` with the stop reason and the
 * final usage, then `message_stop`.
 */
export function sseReply(message: Json): Reply {
  return () => {
    const content = message.content as Json[];
    const usage = message.usage as Json;
    const events: string[] = [
      sseEvent({
        type: "message_start",
        message: {
          ...message,
          content: [],
          stop_reason: null,
          stop_details: null,
          usage: { ...usage, output_tokens: 1 },
        },
      }),
    ];
    content.forEach((block, index) => {
      if (block.type === "text") {
        events.push(
          sseEvent({
            type: "content_block_start",
            index,
            content_block: textBlock(""),
          }),
          sseEvent({
            type: "content_block_delta",
            index,
            delta: { type: "text_delta", text: block.text },
          }),
        );
      } else {
        events.push(
          sseEvent({
            type: "content_block_start",
            index,
            content_block: block,
          }),
        );
      }
      events.push(sseEvent({ type: "content_block_stop", index }));
    });
    events.push(
      sseEvent({
        type: "message_delta",
        delta: {
          stop_reason: message.stop_reason,
          stop_sequence: null,
          stop_details: message.stop_details ?? null,
        },
        usage,
      }),
      sseEvent({ type: "message_stop" }),
    );
    return new Response(events.join(""), {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "request-id": requestId(),
      },
    });
  };
}
