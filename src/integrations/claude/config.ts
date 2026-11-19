/**
 * Settings for the extraction call (doc 07). Changing the model, the effort, the prompt or the
 * schema needs a `pnpm eval` run, with the results pasted into the PR (CLAUDE.md rule 9).
 */

/** The only place the extraction model is named (CLAUDE.md rule 9). */
export const EXTRACTION_MODEL = "claude-opus-5-5";

/** Effort levels the API accepts on this model, lowest first. */
export const EXTRACTION_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ExtractionEffort = (typeof EXTRACTION_EFFORTS)[number];

/**
 * Opus 5.5's own default, set explicitly. Doc 07 runs the eval at `low` and `medium` and keeps
 * the cheapest level that holds accuracy; that comparison arrives with P0-4.
 */
export const EXTRACTION_EFFORT: ExtractionEffort = "medium";

/** Output limit for the first attempt, thinking included (doc 07). */
export const EXTRACTION_MAX_TOKENS = 16_000;

/** Output limit for the one streamed retry after a `max_tokens` stop (doc 07). */
export const EXTRACTION_RETRY_MAX_TOKENS = 64_000;

/**
 * Retries after the first try: 4 tries in all for 429 and 529 (doc 07), with the SDK's
 * exponential backoff, which honours `retry-after`. The SDK also retries 408, 409, other 5xx
 * responses and connection errors.
 */
export const API_MAX_RETRIES = 3;

/**
 * Structured outputs reject a schema with more than 16 nullable or union-typed fields
 * ("too many parameters with union types", HTTP 400; docs/decisions.md, 2026-11-19). A test
 * holds the extraction schema under it.
 */
export const MAX_UNION_FIELDS = 16;

/** Beta header for server-side refusal fallbacks (`fallbacks: "default"`). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
