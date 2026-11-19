/**
 * What a call cost, from the token counts the API reports (list prices, no discounts). Money is
 * never a float (CLAUDE.md rule 3): prices are decimal strings and the arithmetic is exact.
 */
import {
  add,
  multiply,
  parseMoney,
  sum,
  ZERO,
  type Money,
} from "../../core/money";

/**
 * Tokens one model used in one call. A call that fell back has one entry per model that ran,
 * because each attempt is billed at its own model's prices.
 */
export interface TokenUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly cacheWrite5mTokens: number;
  readonly cacheWrite1hTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
}

/** USD per million tokens, as printed on the pricing page. */
interface ModelPrices {
  readonly input: string;
  readonly cacheWrite5m: string;
  readonly cacheWrite1h: string;
  readonly cacheRead: string;
  readonly output: string;
}

/**
 * From https://platform.claude.com/docs/en/about-claude/pricing, checked 2026-11-19.
 * Claude Opus 5 and Claude Opus 4.8 are here because they are the fallback targets for a
 * refused request (doc 07).
 */
export const PRICES_PER_MTOK: ReadonlyMap<string, ModelPrices> = new Map([
  [
    "claude-opus-5-5",
    {
      input: "4",
      cacheWrite5m: "5",
      cacheWrite1h: "8",
      cacheRead: "0.20",
      output: "20",
    },
  ],
  [
    "claude-opus-5",
    {
      input: "5",
      cacheWrite5m: "6.25",
      cacheWrite1h: "10",
      cacheRead: "0.50",
      output: "25",
    },
  ],
  [
    "claude-opus-4-8",
    {
      input: "5",
      cacheWrite5m: "6.25",
      cacheWrite1h: "10",
      cacheRead: "0.50",
      output: "25",
    },
  ],
]);

const ONE_MILLIONTH = parseMoney("0.000001");

function tokens(count: number): Money {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("A token count must be a whole number, 0 or more.");
  }
  return parseMoney(String(count));
}

function priced(count: number, perMillion: string): Money {
  return multiply(
    multiply(tokens(count), parseMoney(perMillion)),
    ONE_MILLIONTH,
  );
}

/**
 * The exact cost in USD of the given usage, or null when a model isn't in the price table
 * (an honest "unknown" rather than a guess; CLAUDE.md rule 14).
 */
export function costOf(usage: readonly TokenUsage[]): Money | null {
  let total = ZERO;
  for (const entry of usage) {
    const prices = PRICES_PER_MTOK.get(entry.model);
    if (prices === undefined) {
      return null;
    }
    total = add(
      total,
      sum([
        priced(entry.inputTokens, prices.input),
        priced(entry.cacheWrite5mTokens, prices.cacheWrite5m),
        priced(entry.cacheWrite1hTokens, prices.cacheWrite1h),
        priced(entry.cacheReadTokens, prices.cacheRead),
        priced(entry.outputTokens, prices.output),
      ]),
    );
  }
  return total;
}
