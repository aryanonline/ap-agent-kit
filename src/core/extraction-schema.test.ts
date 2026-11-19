import { describe, expect, it } from "vitest";
import {
  anExtractedDocument,
  anExtractedLine,
  anExtractionResult,
} from "./__tests__/builders";
import {
  ExtractionResult,
  isCalendarDate,
  readExtraction,
  type SchemaIssue,
} from "./extraction-schema";
import { toDecimalString } from "./money";

const CANARY = "CANARY-7f3a-not-for-logs";

/** The issues of a failed read, or a test failure if the read succeeded. */
function issuesOf(json: unknown): {
  stage: string;
  issues: SchemaIssue[];
} {
  const outcome = readExtraction(json);
  if (outcome.ok) {
    throw new Error("expected the read to fail");
  }
  return { stage: outcome.stage, issues: outcome.issues };
}

describe("readExtraction: a valid reply", () => {
  it("keeps the raw reply and converts decimals to Money", () => {
    const raw = anExtractionResult([
      anExtractedDocument({
        lines: [
          anExtractedLine(),
          anExtractedLine({
            kind: "freight",
            qty: null,
            unit_price: null,
            amount: "-12.5",
          }),
        ],
      }),
    ]);
    const outcome = readExtraction(raw);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.raw).toEqual(raw);
    const [document] = outcome.value.documents;
    const [item, freight] = document?.lines ?? [];
    expect(item?.qty && toDecimalString(item.qty)).toBe("100");
    expect(item?.unit_price && toDecimalString(item.unit_price)).toBe("0.42");
    expect(freight?.qty).toBeNull();
    expect(freight?.amount && toDecimalString(freight.amount)).toBe("-12.5");
    expect(document?.total && toDecimalString(document.total)).toBe("45.47");
    expect(document?.invoice_date).toBe("2026-11-02");
  });

  it("accepts a file with no documents, multi-page ranges and a remit-to block", () => {
    expect(readExtraction(anExtractionResult([])).ok).toBe(true);
    const multiPage = anExtractedDocument({
      page_from: 2,
      page_to: 4,
      remit_to: {
        name: "Acme Fasteners Inc.",
        address: "",
        bank_name: "First Example Bank",
        account_number: "000123456789",
        routing_number: "123456780",
      },
    });
    expect(readExtraction(anExtractionResult([multiPage])).ok).toBe(true);
  });

  it('turns text that wasn\'t printed ("") into null, and keeps printed text as printed', () => {
    const raw = anExtractionResult([
      anExtractedDocument({
        vendor: {
          name: " Acme Fasteners Inc. ",
          address: "",
          email: "billing@acme-fasteners.example.com",
          phone: "   ",
          tax_id: "",
        },
        remit_to: {
          name: "Acme Fasteners Inc.",
          address: "",
          bank_name: "",
          account_number: "000123456789",
          routing_number: "",
        },
        invoice_number: "",
        terms: "",
        lines: [anExtractedLine({ supplier_sku: "", uom: "", po_ref: "PO-1" })],
      }),
    ]);
    const outcome = readExtraction(raw);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.raw).toEqual(raw);
    const [document] = outcome.value.documents;
    expect(document?.vendor).toEqual({
      name: " Acme Fasteners Inc. ",
      address: null,
      email: "billing@acme-fasteners.example.com",
      phone: null,
      tax_id: null,
    });
    expect(document?.remit_to).toEqual({
      name: "Acme Fasteners Inc.",
      address: null,
      bank_name: null,
      account_number: "000123456789",
      routing_number: null,
    });
    expect(document?.invoice_number).toBeNull();
    expect(document?.terms).toBeNull();
    expect(document?.lines[0]).toMatchObject({
      supplier_sku: null,
      uom: null,
      po_ref: "PO-1",
    });
  });
});

describe("readExtraction: wire shape (first pass)", () => {
  const withoutTotal: Record<string, unknown> = { ...anExtractedDocument() };
  delete withoutTotal.total;

  it.each<{ name: string; json: unknown; issue: SchemaIssue }>([
    {
      name: "not an object",
      json: null,
      issue: { path: "", code: "invalid_type" },
    },
    {
      name: "a missing field",
      json: { documents: [withoutTotal] },
      issue: { path: "documents.0.total", code: "invalid_type" },
    },
    {
      name: "a number where a decimal string belongs",
      json: anExtractionResult([
        anExtractedDocument({
          lines: [{ ...anExtractedLine(), amount: 42 } as never],
        }),
      ]),
      issue: { path: "documents.0.lines.0.amount", code: "invalid_type" },
    },
    {
      name: "an unknown document type",
      json: anExtractionResult([
        anExtractedDocument({ doc_type: "bill" as never }),
      ]),
      issue: { path: "documents.0.doc_type", code: "invalid_value" },
    },
    {
      name: "a fractional page number",
      json: anExtractionResult([anExtractedDocument({ page_to: 1.5 })]),
      issue: { path: "documents.0.page_to", code: "invalid_type" },
    },
    {
      name: 'null for text (text that isn\'t printed is "")',
      json: anExtractionResult([
        anExtractedDocument({
          lines: [anExtractedLine({ supplier_sku: null as never })],
        }),
      ]),
      issue: { path: "documents.0.lines.0.supplier_sku", code: "invalid_type" },
    },
  ])("rejects $name", ({ json, issue }) => {
    expect(issuesOf(json)).toEqual({ stage: "shape", issues: [issue] });
  });
});

