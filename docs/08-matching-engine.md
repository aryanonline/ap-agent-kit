# 08 · Matching engine

This is the product. Capture is free elsewhere; **checking each line against what was agreed** is what customers pay for. Everything here lives in `src/core/` as pure functions with no I/O, and is covered by table-driven tests.

```ts
// src/core/evaluate.ts
export function evaluateInvoice(input: EvaluationInput): Evaluation
```

- **Input:** the validated extraction, company settings, and a snapshot of this company's reference data (vendors, aliases, items, item aliases, vendor defaults, open POs with lines and billed quantities, price lists, price history, recent bills), the vendor's earlier invoices (for duplicate and fraud checks), and the sender's email.
- **Output:** vendor resolution, per-line match and coding, a list of exceptions (type, severity, message, dollar impact, data), `auto_approvable`, and a one-line summary.

The pipeline job (`invoice.evaluate`) loads the snapshot, calls this function, and saves the result. The same function runs in `scripts/proof-run.ts` in Phase 0.

## Severity

- **`block`**: the invoice goes to **Exceptions**. Approving it requires a reason. It can never be auto-posted.
- **`warn`**: the invoice can sit in **Ready**, with a yellow note. It can't be auto-posted.

## Step 1. Normalize

- **Vendor names:** lowercase; strip punctuation, "the", and legal suffixes (inc, llc, ltd, co, corp, company); collapse whitespace.
- **SKUs:** uppercase; strip spaces, dashes, dots and leading zeros.
- **Descriptions:** lowercase; strip punctuation; collapse whitespace; keep numbers and sizes (`3/8`, `2in`).
- **Units of measure:** map synonyms: `EA EACH PC PCS UNIT → EA`, `CS CASE → CS`, `BX BOX → BX`, `HR HRS HOUR → HR`, `LB LBS → LB`, `GAL → GAL`, `FT → FT`.
- **PO numbers:** uppercase; strip the `PO`, `P.O.` and `#` prefixes; strip leading zeros.

## Step 2. Validate (E3-3)

| Check | Exception | Severity |
|---|---|---|
| Any line: `round(qty × unit_price, 2)` differs from amount by more than $0.01 | `arithmetic_mismatch` | block |
| Item, fee and freight lines don't sum to the subtotal (more than $0.01 off, when a subtotal is printed) | `arithmetic_mismatch` | block |
| subtotal + tax + freight + other fees ≠ total (more than `rounding_abs`) | `arithmetic_mismatch` | block |
| Vendor name, invoice number, invoice date or total missing | `missing_required_field` | block |
| Currency differs from the company's currency | `currency_mismatch` | block |
| Extraction quality `degraded` | `low_quality_scan` | warn |
| Extraction quality `unreadable` | `low_quality_scan` | block |
| `doc_type = credit_memo` | `credit_memo` | block (posting vendor credits is out of MVP scope) |

## Step 3. Resolve the vendor (E5-1)

Try in order; the first hit wins.

