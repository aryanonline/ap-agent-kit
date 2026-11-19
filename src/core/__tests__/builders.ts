/**
 * Test builders (CLAUDE.md conventions): a valid value with sensible defaults, and overrides
 * for the field a test is about. All data is fictional.
 */
import type {
  ExtractedDocument,
  ExtractedLine,
  ExtractionResult,
} from "../extraction-schema";

/** An item line: 100 EA at $0.42 = $42.00. */
export function anExtractedLine(
  overrides: Partial<ExtractedLine> = {},
): ExtractedLine {
  return {
    kind: "item",
    description: "Hex bolt 3/8 x 2 in, zinc",
    supplier_sku: "HB-3802",
    qty: "100",
    uom: "EA",
    unit_price: "0.42",
    amount: "42.00",
    po_ref: "",
    ...overrides,
  };
}

/** A one-page invoice with one item line and tax: $42.00 + $3.47 = $45.47. */
export function anExtractedDocument(
  overrides: Partial<ExtractedDocument> = {},
): ExtractedDocument {
  return {
    doc_type: "invoice",
    page_from: 1,
    page_to: 1,
    quality: "clear",
    vendor: {
      name: "Acme Fasteners Inc.",
      address: "100 Industrial Way, Dayton, OH 45402",
      email: "billing@acme-fasteners.example.com",
      phone: "",
      tax_id: "",
    },
    remit_to: null,
    invoice_number: "INV-1001",
    invoice_date: "2026-11-02",
    due_date: "2026-12-02",
    terms: "Net 30",
    po_numbers: ["PO-4512"],
    currency: "USD",
    lines: [anExtractedLine()],
    subtotal: "42.00",
    tax: "3.47",
    freight: null,
    other_fees: null,
    total: "45.47",
    notes: [],
    ...overrides,
  };
}

/** A file holding the given documents (one default invoice if none are given). */
export function anExtractionResult(
  documents: ExtractedDocument[] = [anExtractedDocument()],
): ExtractionResult {
  return { documents };
}
