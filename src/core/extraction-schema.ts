/**
 * The extraction schema: what Claude fills in for every supplier document (doc 07), and the
 * checks that turn its strings into values the rest of core can use.
 *
 * There are two passes, as doc 07 describes:
 *
 * 1. `ExtractionResult` is the wire schema. It is sent to the API as the structured-output
 *    JSON schema, so the model can only answer in this shape, and it validates the parsed reply.
 *    Money and quantities are decimal strings exactly as printed, never numbers. Text that
 *    isn't printed is `""`, while missing amounts, quantities and dates are null.
 * 2. `checkExtraction` checks what a JSON schema can't enforce (plain decimals, real calendar
 *    dates, currency codes, page ranges), converts the decimals to `Money`, and turns `""`
 *    text into null, so everything after it sees null for any missing value.
 *
 * Neither pass ever reports a value it was given, only where the problem is and what kind it
 * is: the values are invoice content (CLAUDE.md rule 7).
 */
import { z } from "zod";
import { isDecimalString, parseMoney } from "./money";

/** Saved with every extraction (doc 05). Bump it whenever the wire schema changes. */
export const SCHEMA_VERSION = "s1";

const Dec = z
  .string()
  .describe(
    "Plain decimal as printed: no currency symbol or thousands separator. Negative with a leading '-'. e.g. '1234.50'",
  );
const DateStr = z.string().describe("YYYY-MM-DD");

/**
 * Text as printed, or `""` when it isn't printed. Text isn't nullable on the wire because
 * structured outputs allow at most 16 nullable or union-typed fields in a schema
 * (docs/decisions.md, 2026-11-19); this schema uses 10.
 */
const Text = z.string().describe("As printed; an empty string if not printed");

/** One printed line: an item, or a freight, fee, tax, discount or other line. */
export const ExtractedLine = z.object({
  kind: z.enum(["item", "freight", "fee", "tax", "discount", "other"]),
  description: z.string(),
  supplier_sku: Text,
  qty: Dec.nullable(),
  uom: z
    .string()
    .describe(
      "Unit as printed, e.g. EA, CS, BOX, HR, LB; an empty string if not printed",
    ),
  unit_price: Dec.nullable(),
  amount: Dec,
  po_ref: Text,
});
export type ExtractedLine = z.infer<typeof ExtractedLine>;

