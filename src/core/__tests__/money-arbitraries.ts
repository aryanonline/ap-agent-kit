import fc from "fast-check";
import { MAX_FRACTION_DIGITS, MAX_INTEGER_DIGITS } from "../money";
import { formatDecimal } from "./decimal-reference";

interface DecimalOptions {
  readonly maxIntegerDigits?: number;
  readonly maxFractionDigits?: number;
  readonly nonNegative?: boolean;
}

/**
 * Plain decimal strings such as "-1234.50" or "0.0001". Trailing zeros are kept as generated,
 * and fast-check biases the digits toward small values and boundaries.
 */
export function decimalString(
  options: DecimalOptions = {},
): fc.Arbitrary<string> {
  const maxIntegerDigits = options.maxIntegerDigits ?? MAX_INTEGER_DIGITS;
  const maxFractionDigits = options.maxFractionDigits ?? MAX_FRACTION_DIGITS;
  return fc.integer({ min: 0, max: maxFractionDigits }).chain((scale) => {
    const limit = 10n ** BigInt(maxIntegerDigits + scale) - 1n;
    return fc
      .bigInt({ min: options.nonNegative === true ? 0n : -limit, max: limit })
      .map((units) => formatDecimal(units, scale));
  });
}

/** Amounts in the range real invoices use: up to 9 integer digits and 4 decimals. */
export const amountString = decimalString({
  maxIntegerDigits: 9,
  maxFractionDigits: 4,
});

/** Inputs near the plain-decimal grammar: valid strings, strings with one bad character, noise. */
const NEAR_MISS_CHARACTERS = [
  "-",
  ".",
  "+",
  "e",
  "E",
  "x",
  " ",
  ",",
  "_",
  "$",
  "\n",
  "١",
  "−",
];

export const candidateString: fc.Arbitrary<string> = fc.oneof(
  decimalString(),
  decimalString({
    maxIntegerDigits: MAX_INTEGER_DIGITS + 2,
    maxFractionDigits: MAX_FRACTION_DIGITS + 2,
  }),
  decimalString().chain((valid) =>
    fc
      .tuple(
        fc.nat({ max: valid.length }),
        fc.constantFrom(...NEAR_MISS_CHARACTERS),
      )
      .map(
        ([at, character]) => valid.slice(0, at) + character + valid.slice(at),
      ),
  ),
  fc.string({
    unit: fc.constantFrom("0", "1", "5", "9", ...NEAR_MISS_CHARACTERS),
    maxLength: 30,
  }),
);
