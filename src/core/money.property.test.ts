/**
 * Property tests for money.ts (doc 08, "Tests"): every operation is checked against an
 * independent BigInt model, plus the rounding and tolerance properties doc 08 asks for.
 * A failure prints a seed and a minimal counterexample; rerun with that seed to reproduce it.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  exactAbs,
  exactAdd,
  exactCompare,
  exactFromString,
  exactMultiply,
  exactRoundHalfEven,
  exactSubtract,
  exactToString,
  formatDecimal,
  isPlainDecimalReference,
} from "./__tests__/decimal-reference";
import {
  amountString,
  candidateString,
  decimalString,
} from "./__tests__/money-arbitraries";
import {
  add,
  compareWithTolerance,
  InvalidMoneyError,
  isDecimalString,
  MAX_FRACTION_DIGITS,
  MAX_INTEGER_DIGITS,
  multiply,
  parseMoney,
  roundToCents,
  subtract,
  sum,
  toDecimalString,
  ZERO,
  type Money,
} from "./money";

const RUNS = { numRuns: 1000 };
const m = parseMoney;
const text = toDecimalString;
const exact = exactFromString;
const negate = (value: Money) => subtract(ZERO, value);

describe("parsing", () => {
  it("keeps every digit of any accepted string", () => {
    fc.assert(
      fc.property(decimalString(), (input) => {
        expect(text(m(input))).toBe(exactToString(exact(input)));
      }),
      RUNS,
    );
  });

  it("accepts exactly what the hand-written grammar accepts, and throws for the rest", () => {
    fc.assert(
      fc.property(candidateString, (input) => {
        const valid = isPlainDecimalReference(
          input,
          MAX_INTEGER_DIGITS,
          MAX_FRACTION_DIGITS,
        );
        expect(isDecimalString(input)).toBe(valid);
        if (!valid) expect(() => m(input)).toThrow(InvalidMoneyError);
      }),
      { numRuns: 5000 },
    );
  });
});

describe("arithmetic is exact", () => {
  it("add", () => {
    fc.assert(
      fc.property(decimalString(), decimalString(), (a, b) => {
        expect(text(add(m(a), m(b)))).toBe(
          exactToString(exactAdd(exact(a), exact(b))),
        );
      }),
      RUNS,
    );
  });

  it("subtract", () => {
    fc.assert(
      fc.property(decimalString(), decimalString(), (a, b) => {
        expect(text(subtract(m(a), m(b)))).toBe(
          exactToString(exactSubtract(exact(a), exact(b))),
        );
      }),
      RUNS,
    );
  });

  it("multiply", () => {
    fc.assert(
      fc.property(decimalString(), decimalString(), (a, b) => {
        expect(text(multiply(m(a), m(b)))).toBe(
          exactToString(exactMultiply(exact(a), exact(b))),
        );
      }),
      RUNS,
    );
  });

  it("multiply, chained over four full-length factors", () => {
    fc.assert(
      fc.property(
        fc.array(decimalString(), { minLength: 4, maxLength: 4 }),
        (factors) => {
          const product = factors.map(m).reduce(multiply);
          const expected = factors.map(exact).reduce(exactMultiply);
          expect(text(product)).toBe(exactToString(expected));
        },
      ),
      RUNS,
    );
  });

  it("sum, over any list", () => {
    fc.assert(
      fc.property(fc.array(decimalString(), { maxLength: 50 }), (values) => {
        const expected = values
          .map(exact)
          .reduce(exactAdd, { units: 0n, scale: 0 });
        expect(text(sum(values.map(m)))).toBe(exactToString(expected));
      }),
      RUNS,
    );
  });

  it("never yields negative zero", () => {
    fc.assert(
      fc.property(decimalString(), (a) => {
        expect(text(subtract(m(a), m(a)))).toBe("0");
        expect(text(multiply(m(a), ZERO))).toBe("0");
      }),
      RUNS,
    );
  });
});

describe("roundToCents", () => {
  it("rounds half to even, as the exact model does", () => {
    fc.assert(
      fc.property(decimalString(), (input) => {
        expect(text(roundToCents(m(input)))).toBe(
          exactToString(exactRoundHalfEven(exact(input), 2)),
        );
      }),
      RUNS,
    );
  });

  it("is symmetric: round(−x) = −round(x)", () => {
    fc.assert(
      fc.property(decimalString(), (input) => {
        const x = m(input);
        expect(text(roundToCents(negate(x)))).toBe(
          text(negate(roundToCents(x))),
        );
      }),
      RUNS,
    );
  });

  it("is idempotent and leaves at most two decimals", () => {
    fc.assert(
      fc.property(decimalString(), (input) => {
        const once = roundToCents(m(input));
        expect(text(roundToCents(once))).toBe(text(once));
        expect(once.decimalPlaces()).toBeLessThanOrEqual(2);
      }),
      RUNS,
    );
  });

  it("moves a value by at most half a cent", () => {
    const halfCent = exact("0.005");
    fc.assert(
      fc.property(decimalString(), (input) => {
        const moved = exactSubtract(
          exact(text(roundToCents(m(input)))),
          exact(input),
        );
        expect(exactCompare(exactAbs(moved), halfCent)).toBeLessThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it("is monotonic", () => {
    fc.assert(
      fc.property(decimalString(), decimalString(), (a, b) => {
        const [low, high] =
          exactCompare(exact(a), exact(b)) <= 0 ? [a, b] : [b, a];
        const order = compareWithTolerance(
          roundToCents(m(low)),
          roundToCents(m(high)),
          ZERO,
        );
        expect(order).toBeLessThanOrEqual(0);
      }),
      RUNS,
    );
  });

  it("sends an exact half-cent tie to the even cent", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }),
        (cents) => {
          // (cents + 0.5) cents, e.g. 1.005 or -0.125
          const tie = formatDecimal(cents * 10n + (cents < 0n ? -5n : 5n), 3);
          const rounded = exact(text(roundToCents(m(tie)))); // at most 2 decimals
          const roundedCents = rounded.units * 10n ** BigInt(2 - rounded.scale);
          expect(roundedCents % 2n).toBe(0n);
        },
      ),
      RUNS,
    );
  });
});

describe("compareWithTolerance", () => {
  /** A tolerance and a difference, both with `scale` decimals, as unit counts. */
  const toleranceAndDifference = (within: boolean) =>
    fc.integer({ min: 0, max: 4 }).chain((scale) =>
      fc.bigInt({ min: 0n, max: 10n ** 9n }).chain((toleranceUnits) =>
        (within
          ? fc.bigInt({ min: -toleranceUnits, max: toleranceUnits })
          : fc
              .tuple(fc.bigInt({ min: 1n, max: 10n ** 9n }), fc.boolean())
              .map(
                ([excess, negative]) =>
                  (negative ? -1n : 1n) * (toleranceUnits + excess),
              )
        ).map((differenceUnits) => ({
          tolerance: formatDecimal(toleranceUnits, scale),
          difference: formatDecimal(differenceUnits, scale),
        })),
      ),
    );

  it("matches an exact comparison of |a − b| with the tolerance", () => {
    fc.assert(
      fc.property(
        amountString,
        amountString,
        decimalString({ nonNegative: true }),
        (a, b, t) => {
          const difference = exactSubtract(exact(a), exact(b));
          const within = exactCompare(exactAbs(difference), exact(t)) <= 0;
          const expected = within
            ? 0
            : exactCompare(difference, { units: 0n, scale: 0 });
          expect(compareWithTolerance(m(a), m(b), m(t))).toBe(expected);
        },
      ),
      RUNS,
    );
  });

  it("never flags a difference within the tolerance", () => {
    fc.assert(
      fc.property(
        amountString,
        toleranceAndDifference(true),
        (a, { tolerance, difference }) => {
          expect(
            compareWithTolerance(add(m(a), m(difference)), m(a), m(tolerance)),
          ).toBe(0);
        },
      ),
      RUNS,
    );
  });

  it("always flags a difference beyond the tolerance, with its sign", () => {
    fc.assert(
      fc.property(
        amountString,
        toleranceAndDifference(false),
        (a, { tolerance, difference }) => {
          const expected = difference.startsWith("-") ? -1 : 1;
          expect(
            compareWithTolerance(add(m(a), m(difference)), m(a), m(tolerance)),
          ).toBe(expected);
        },
      ),
      RUNS,
    );
  });

  it("is antisymmetric and unchanged by shifting both sides", () => {
    fc.assert(
      fc.property(
        amountString,
        amountString,
        amountString,
        decimalString({ maxIntegerDigits: 6, nonNegative: true }),
        (a, b, shift, t) => {
          const result = compareWithTolerance(m(a), m(b), m(t));
          expect(compareWithTolerance(m(b), m(a), m(t))).toBe(-result || 0);
          expect(
            compareWithTolerance(
              add(m(a), m(shift)),
              add(m(b), m(shift)),
              m(t),
            ),
          ).toBe(result);
        },
      ),
      RUNS,
    );
  });

  it("with zero tolerance, is an exact comparison", () => {
    fc.assert(
      fc.property(decimalString(), decimalString(), (a, b) => {
        expect(compareWithTolerance(m(a), m(b), ZERO)).toBe(
          exactCompare(exact(a), exact(b)),
        );
      }),
      RUNS,
    );
  });
});