/** One document found in the file, with the pages it covers. */
export const ExtractedDocument = z.object({
  doc_type: z.enum([
    "invoice",
    "credit_memo",
    "statement",
    "quote_or_po",
    "receipt",
    "other",
  ]),
  page_from: z.number().int(),
  page_to: z.number().int(),
  quality: z.enum(["clear", "degraded", "unreadable"]),
  vendor: z.object({
    name: Text,
    address: Text,
    email: Text,
    phone: Text,
    tax_id: Text,
  }),
  remit_to: z
    .object({
      name: Text,
      address: Text,
      bank_name: Text,
      // Transient: stored only as an HMAC plus the last 4 digits (doc 09).
      account_number: Text,
      routing_number: Text,
    })
    .nullable(),
  invoice_number: Text,
  invoice_date: DateStr.nullable(),
  due_date: DateStr.nullable(),
  terms: Text,
  po_numbers: z.array(z.string()),
  currency: z.string().describe("ISO 4217, e.g. USD"),
  lines: z.array(ExtractedLine),
  subtotal: Dec.nullable(),
  tax: Dec.nullable(),
  freight: Dec.nullable(),
  other_fees: Dec.nullable(),
  total: Dec.nullable(),
  notes: z
    .array(z.string())
    .describe("Anything relevant that did not fit a field, or any ambiguity"),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocument>;

/** Everything in one file: one entry per distinct document. */
export const ExtractionResult = z.object({
  documents: z.array(ExtractedDocument),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

// ---------------------------------------------------------------------------------------------
// Second pass: formats, decimals to Money, and "" text to null.

/** The codes the second pass reports. Wire-schema problems use zod's own codes. */
export const FORMAT_ISSUE_CODES = [
  "invalid_decimal",
  "invalid_date",
  "invalid_currency",
  "invalid_page_range",
] as const;
export type FormatIssueCode = (typeof FORMAT_ISSUE_CODES)[number];

/** Where a problem is (`documents.0.lines.3.qty`) and what kind it is. Never the value. */
export interface SchemaIssue {
  readonly path: string;
  readonly code: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** True for `YYYY-MM-DD` naming a day that exists: `2028-02-29` yes, `2026-02-29` no. */
export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

const CheckedDecimal = z
  .string()
  .refine(isDecimalString, "invalid_decimal")
  .transform((value) => parseMoney(value));
const CheckedDate = z.string().refine(isCalendarDate, "invalid_date");
/** Text as printed, or null when it wasn't (`""`, or only spaces). */
const CheckedText = z
  .string()
  .transform((value) => (value.trim() === "" ? null : value));

const CheckedLine = ExtractedLine.extend({
  supplier_sku: CheckedText,
  qty: CheckedDecimal.nullable(),
  uom: CheckedText,
  unit_price: CheckedDecimal.nullable(),
  amount: CheckedDecimal,
  po_ref: CheckedText,
});

const CheckedDocument = ExtractedDocument.extend({
  vendor: z.object({
    name: CheckedText,
    address: CheckedText,
    email: CheckedText,
    phone: CheckedText,
    tax_id: CheckedText,
  }),
  remit_to: z
    .object({
      name: CheckedText,
      address: CheckedText,
      bank_name: CheckedText,
      account_number: CheckedText,
      routing_number: CheckedText,
    })
    .nullable(),
  invoice_number: CheckedText,
  terms: CheckedText,
  invoice_date: CheckedDate.nullable(),
  due_date: CheckedDate.nullable(),
  currency: z
    .string()
    .refine((value) => CURRENCY_CODE.test(value), "invalid_currency"),
  lines: z.array(CheckedLine),
  subtotal: CheckedDecimal.nullable(),
  tax: CheckedDecimal.nullable(),
  freight: CheckedDecimal.nullable(),
  other_fees: CheckedDecimal.nullable(),
  total: CheckedDecimal.nullable(),
}).refine(
  (document) =>
    document.page_from >= 1 && document.page_to >= document.page_from,
  { error: "invalid_page_range", path: ["page_from"] },
);

const CheckedExtractionResult = z.object({
  documents: z.array(CheckedDocument),
});

/** An extraction that passed both passes: amounts and quantities are `Money`. */
export type CheckedExtraction = z.output<typeof CheckedExtractionResult>;
export type CheckedDocument = CheckedExtraction["documents"][number];
export type CheckedLine = CheckedDocument["lines"][number];

/**
 * Turns zod issues into `SchemaIssue`s. Zod's messages are dropped: only our own fixed codes
 * (the message of a `custom` issue) are kept, so nothing from the input can get through.
 */
export function toSchemaIssues(
  issues: readonly z.core.$ZodIssue[],
): SchemaIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code === "custom" ? issue.message : issue.code,
  }));
}

/** The result of reading a model reply. `stage` says which pass failed. */
export type ReadExtractionOutcome =
  | {
      readonly ok: true;
      readonly raw: ExtractionResult;
      readonly value: CheckedExtraction;
    }
  | {
      readonly ok: false;
      readonly stage: "shape" | "format";
      readonly issues: SchemaIssue[];
    };

/** The second pass on a reply that already has the wire shape. */
export function checkExtraction(raw: ExtractionResult): ReadExtractionOutcome {
  const checked = CheckedExtractionResult.safeParse(raw);
  if (!checked.success) {
    return {
      ok: false,
      stage: "format",
      issues: toSchemaIssues(checked.error.issues),
    };
  }
  return { ok: true, raw, value: checked.data };
}

/** Both passes on a parsed JSON reply: the wire shape, then formats and `Money`. */
export function readExtraction(json: unknown): ReadExtractionOutcome {
  const shaped = ExtractionResult.safeParse(json);
  if (!shaped.success) {
    return {
      ok: false,
      stage: "shape",
      issues: toSchemaIssues(shaped.error.issues),
    };
  }
  return checkExtraction(shaped.data);
}