| # | Method | Auto-approvable? |
|---|---|---|
| 1 | `vendor_aliases` by tax ID | yes |
| 2 | `vendor_aliases` by sender email domain, or by full address when the sender uses free mail such as gmail.com (ignore the customer's own domain) | yes |
| 3 | `vendor_aliases` by normalized name, exact | yes |
| 4 | `ref_vendors.primary_email` domain = sender domain | yes |
| 5 | Fuzzy name (trigram or Jaro-Winkler): best score ≥ 0.92 and the runner-up < 0.85 | **no**: `unknown_vendor` (warn), "Matched to *Acme Supply Co* by name; confirm" |
| — | Nothing found | `unknown_vendor` (block), with the top 3 suggestions |

When a reviewer confirms or picks a vendor, save the alias (name, plus the email domain, or the full address for free mail). Auto-setup creates the first aliases from QuickBooks (see "Auto-setup" below).

## Step 4. Pick the price source

```
if company has POs (Plus/Advanced) and vendor has open POs:
    if invoice lists PO numbers:
        find that vendor's open PO by normalized DocNumber
          - found                       -> source = PO
          - belongs to another vendor   -> po_ambiguous (block)
          - closed or not found         -> no_po_found (block if the vendor normally uses POs, else warn) -> fall through
    else:
        score each open PO of the vendor by line overlap (items, SKU aliases, description similarity)
          - exactly one PO with >= 70% of item lines matched -> source = PO
          - more than one                                   -> po_ambiguous (block)
          - none -> no_po_found if the vendor normally uses POs (>= 50% of its last 20 bills linked to a PO), then fall through
fall through, per line:
    price list in effect on the invoice date (by SKU, then item, then description) -> source = price_list
    else price history for vendor + item (or vendor + description), within history.window_days,
         with at least history.min_samples samples; expected = median   -> source = history
    else -> source = none (unverified_price if require_price_source, block; else nothing)
```

## Step 5. Match lines and check prices and quantities

Only for lines where `kind = item`.

**Match to PO lines** (when the source is PO). For each invoice line, candidate PO lines are, in order: same QuickBooks item (via `item_aliases` for vendor + SKU), same normalized SKU, or description similarity ≥ 0.80. Assign greedily by score, one to one. An item line left over on a PO-matched invoice raises `line_unmatched` (block).

**Units.** If the invoice unit differs from the PO, price-list or item unit, convert using `item_aliases.uom_factor`. No known factor: `uom_unknown` (block). The reviewer's fix saves the factor.

**Tolerance.** Per company, with a per-vendor override:

```
expected_amount = expected_unit_price × qty            (both in ledger units)
allowed         = min(price_pct% × expected_amount, price_abs)
variance        = actual_amount - expected_amount
flag price_variance (block) if variance > allowed + rounding_abs
```

- Prices *below* expected are recorded on the line (`variance_amount < 0`) and shown in green. They are never an exception.
- **Quantity:** `open_qty = po_line.qty - po_line.billed_qty`. Flag `qty_over_po` (block) if the invoiced quantity (in ledger units) is more than `open_qty × (1 + qty_pct%)`. Dollar impact = excess quantity × invoice unit price.
- Store `price_source`, `expected_unit_price`, `variance_amount` and `variance_pct` on each line. The UI and the overcharge report read them.

## Step 6. Non-item lines

| Kind | Rule |
|---|---|
| `freight`, `fee` | Allowed if the kind is in `vendor_defaults.allowed_fee_kinds`, or a PO line covers it. Otherwise `unexpected_fee` (block); dollar impact = amount |
| `tax` | Allowed. Coded to the company's tax-paid account, or folded into cost, depending on the setting |
| `discount` | Allowed |
| `other` | `needs_coding_review` (warn) |

## Step 7. Code each line (E5-5)

Priority: **PO line** coding → **item alias** (vendor + SKU or description) → **vendor default** account → **model suggestion** (`needs_coding_review`, warn) → nothing (`needs_coding_review`, block). Class, location and customer/job come from the PO line, else the vendor default. Save the source in `coding_source`.

## Step 8. Duplicates (E5-4)

| Check | Exception |
|---|---|
| Same company + vendor + normalized invoice number in our `invoices` (any status except rejected) | `duplicate_suspected` (block), linking the earlier one |
| Same vendor + total + invoice date within ±3 days | `duplicate_suspected` (block) |
| Same vendor + DocNumber in `ref_bills` (recent QuickBooks bills, synced) | `duplicate_suspected` (block), linking the QuickBooks bill |

The same file arriving twice (same SHA-256) is caught earlier, at intake.

## Step 9. Fraud signals (E5-6)

These defend against **business email compromise**: fake invoices, or a real vendor's bank details "updated" by an attacker. They are the most valuable checks for the owner, and they can never be auto-approved or turned off.

| Check | Exception |
|---|---|
| Remit-to account or routing hash differs from the vendor's last 3 invoices (needs at least 1 earlier invoice with bank details) | `remit_to_changed` (block) |
| Sender's domain **looks like** a domain known for any of this company's vendors but isn't it: equal after mapping confusable characters (`rn`→`m`, `vv`→`w`, `0`→`o`, `1`→`l`), or one edit away when the name part has 6 or more characters. A domain that belongs to another of the company's vendors doesn't count | `new_sender` (block), naming the real domain |
| The vendor has a known sender (a domain or address from auto-setup or an alias, or one seen on 3 or more earlier invoices) and this sender has never been seen for it | `new_sender` (block) |

Because auto-setup takes known domains from QuickBooks, both checks work from a new customer's first invoice. For free-mail senders, compare the full address, not the domain. For mail forwarded by hand, use the original sender parsed from the body (doc 07).

Message for `remit_to_changed`: "Bank details differ from this vendor's last invoices (account ending 4411, was 9023). Confirm by phone using a number you already have, not one on this invoice."

## Step 10. Route

```
if any block exception          -> status = exceptions
else                            -> status = ready
auto_approvable =
     no exceptions at all (not even warn)
 and vendor resolved by methods 1-4
 and every line's coding_source in {po_line, alias, vendor_default}
 and every item line's price_source in {po, price_list}   (history counts only if company.settings allows it)
 and quality = clear
 and vendor_defaults.auto_post_allowed

posting, by companies.posting_mode:
  shadow  -> nothing posts. Approving ("Mark as would-post") sets status = shadow_closed. The invoice is never
             posted later, even after the company starts posting (E6-2 AC6, E13-6)
  approve -> a person approves; approval enqueues invoice.post
  auto    -> if auto_approvable: enqueue invoice.post (actor = system); otherwise as approve
POSTING_ENABLED = false (global kill switch): invoice.post jobs wait and nothing is sent
```

`posting_mode` changes only when an admin clicks **Start posting** (shadow → approve, E13-6), when an admin turns on auto-post after the readiness bar (approve → auto), or when the auto-post kill switch fires (auto → approve).

## Auto-post readiness bar (E12)

The admin can only switch on auto-post when, for that company:
1. At least **200 invoices** have been reviewed by a person (reviews in shadow mode count), **and**
2. Over the last 30 days, at least **95%** of invoices marked `auto_approvable` were approved **with zero edits**, **and**
3. No bill we posted was deleted or edited in QuickBooks because of our error in the last 30 days (detected through CDC on Bill), **and**
4. The company has been `active` (not `needs_reconnect`) for the last 7 days.

**Kill switch:** sets `posting_mode` back to `approve` and alerts the admins if the 7-day zero-edit rate on reviewed auto-approvable invoices drops below 90%, or if any auto-posted bill is edited or deleted in QuickBooks within 7 days.

## Messages: plain words, with the money

| Type | Example message |
|---|---|
| `price_variance` | "Unit price $14.20 vs PO 4471 $12.90 (+10.1%). +$65.00 on 50 units." |
| `qty_over_po` | "Invoiced 60 CS; only 40 CS still open on PO 4471 line 2. 20 extra = $258.00." |
| `unexpected_fee` | "Fuel surcharge $38.00 is not on the PO and not an agreed fee for this vendor." |
| `duplicate_suspected` | "Same vendor and invoice number as INV-10442, received Nov 3 (posted as bill 1832)." |
| `unknown_vendor` | "No vendor matches 'ACME SUPPLY CO OF TX'. Closest: Acme Supply Co (0.88), Acme Industrial (0.71)." |
| `arithmetic_mismatch` | "Lines add up to $1,204.50, but the subtotal says $1,240.50 ($36.00 off)." |

**Dollars flagged** (dashboard and overcharge report) = the sum of positive `dollar_impact` on `price_variance`, `qty_over_po`, `unexpected_fee`, and `duplicate_suspected` (its full total). Report it next to how each one was resolved, so a customer can see "flagged" vs "credited".

## Auto-setup (E13-3)

Nobody on our side configures a customer, so the starting rules come from the company's own QuickBooks data. `company.auto_setup` runs after the first sync and the 12-month backfill. The inference is a pure function in `src/onboarding/auto-setup.ts` over the `ref_*` tables, table-tested like `core`.

| Rule | Creates | When |
|---|---|---|
| Vendor names | `vendor_aliases` (name) for the normalized display name and company name | Skip a name that normalizes the same for two vendors |
| Vendor domains | `vendor_aliases` (email_domain) from `ref_vendors.primary_email` and `web_addr`; (email_address) when the email is free mail | Not the customer's own domain, and not shared by two vendors |
| Default coding | `vendor_defaults` account and class (from `ref_bill_lines`), location (from `ref_bills`) | Each one separately: used on 60% or more of the vendor's lines (or bills, for location) in the last 12 months, over at least 3 bills |
| Item mappings | `item_aliases` (vendor + description → item) | The normalized description maps to the same item on 2 or more of the vendor's past bills, and never to a different item |
| Allowed fees | `vendor_defaults.allowed_fee_kinds` | `freight` if 2 or more past bills have a freight line (account name or description matches freight, shipping or delivery); `fee` the same way for fuel, surcharge or handling |
| Price baseline | Nothing new: `price_history` comes from the backfill | Reported as coverage: items with at least `history.min_samples` prices |
| Tolerance | `companies.settings.tolerance` | The preset the user picks: Strict (exact), Standard (2% or $25, whichever is less), Relaxed (5% or $100) |

- Everything auto-setup creates has source `auto`. It never overwrites or deletes a rule a person made (`learned` or `manual`). Re-running it replaces only its own `auto` rules.
- It re-runs for one vendor when CDC brings a new or changed vendor, and in full from Settings → Rules.
- A vendor is **ready** when it has a known sender (domain or address) and either a default account or at least one item mapping. Other vendors are listed as "needs input later", with what's missing. The first review of one of their invoices fills the gap through the learning loop.
- Descriptions on QuickBooks bills are often the item's own text rather than the supplier's, so expect item mappings to cover fewer lines than the other rules. PO matching (step 5) and the learning loop cover the rest.
- **Test (E13-3 AC5):** on the demo dataset, at least 80% of vendors are ready. Build `fixtures/demo` so the vendors that aren't ready are deliberate (one with no email on file, one with mixed coding), and assert exactly which ones.

## The learning loop

Corrections are the product getting better, so make them cheap and visible:
- Every vendor, item, unit or coding fix offers "Always do this" (on by default) and writes an alias, factor or default.
- Settings → Rules lists everything learned, by vendor, with who created it. Every rule can be deleted.
- The customer's dashboard shows **zero-edit rate by vendor**, worst first, each with the fix that would help most (confirm the domain, set default coding, upload a price list). Nobody on our side tunes a customer's vendors, so the product has to make the fix obvious.
- The admin console shows the same numbers across all companies. Use them to improve auto-setup and extraction for everyone, never to hand-tune one account.

## Tests (required)

- `src/core/__tests__/evaluate.test.ts`: table-driven scenarios built with a fixture builder (`buildCompany()`, `buildPO()`, `buildInvoice()`), at least one for each exception type and for each row of the price-source decision.
- Property tests (fast-check) for `money.ts` and the tolerance rule: never flags a variance within tolerance; always flags one beyond it; symmetric rounding.
- Golden tests: `fixtures/expected/*.json` plus a reference snapshot produce exactly the expected exceptions.
