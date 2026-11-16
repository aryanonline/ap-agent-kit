# 06 · QuickBooks Online integration

Everything Claude Code needs to build `src/integrations/ledger/qbo/`. Items marked **VERIFY** are things I could not confirm from documentation today. Each one is checked by the sandbox task P1-7 in `11-build-plan.md`. Don't build on them until that task records the answer in `docs/decisions.md`.

## Accounts and keys

| Step | When | Notes |
|---|---|---|
| Create an Intuit Developer account and app, plus a **dedicated sandbox company** for the demo dataset | P0-1 | Development keys connect to **sandbox companies only**. That's everything the portfolio, staging and the demo environment need |
| Get **production keys** | Phase 7 (P7-3), only if you decide to sell | Needs: app name and logo, host domain, launch URL, disconnect URL, redirect URIs, EULA URL, privacy policy URL, and the **app assessment questionnaire** (self-attested, about 40 minutes). A rejection blocks new connections until Intuit re-reviews. ([Apideck](https://www.apideck.com/blog/quickbooks-security-review.md)) |
| Join the **Intuit App Partner Program**, Builder tier ($0) | With production keys | Governs API read fees (below) |
| **QuickBooks App Store listing** | Phase 7 | Technical review plus security review (scans, demo call, QA environment). Reported at 6 weeks to over 6 months in total. ([Satva](https://satvasolutions.com/blog/intuit-app-store-approval-timeline-developer-guide)) Re-review yearly for listed apps |

The privacy policy and terms that production keys require are built for the demo site in P4-5 and reviewed by a lawyer in P7-5.

## The sandbox, for the portfolio

- **Staging** connects to the dedicated sandbox company through the normal self-serve flow, which is how the videos are recorded.
- `scripts/seed-qbo-sandbox.ts` loads the demo dataset (doc 12) into the sandbox; `scripts/reset-qbo-sandbox.ts` removes the bills AP Agent created (found by the `PrivateNote` marker) and recreates used-up POs. Reset before every recording and before the nightly end-to-end test.
- **Public demo visitors never touch the sandbox.** They use the demo ledger adapter (doc 12 explains why).

## API fees and limits (as reported, checked 2026-11-16)

Source: [Truto, QuickBooks API cost 2026](https://truto.one/blog/how-much-does-the-quickbooks-api-cost-2026-pricing-rate-limits/). Re-check on Intuit's partner FAQ before launch.

- **Writes are free.** Creating bills and uploading attachments are "Core" calls, unmetered.
- **Reads are metered** ("CorePlus"). Builder: 500,000 a month, free. Over the cap, calls are **blocked**, not throttled, until the next cycle. Silver: $300 a month for 1,000,000, then $3.50 per 1,000.
- **Rate limits:** 500 requests per minute per company; **10 concurrent requests per app per company**; 40 per minute for batch.

**What we'll use** (estimate; measure it with `usage_daily.qbo_read_calls`):

| Read | Calls per company per month |
|---|---|
| CDC sync every 30 minutes | about 1,450 |
| Nightly open-PO refresh | about 30 to 60 |
| Per invoice: duplicate check + PO fetch | about 2 × invoices (400 at 200 invoices) |
| Initial full sync + 12-month bill backfill (once) | about 50 to 300 |

That is roughly 2,000 to 3,000 a month per company, so **Builder covers about 150 companies**. Because the cap is a hard block, alert at 70% of the monthly allowance (E11 admin console).

## OAuth 2.0

- Library: `intuit-oauth` (Intuit's Node OAuth client) for the authorization flow and token refresh. For the Accounting API itself, write a thin typed `fetch` client. We use about 10 endpoints, so a large community SDK isn't worth the dependency.
- Scope: `com.intuit.quickbooks.accounting` only.
- Flow: `/api/qbo/connect` creates a signed `state` (CSRF, bound to the user's session and org) → Intuit → `/api/qbo/callback` checks the state, exchanges the code, stores tokens and the `realmId`, and enqueues `company.sync` and `company.backfill_history`.
- **Access tokens** last 60 minutes. Refresh on demand when under 5 minutes remain.
- **Refresh tokens rotate** (about every 24 hours) and now have a maximum validity of 5 years. ([Truto guide](https://www.truto.one/blog/how-to-integrate-with-the-quickbooks-online-api-2026-guide)) **Always save the newest refresh token before using the new access token.** Do it inside a transaction holding a row lock on `ledger_connections` (see `04-architecture.md`). A stale refresh token fails, and the customer then has to reconnect.
- `invalid_grant` on refresh: set the company to `needs_reconnect`, pause posting, email the admins (E1-4).
- **Non-admin users:** QuickBooks only lets admins connect apps. **VERIFY** how this shows up (on Intuit's consent screen, or as an `error` parameter on our callback), and show the E1-3 AC5 message and the "Invite your QuickBooks admin" action either way.
- **Disconnect from our UI:** call Intuit's revoke endpoint, then delete the tokens.
- **Disconnect from inside QuickBooks:** Intuit sends the user to your *Disconnect URL* page. Don't rely on that as a signal; the next refresh fails with `invalid_grant`, and that is the signal.
- Set the **Reconnect URL** in the developer portal (now a required field, per Truto).

## Calling the API

- Base URL: `https://quickbooks.api.intuit.com` (production), `https://sandbox-quickbooks.api.intuit.com` (sandbox). Path `/v3/company/{realmId}/...`.
- **Always send `minorversion=75`** from one constant (`QBO_MINOR_VERSION`). Versions 1 to 74 were retired on 2025-08-01, and omitting the parameter falls back to an old schema.
- Headers: `Authorization: Bearer <access>`, `Accept: application/json`, `Content-Type: application/json`.
- Log the `intuit_tid` response header on every call (Intuit support asks for it). Never log the body of token calls.

### Endpoints we use

| Purpose | Call | Metered? |
|---|---|---|
| Company name, edition | `GET /companyinfo/{realmId}` (edition is in `NameValue` `OfferingSku`, **VERIFY**) | read |
| Full sync | `GET /query?query=select * from Vendor STARTPOSITION n MAXRESULTS 1000`, for Vendor, Item, Account, Class, Department, Customer, Term | read |
| Open POs | `select * from PurchaseOrder where POStatus = 'Open'` (paged) | read |
| Incremental sync | `GET /cdc?entities=Vendor,Item,Account,Class,Department,Customer,Term,PurchaseOrder,Bill&changedSince=<ISO>`. Looks back at most 30 days; if the last sync is older, run a full sync. | read |
| History backfill (price history, plus `ref_bills` and `ref_bill_lines` for duplicates and auto-setup) | `select * from Bill where TxnDate >= '<12 months ago>'` (paged) | read |
| Duplicate guard | `select * from Bill where DocNumber = '<n>'`, then compare VendorRef in code | read |
| Create bill | `POST /bill?minorversion=75&requestid=<invoice_id>` | write |
| Attach PDF | `POST /upload`, multipart: `file_metadata_0` (JSON with `AttachableRef: [{EntityRef: {type: "Bill", value: <id>}}]`, `FileName`, `ContentType`) + `file_content_0` | write |

**Edition and purchase orders:** POs exist only in Plus and Advanced. If `OfferingSku` can't be read, query PurchaseOrder once on connect; an authorization or validation fault means "no POs". Store the result as `companies.qbo_edition`.

### Bill payload

```json
{
  "VendorRef": { "value": "56" },
  "DocNumber": "INV-10442",
  "TxnDate": "2026-11-12",
  "DueDate": "2026-12-12",
  "SalesTermRef": { "value": "3" },
  "DepartmentRef": { "value": "2" },
  "PrivateNote": "AP Agent · inv 0193b1c2 · approved by J. Ruiz",
  "Line": [
    {
      "DetailType": "ItemBasedExpenseLineDetail",
      "Amount": 645.00,
      "Description": "Hex bolt 3/8 x 2 (case of 100)",
      "ItemBasedExpenseLineDetail": {
        "ItemRef": { "value": "19" },
        "Qty": 50,
        "UnitPrice": 12.90,
        "ClassRef": { "value": "5000000000000123" },
        "CustomerRef": { "value": "58" },
        "BillableStatus": "NotBillable"
      },
      "LinkedTxn": [{ "TxnId": "130", "TxnType": "PurchaseOrder", "TxnLineId": "1" }]
    },
    {
      "DetailType": "AccountBasedExpenseLineDetail",
      "Amount": 42.50,
      "Description": "Freight",
      "AccountBasedExpenseLineDetail": { "AccountRef": { "value": "62" } }
    }
  ]
}
```

- **Linking to the PO:** Bill-to-PurchaseOrder links are supported at line level and at transaction level, since minor version 38 ([Intuit blog](https://blogs.a.intuit.com/2019/08/19/new-entities-supported-in-linked-transactions)). **VERIFY** in sandbox (task P1-7): the exact placement of `LinkedTxn` on the line; whether linking updates the PO's received and closed status; and whether partial billing leaves the PO line open.
- **Billed quantity per PO line:** **VERIFY** which PO fields show what has already been billed. Until then, compute `billed_qty` from bills linked to that PO (`PurchaseOrder.LinkedTxn`) plus our own postings.
- **Amount vs Qty × UnitPrice:** QuickBooks may reject item lines where `Amount ≠ Qty × UnitPrice` after rounding (**VERIFY**). Rule: send the invoice's line amount as `Amount`. If `round(qty × unit_price, 2) ≠ amount`, send `UnitPrice = amount / qty`, rounded to the precision QuickBooks accepts, and record the adjustment in `ledger_postings`.
- **Sales tax on US bills:** there is no tax engine on US bills. Post vendor-charged tax as an account-based line to the company's configured "tax paid" account, or fold it into cost if the company's setting says so.
- **Idempotency:** pass `requestid=<invoice_id>` (QuickBooks returns the original result for a repeated request id; **VERIFY**). Also run the DocNumber duplicate guard before every attempt, because a timeout may have succeeded on Intuit's side.

## Errors to handle

| Signal | Meaning | Action |
|---|---|---|
| HTTP 401 | Access token expired | Refresh once, retry once |
| `invalid_grant` on refresh | Connection revoked | `needs_reconnect` (E1-4) |
| HTTP 403 | Feature not in their edition, or the user's permission | Plain message; for POs, switch the company to no-PO mode |
| HTTP 429 | Rate limited | Back off with jitter; keep per-company concurrency at 4 or fewer |
| 5xx, timeout | Intuit side | Retry up to 5 times; run the duplicate guard before each retry |
| Fault 610 "Object Not Found" | Vendor, item or account deleted or made inactive since sync | Re-sync that entity; send the invoice back to exceptions with `needs_coding_review` |
| Fault 5010 "Stale Object" | Sync token out of date (updates only) | Re-read and retry |
| Fault 6240 "Duplicate Document Number" | Company has duplicate bill-number warnings on | Treat as `duplicate_suspected`; never auto-retry |
| Any other `Fault` | Validation | Show `Fault.Error[].Detail` in plain words; status `post_failed` |

Keep a mapping table in `src/integrations/ledger/qbo/errors.ts`, with a test for each row.

## Webhooks (optional, Phase 4)

CDC every 30 minutes is enough for the MVP. Intuit webhooks are batched and not real time, and carry only entity name, ID and operation. Add them later for faster PO updates: verify the `intuit-signature` header (HMAC-SHA256 with the verifier token), return 200 within 3 seconds, and enqueue `company.sync`.

## Sandbox test plan (task P1-7)

1. Create a vendor, two items, and a PO with three lines.
2. Post a bill linked to PO lines 1 and 2, with partial quantity on line 2. Read the PO back and record which fields changed.
3. Post the same bill again with the same `requestid`. Confirm no duplicate is created.
4. Post a line where `Qty × UnitPrice` doesn't equal `Amount` by 1 cent. Record the behaviour.
5. Attach a PDF. Confirm it shows on the bill in the QuickBooks UI.
6. Revoke the app from QuickBooks. Confirm the next refresh fails with `invalid_grant`.
7. Sign in to the sandbox as a non-admin user and try to connect. Record what Intuit shows or returns.
8. Record every result in `docs/decisions.md`, and remove the **VERIFY** markers here.
