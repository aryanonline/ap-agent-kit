/**
 * An independent, exact model of plain decimal strings, used as the oracle for the property
 * tests of src/core/money.ts. It works on BigInt only, so it shares no code with decimal.js.
 */

/** value = units / 10^scale */
export interface ExactDecimal {
  readonly units: bigint;
  readonly scale: number;
}

const DIGITS = "0123456789";

function isDigit(char: string): boolean {
  return char.length === 1 && DIGITS.includes(char);
}

/** The plain-decimal grammar, written out by hand to check the regex in money.ts. */
export function isPlainDecimalReference(
  input: string,
  maxIntegerDigits: number,
  maxFractionDigits: number,
): boolean {
  let i = input.startsWith("-") ? 1 : 0;
  const integerStart = i;
  while (i < input.length && isDigit(input.charAt(i))) i++;
  const integerDigits = i - integerStart;
  if (integerDigits < 1 || integerDigits > maxIntegerDigits) return false;
  if (i === input.length) return true;
  if (input.charAt(i) !== ".") return false;
  i++;
  const fractionStart = i;
  while (i < input.length && isDigit(input.charAt(i))) i++;
  const fractionDigits = i - fractionStart;
  return (
    i === input.length &&
    fractionDigits >= 1 &&
    fractionDigits <= maxFractionDigits
  );
}

/** Writes `units / 10^scale` as a plain decimal string with exactly `scale` decimals. */
export function formatDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  const body =
    scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${body}` : body;
}

/** Reads a string that `isPlainDecimalReference` accepts. */
export function exactFromString(input: string): ExactDecimal {
  const negative = input.startsWith("-");
  const body = negative ? input.slice(1) : input;
  const point = body.indexOf(".");
  const integerPart = point === -1 ? body : body.slice(0, point);
  const fractionPart = point === -1 ? "" : body.slice(point + 1);
  const magnitude = BigInt(integerPart + fractionPart);
  return {
    units: negative ? -magnitude : magnitude,
    scale: fractionPart.length,
  };
}

/** Canonical form, as money.ts's toDecimalString writes it: no trailing zeros, no "-0". */
export function exactToString({ units, scale }: ExactDecimal): string {
  if (units === 0n) return "0";
  let magnitude = units < 0n ? -units : units;
  let places = scale;
  while (places > 0 && magnitude % 10n === 0n) {
    magnitude /= 10n;
    places--;
  }
  return formatDecimal(units < 0n ? -magnitude : magnitude, places);
}

function align(a: ExactDecimal, b: ExactDecimal): [bigint, bigint, number] {
  const scale = Math.max(a.scale, b.scale);
  return [
    a.units * 10n ** BigInt(scale - a.scale),
    b.units * 10n ** BigInt(scale - b.scale),
    scale,
  ];
}

export function exactAdd(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function exactSubtract(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const [x, y, scale] = align(a, b);
  return { units: x - y, scale };
}

export function exactMultiply(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

export function exactCompare(a: ExactDecimal, b: ExactDecimal): -1 | 0 | 1 {
  const [x, y] = align(a, b);
  if (x === y) return 0;
  return x > y ? 1 : -1;
}

export function exactAbs(a: ExactDecimal): ExactDecimal {
  return a.units < 0n ? { units: -a.units, scale: a.scale } : a;
}

/** Rounds to `places` decimals, half to even, on the magnitude (so it's symmetric). */
export function exactRoundHalfEven(
  value: ExactDecimal,
  places: number,
): ExactDecimal {
  if (value.scale <= places) return value;
  const divisor = 10n ** BigInt(value.scale - places);
  const negative = value.units < 0n;
  const magnitude = negative ? -value.units : value.units;
  let quotient = magnitude / divisor;
  const twiceRemainder = (magnitude % divisor) * 2n;
  if (
    twiceRemainder > divisor ||
    (twiceRemainder === divisor && quotient % 2n === 1n)
  ) {
    quotient += 1n;
  }
  return { units: negative ? -quotient : quotient, scale: places };
}