describe("readExtraction: formats (second pass)", () => {
  it.each([
    "1,234.50",
    "$12.00",
    "1e5",
    ".5",
    "12.",
    "+1",
    " 12.00",
    "12 ",
    "",
    "NaN",
  ])("rejects the amount %j", (amount) => {
    const json = anExtractionResult([
      anExtractedDocument({ lines: [anExtractedLine({ amount })] }),
    ]);
    expect(issuesOf(json)).toEqual({
      stage: "format",
      issues: [{ path: "documents.0.lines.0.amount", code: "invalid_decimal" }],
    });
  });

  it.each([
    ["qty", "documents.0.lines.0.qty"],
    ["unit_price", "documents.0.lines.0.unit_price"],
  ] as const)("checks the line's %s", (field, path) => {
    const json = anExtractionResult([
      anExtractedDocument({ lines: [anExtractedLine({ [field]: "1 234" })] }),
    ]);
    expect(issuesOf(json).issues).toEqual([{ path, code: "invalid_decimal" }]);
  });

  it.each(["subtotal", "tax", "freight", "other_fees", "total"] as const)(
    "checks the document's %s",
    (field) => {
      const json = anExtractionResult([
        anExtractedDocument({ [field]: "USD 10" }),
      ]);
      expect(issuesOf(json).issues).toEqual([
        { path: `documents.0.${field}`, code: "invalid_decimal" },
      ]);
    },
  );

  it.each([
    "11/18/2026",
    "2026-02-30",
    "2026-13-01",
    "2026-1-5",
    "18 Nov 2026",
  ])("rejects the invoice date %j", (invoice_date) => {
    const json = anExtractionResult([anExtractedDocument({ invoice_date })]);
    expect(issuesOf(json).issues).toEqual([
      { path: "documents.0.invoice_date", code: "invalid_date" },
    ]);
  });

  it("checks the due date", () => {
    const json = anExtractionResult([
      anExtractedDocument({ due_date: "2026-04-31" }),
    ]);
    expect(issuesOf(json).issues).toEqual([
      { path: "documents.0.due_date", code: "invalid_date" },
    ]);
  });

  it.each(["usd", "US", "USDX", "", "$"])(
    "rejects the currency %j",
    (currency) => {
      const json = anExtractionResult([anExtractedDocument({ currency })]);
      expect(issuesOf(json).issues).toEqual([
        { path: "documents.0.currency", code: "invalid_currency" },
      ]);
    },
  );

  it.each([
    [0, 1],
    [2, 1],
    [-1, 3],
  ])("rejects pages %i to %i", (page_from, page_to) => {
    const json = anExtractionResult([
      anExtractedDocument({ page_from, page_to }),
    ]);
    expect(issuesOf(json).issues).toEqual([
      { path: "documents.0.page_from", code: "invalid_page_range" },
    ]);
  });

  it("reports every problem, each with its own path", () => {
    const json = anExtractionResult([
      anExtractedDocument(),
      anExtractedDocument({
        page_from: 3,
        page_to: 2,
        currency: "usd",
        lines: [anExtractedLine(), anExtractedLine({ qty: "two" })],
      }),
    ]);
    expect(issuesOf(json)).toEqual({
      stage: "format",
      issues: [
        { path: "documents.1.currency", code: "invalid_currency" },
        { path: "documents.1.lines.1.qty", code: "invalid_decimal" },
        { path: "documents.1.page_from", code: "invalid_page_range" },
      ],
    });
  });
});

describe("readExtraction never repeats a value", () => {
  it.each<{ name: string; json: unknown }>([
    {
      name: "a bad decimal",
      json: anExtractionResult([anExtractedDocument({ total: CANARY })]),
    },
    {
      name: "a bad date",
      json: anExtractionResult([anExtractedDocument({ due_date: CANARY })]),
    },
    {
      name: "a bad enum value",
      json: anExtractionResult([
        anExtractedDocument({ quality: CANARY as never }),
      ]),
    },
    {
      name: "a wrong type",
      json: { documents: CANARY },
    },
  ])("for $name", ({ json }) => {
    const outcome = readExtraction(json);
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toContain(CANARY);
  });
});

describe("isCalendarDate", () => {
  it.each([
    ["2026-11-18", true],
    ["2026-01-31", true],
    ["2026-04-30", true],
    ["2026-04-31", false],
    ["2028-02-29", true], // divisible by 4
    ["2026-02-29", false],
    ["2000-02-29", true], // divisible by 400
    ["1900-02-29", false], // divisible by 100, not 400
    ["2026-02-28", true],
    ["2026-00-10", false],
    ["2026-13-10", false],
    ["2026-06-00", false],
    ["0000-01-01", false],
    ["0001-01-01", true],
    ["2026-6-1", false],
    ["20261118", false],
  ])("%s → %s", (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});

describe("ExtractionResult (the wire schema)", () => {
  it("strips keys the schema doesn't know", () => {
    const parsed = ExtractionResult.parse({
      documents: [{ ...anExtractedDocument(), injected: CANARY }],
    });
    expect(JSON.stringify(parsed)).not.toContain(CANARY);
  });
});
