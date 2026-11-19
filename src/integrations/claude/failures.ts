/**
 * Why an extraction failed, as typed values. A failure never carries document content or the
 * model's output: only enum values, schema paths, HTTP statuses and request IDs (CLAUDE.md
 * rule 7). The pipeline (P2-1) saves the `reason` on the document as `extraction_failed`.
 */
import type { SchemaIssue } from "../../core/extraction-schema";
import { API_MAX_RETRIES } from "./config";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES } from "./input";

export type UnsupportedFileDetail = "empty" | "unknown_type" | "too_large";

export type ExtractionFailure =
  /** No `ANTHROPIC_API_KEY`: nothing was sent (E3-2 AC5). */
  | { readonly reason: "no_api_key" }
  /** Not a PDF, PNG, JPEG or WEBP, or over the size limit: nothing was sent. */
  | {
      readonly reason: "unsupported_file";
      readonly detail: UnsupportedFileDetail;
    }
  /**
   * `stop_reason: "refusal"`, after any server-side fallback. `category` is the API's
   * `stop_details.category`, informational only and sometimes null.
   */
  | {
      readonly reason: "refusal";
      readonly category: string | null;
      readonly fallbackTried: boolean;
    }
  /**
   * The reply wasn't JSON (`json`), didn't have the schema's shape (`shape`), or had values in
   * the wrong format (`format`). `issues` holds schema paths and codes, never values.
   */
  | {
      readonly reason: "schema_invalid";
      readonly stage: "json" | "shape" | "format";
      readonly issues: readonly SchemaIssue[];
    }
  /** `stop_reason: "max_tokens"` again on the streamed retry with the higher limit. */
  | { readonly reason: "output_too_long" }
  /** Any other stop reason. `stopReason` is the API's enum value. */
  | { readonly reason: "unexpected_stop"; readonly stopReason: string }
  /**
   * The API call failed: 429 or 529 after every retry, a rejected key (401, 403), or any other
   * HTTP or network error (`status` is null when there was no HTTP response).
   */
  | {
      readonly reason:
        "rate_limited" | "overloaded" | "invalid_api_key" | "api_error";
      readonly status: number | null;
      readonly requestId: string | null;
    };

export type ExtractionFailureReason = ExtractionFailure["reason"];

const MAX_LISTED_ISSUES = 3;

function megabytes(bytes: number): string {
  return `${String(Math.round((bytes / 1_000_000) * 10) / 10)} MB`;
}

function issueList(issues: readonly SchemaIssue[]): string {
  const listed = issues
    .slice(0, MAX_LISTED_ISSUES)
    .map(
      ({ path, code }) =>
        `${path === "" ? "(the whole reply)" : path}: ${code}`,
    )
    .join("; ");
  const more = issues.length - MAX_LISTED_ISSUES;
  return more > 0 ? `${listed}; and ${String(more)} more` : listed;
}

function describeUnsupported(detail: UnsupportedFileDetail): string {
  switch (detail) {
    case "empty":
      return "The file is empty.";
    case "unknown_type":
      return "The file isn't a PDF, PNG, JPEG or WEBP, so it wasn't read.";
    case "too_large":
      return `The file is too large: PDFs can be up to ${megabytes(MAX_PDF_BYTES)} and images up to ${megabytes(MAX_IMAGE_BYTES)}.`;
  }
}

function requestIdSuffix(requestId: string | null): string {
  return requestId === null ? "" : ` Request ID: ${requestId}.`;
}

/**
 * The failure as a plain sentence for a person: what happened and what to do. Built only from
 * the failure's fields, so it can't contain document content.
 */
export function describeFailure(failure: ExtractionFailure): string {
  const tries = API_MAX_RETRIES + 1;
  switch (failure.reason) {
    case "no_api_key":
      return "No Anthropic API key is set, so the document wasn't read. Add ANTHROPIC_API_KEY to your .env file (see .env.example) and run it again.";
    case "unsupported_file":
      return describeUnsupported(failure.detail);
    case "refusal": {
      const category =
        failure.category === null ? "" : ` (category: ${failure.category})`;
      const fallback = failure.fallbackTried
        ? ", and so did the fallback model"
        : "";
      return `Claude declined to read this document${category}${fallback}. Re-run it, or enter the invoice by hand.`;
    }
    case "schema_invalid":
      if (failure.stage === "json") {
        return "Claude's answer wasn't valid JSON, so nothing was saved. Re-run the extraction.";
      }
      return `Claude's answer didn't match the extraction schema, so nothing was saved (${issueList(failure.issues)}). Re-run the extraction.`;
    case "output_too_long":
      return "The document has more lines than one answer can hold, even after a retry with a higher limit.";
    case "unexpected_stop":
      return `Claude stopped before finishing (stop reason: ${failure.stopReason}). Re-run the extraction.`;
    case "rate_limited":
      return `The Anthropic API is rate-limiting this key; it was tried ${String(tries)} times. Run it again later.${requestIdSuffix(failure.requestId)}`;
    case "overloaded":
      return `The Anthropic API is overloaded; it was tried ${String(tries)} times. Run it again later.${requestIdSuffix(failure.requestId)}`;
    case "invalid_api_key":
      return `The Anthropic API rejected the key (HTTP ${String(failure.status)}). Check ANTHROPIC_API_KEY in your .env file.${requestIdSuffix(failure.requestId)}`;
    case "api_error":
      return failure.status === null
        ? "The Anthropic API couldn't be reached. Check your connection and run it again."
        : `The Anthropic API returned an error (HTTP ${String(failure.status)}).${requestIdSuffix(failure.requestId)}`;
  }
}
