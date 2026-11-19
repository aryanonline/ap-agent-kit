import { describe, expect, it } from "vitest";
import { toDecimalString } from "../../core/money";
import { EXTRACTION_MODEL } from "./config";
import { costOf, PRICES_PER_MTOK, type TokenUsage } from "./cost";

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return {
    model: EXTRACTION_MODEL,
    inputTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function cost(entries: TokenUsage[]): string | null {
  const total = costOf(entries);
  return total === null ? null : toDecimalString(total);
}

describe("costOf", () => {
  it.each<[string, Partial<TokenUsage>, string]>([
    // One million of each kind of token costs exactly its list price.
    ["input", { inputTokens: 1_000_000 }, "4"],
    ["5-minute cache writes", { cacheWrite5mTokens: 1_000_000 }, "5"],
    ["1-hour cache writes", { cacheWrite1hTokens: 1_000_000 }, "8"],
    ["cache reads", { cacheReadTokens: 1_000_000 }, "0.2"],
    ["output", { outputTokens: 1_000_000 }, "20"],
    // A typical invoice: 6,000 in, 400 of them cached, 2,000 out.
    [
      "a typical call",
      { inputTokens: 5_600, cacheReadTokens: 400, outputTokens: 2_000 },
      "0.06248",
    ],
    ["a single cache-read token", { cacheReadTokens: 1 }, "0.0000002"],
    ["nothing", {}, "0"],
  ])("prices Opus 5.5 %s exactly", (_name, tokens, expected) => {
    expect(cost([usage(tokens)])).toBe(expected);
  });

  it.each([
    ["claude-opus-5", "5", "6.25", "10", "0.5", "25"],
    ["claude-opus-4-8", "5", "6.25", "10", "0.5", "25"],
  ])(
    "prices the fallback target %s",
    (model, input, write5m, write1h, read, output) => {
      const million = 1_000_000;
      expect(cost([usage({ model, inputTokens: million })])).toBe(input);
      expect(cost([usage({ model, cacheWrite5mTokens: million })])).toBe(
        write5m,
      );
      expect(cost([usage({ model, cacheWrite1hTokens: million })])).toBe(
        write1h,
      );
      expect(cost([usage({ model, cacheReadTokens: million })])).toBe(read);
      expect(cost([usage({ model, outputTokens: million })])).toBe(output);
    },
  );

  it("adds up a call that fell back, each model at its own prices", () => {
    expect(
      cost([
        usage({ inputTokens: 2_000 }),
        usage({
          model: "claude-opus-4-8",
          inputTokens: 2_100,
          outputTokens: 900,
        }),
      ]),
    ).toBe("0.041");
  });

  it("is zero for no usage", () => {
    expect(cost([])).toBe("0");
  });

  it.each(["claude-sonnet-5-5", "constructor", ""])(
    "is null, not a guess, for a model with no price (%j)",
    (model) => {
      expect(cost([usage(), usage({ model, inputTokens: 10 })])).toBeNull();
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects the token count %d",
    (count) => {
      expect(() => costOf([usage({ outputTokens: count })])).toThrow(
        RangeError,
      );
    },
  );

  it("has a price for the extraction model", () => {
    expect(PRICES_PER_MTOK.has(EXTRACTION_MODEL)).toBe(true);
  });
});
