/**
 * Money and the other decimal amounts that travel with it: quantities, unit prices,
 * percentages and tolerances.
 *
 * Money is never a float (CLAUDE.md rule 3). A `Money` value is a decimal.js decimal created
 * only from a plain decimal string, so it holds exactly the digits that were printed or stored.
 * `add`, `sum`, `subtract` and `multiply` are exact; the only rounding is `roundToCents`, and
 * only where a caller asks for it.
 */
import Decimal from "decimal.js";

/** Digits allowed before the decimal point: what Postgres `numeric(18,4)` holds. */
export const MAX_INTEGER_DIGITS = 14;

/** Digits allowed after the decimal point. Unit prices rarely print more than 5 or 6. */
export const MAX_FRACTION_DIGITS = 10;

/**
 * A private decimal.js constructor, so no other module can change its settings.
 *
 * - `precision` is in significant digits. A parsed value has at most 24, so any sum, and any
 *   product of up to 41 values, stays under 1,000 digits and is never rounded.
 * - `toExpNeg` and `toExpPos` at their limits keep `toString` in plain notation (no `1e-8`).
 */
const Dec = Decimal.clone({
  precision: 1_000,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

declare const moneyBrand: unique symbol;

/**
 * A decimal value made by this module. A raw decimal.js result such as `x.plus(0.1)` is a
 * plain `Decimal`, not `Money`, so it can't flow back into money code without a type error.
 */
export type Money = Decimal & { readonly [moneyBrand]: true };

const PLAIN_DECIMAL = new RegExp(
  `^-?\\d{1,${MAX_INTEGER_DIGITS}}(?:\\.\\d{1,${MAX_FRACTION_DIGITS}})?$`,
);

/** Thrown by `parseMoney`. The message never repeats the input: it may be invoice content. */
export class InvalidMoneyError extends Error {
  override readonly name = "InvalidMoneyError";

  constructor() {
    super(
      `Expected a plain decimal string such as "1234.50" or "-0.5", with at most ` +
        `${MAX_INTEGER_DIGITS} digits before the decimal point and ${MAX_FRACTION_DIGITS} after.`,
    );
  }
}

/** Zero. */
export const ZERO = new Dec(0) as Money;

/** decimal.js keeps a sign on zero (`-0`); money never needs one. */
function toMoney(value: Decimal): Money {
  return value.isZero() ? ZERO : (value as Money);
}

/**
 * True for a plain decimal string: an optional leading `-`, 1 to 14 digits, and optionally a
 * point followed by 1 to 10 digits. This is the format the extraction schema asks the model for
 * (doc 07) and the format Postgres returns `numeric` in.
 *
 * Rejects everything decimal.js itself would accept but money must not: exponents (`1e5`),
 * hex, binary and octal (`0x1f`), `Infinity`, `NaN`, a leading `+`, and surrounding spaces.
 * Thousands separators, currency symbols, `.5` and `5.` are rejected too.
 */
export function isDecimalString(input: unknown): input is string {
  return typeof input === "string" && PLAIN_DECIMAL.test(input);
}

/** Parses a plain decimal string (see `isDecimalString`). Throws `InvalidMoneyError` otherwise. */
export function parseMoney(input: string): Money {
  if (!isDecimalString(input)) {
    throw new InvalidMoneyError();
  }
  return toMoney(new Dec(input));
}

/** a + b, exactly. */
export function add(a: Money, b: Money): Money {
  return toMoney(a.plus(b));
}

/** The exact total of a list; zero for an empty list. */
export function sum(values: readonly Money[]): Money {
  return values.reduce(add, ZERO);
}

/** a − b, exactly. */
export function subtract(a: Money, b: Money): Money {
  return toMoney(a.minus(b));
}

/** a × b, exactly (for example unit price × quantity). */
export function multiply(a: Money, b: Money): Money {
  return toMoney(a.times(b));
}

/** Rounds to 2 decimal places, half to even ("banker's rounding"): 0.125 → 0.12, 0.135 → 0.14. */
export function roundToCents(value: Money): Money {
  return toMoney(value.toDecimalPlaces(2, Dec.ROUND_HALF_EVEN));
}

/**
 * Compares `a` with `b`, treating them as equal when they differ by no more than `tolerance`.
 *
 * Returns 0 when |a − b| ≤ tolerance (the boundary counts as equal), 1 when a is larger by more
 * than the tolerance, and −1 when b is. A zero tolerance gives an exact comparison.
 *
 * - Two-sided checks: "the line amount differs by more than $0.01" is
 *   `compareWithTolerance(computed, printed, cent) !== 0`.
 * - One-sided checks: "variance > allowed + rounding_abs" (doc 08) is
 *   `compareWithTolerance(actual, add(expected, allowed), roundingAbs) === 1`.
 *
 * Throws a `RangeError` if `tolerance` is negative.
 */
export function compareWithTolerance(
  a: Money,
  b: Money,
  tolerance: Money,
): -1 | 0 | 1 {
  if (tolerance.isNegative()) {
    throw new RangeError("The tolerance must not be negative.");
  }
  const difference = a.minus(b);
  if (difference.abs().lte(tolerance)) {
    return 0;
  }
  return difference.isPositive() ? 1 : -1;
}

/**
 * The exact value as a plain decimal string with no trailing zeros: "1234.5", "-0.004", "0".
 * Never exponent notation and never "-0". Use it to store a value or to compare in tests.
 */
export function toDecimalString(value: Money): string {
  return value.toFixed();
}
