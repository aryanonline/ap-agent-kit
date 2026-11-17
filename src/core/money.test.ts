import { describe, expect, it } from "vitest";
import {
  add,
  compareWithTolerance,
  InvalidMoneyError,
  isDecimalString,
  multiply,
  parseMoney,
  roundToCents,
  subtract,
  sum,
  toDecimalString,
  ZERO,
} from "./money";

const m = parseMoney;
const text = toDecimalString;

function thrownBy(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("expected the call to throw an Error");
}

describe("parseMoney", () => {
  it.each([
    ["0", "0"],
    ["-0", "0"],
    ["-0.00", "0"],
    ["1234.50", "1234.5"],
    ["0.50", "0.5"],
    ["007.50", "7.5"],
    ["-12.345", "-12.345"],
    ["99999999999999.9999", "99999999999999.9999"], // the largest numeric(18,4)
    ["12345678901234", "12345678901234"], // 14 digits before the point
    ["0.0000000001", "0.0000000001"], // 10 after it, and no exponent notation
    ["-1.1234567890", "-1.123456789"],
  ])("accepts %j as %s", (input, expected) => {
    expect(isDecimalString(input)).toBe(true);
    expect(text(m(input))).toBe(expected);
  });

  it.each([
    "",
    " ",
    " 1",
    "1 ",
    "1\n",
    "+1",
    "--1",
    "-",
    ".",
    "1.",
    ".5",
    "1.2.3",
    "1,000",
    "1_000",
    "$1",
    "1e5",
    "1E5",
    "0x1f",
    "0b1",
    "0o7",
    "Infinity",
    "-Infinity",
    "NaN",
    "١٢٣", // Arabic-Indic digits
    "−1", // Unicode minus sign
    "123456789012345", // 15 digits before the point
    "1.12345678901", // 11 after it
  ])("rejects %j", (input) => {
    expect(isDecimalString(input)).toBe(false);
    expect(() => m(input)).toThrow(InvalidMoneyError);
  });

  it("rejects non-strings at runtime", () => {
    const inputs: unknown[] = [1.5, 0, null, undefined, {}, 10n];
    for (const input of inputs) {
      expect(isDecimalString(input)).toBe(false);
      expect(() => m(input as string)).toThrow(InvalidMoneyError);
    }
  });

  it("never repeats the input in its error, because the input may be invoice content", () => {
    const error = thrownBy(() => m("Remit to account 12345678"));
    expect(error).toBeInstanceOf(InvalidMoneyError);
    expect(error.name).toBe("InvalidMoneyError");
    expect(error.message).not.toContain("12345678");
    expect(error.message).toContain('"1234.50"');
  });
});

describe("add, sum, subtract and multiply", () => {
  it("are exact where floats are not", () => {
    expect(text(add(m("0.1"), m("0.2")))).toBe("0.3"); // float: 0.30000000000000004
    expect(text(multiply(m("1.1"), m("1.1")))).toBe("1.21"); // float: 1.2100000000000002
    expect(text(subtract(m("1"), m("0.9")))).toBe("0.1"); // float: 0.09999999999999998
  });

  it("never return negative zero", () => {
    expect(text(add(m("-5"), m("5")))).toBe("0");
    expect(text(subtract(m("-2.5"), m("-2.5")))).toBe("0");
    expect(text(multiply(m("-3"), ZERO))).toBe("0");
  });

  it("sum an empty list to zero and a list exactly", () => {
    expect(text(sum([]))).toBe("0");
    expect(text(sum([m("600.00"), m("604.50"), m("-0.25")]))).toBe("1204.25");
  });

  it("reproduce the dollar amounts in doc 08's messages", () => {
    // price_variance: "Unit price $14.20 vs PO 4471 $12.90 (+10.1%). +$65.00 on 50 units."
    const units = m("50");
    const variance = subtract(
      multiply(m("14.20"), units),
      multiply(m("12.90"), units),
    );
    expect(text(variance)).toBe("65");
    // qty_over_po: "20 extra = $258.00" at $12.90
    expect(text(multiply(subtract(m("60"), m("40")), m("12.90")))).toBe("258");
    // arithmetic_mismatch: "Lines add up to $1,204.50, but the subtotal says $1,240.50 ($36.00 off)."
    const lines = sum([m("1000.00"), m("204.50")]);
    expect(text(lines)).toBe("1204.5");
    expect(text(subtract(m("1240.50"), lines))).toBe("36");
  });

  it("keep every digit of very large and very small products, in plain notation", () => {
    expect(text(multiply(m("99999999999999"), m("99999999999999")))).toBe(
      "9999999999999800000000000001",
    );
    expect(text(multiply(m("0.0000000001"), m("0.0000000001")))).toBe(
      "0.00000000000000000001",
    );
  });
});

describe("roundToCents", () => {
  it.each([
    ["1.005", "1"], // a tie: 100.5 cents goes to the even 100 (floats can't even represent 1.005)
    ["1.015", "1.02"], // 101.5 → 102
    ["1.025", "1.02"], // 102.5 → 102
    ["2.675", "2.68"], // 267.5 → 268 (float toFixed(2) gives "2.67")
    ["0.125", "0.12"],
    ["0.135", "0.14"],
    ["-0.125", "-0.12"],
    ["-0.135", "-0.14"],
    ["0.0050000001", "0.01"], // just above the tie
    ["0.0049999999", "0"], // just below it
    ["-0.004", "0"], // no negative zero
    ["12.34", "12.34"],
    ["7", "7"],
  ])("rounds %s to %s", (input, expected) => {
    expect(text(roundToCents(m(input)))).toBe(expected);
  });
});

describe("compareWithTolerance", () => {
  it.each([
    ["100.00", "100.01", "0.01", 0], // the boundary counts as equal
    ["100.01", "100.00", "0.01", 0],
    ["100.00", "100.02", "0.01", -1],
    ["100.02", "100.00", "0.01", 1],
    ["5", "5", "0", 0],
    ["5.0001", "5", "0", 1], // zero tolerance is an exact comparison
    ["-5", "5", "9.99", -1],
    ["-5", "5", "10", 0],
  ] as const)(
    "compares %s with %s within %s as %i",
    (a, b, tolerance, expected) => {
      expect(compareWithTolerance(m(a), m(b), m(tolerance))).toBe(expected);
    },
  );

  it("expresses doc 08's one-sided price check: variance > allowed + rounding_abs", () => {
    const expected = multiply(m("12.90"), m("50")); // 645.00
    const allowed = m("12.90"); // min(2% of 645.00, $25.00)
    const roundingAbs = m("0.05");
    const flagged = (actual: string) =>
      compareWithTolerance(m(actual), add(expected, allowed), roundingAbs) ===
      1;
    expect(flagged("710.00")).toBe(true); // $14.20 × 50: +$65.00
    expect(flagged("657.95")).toBe(false); // exactly allowed + rounding_abs over
    expect(flagged("657.96")).toBe(true);
  });

  it("refuses a negative tolerance", () => {
    expect(() => compareWithTolerance(m("1"), m("1"), m("-0.01"))).toThrow(
      RangeError,
    );
  });
});

describe("Money", () => {
  it("exports zero", () => {
    expect(text(ZERO)).toBe("0");
  });

  it("keeps raw decimal.js results out at compile time", () => {
    const one = m("1");
    // @ts-expect-error: `one.plus(0.1)` is a plain Decimal, not Money, so add() refuses it.
    expect(text(add(one.plus(0.1), one))).toBe("2.1");
  });
});
