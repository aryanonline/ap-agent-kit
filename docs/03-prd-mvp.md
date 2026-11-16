# 03 · PRD: MVP scope and acceptance criteria

**MVP** means everything a self-serve customer needs to go from sign-up to posting bills and paying, with nobody from our side involved, plus the public demo for the portfolio. In `11-build-plan.md` that's Phases 0 to 6.

Each story has an ID that the build plan and tests refer to. A story is done only when every acceptance criterion (AC) is covered by an automated test, or by a written manual check in the PR.

## Glossary

| Term | Meaning here | QuickBooks Online entity |
|---|---|---|
| Organization | The paying account: a business, or a bookkeeping firm | (ours) |
| Company | One QuickBooks file (realm). An organization can have several. | `CompanyInfo`, realmId |
| Invoice | A supplier's invoice we received (their invoice is our customer's bill) | becomes a `Bill` |
| Credit memo | A supplier credit | `VendorCredit` (flagged, not posted, in the MVP) |
| PO | Purchase order the customer issued | `PurchaseOrder` (Plus and Advanced only) |
| Price list | Agreed unit prices per vendor and item, uploaded by the customer | (ours) |
| Exception | A reason an invoice can't be approved automatically | (ours) |
| Zero-edit | Approved with no human change to any extracted or coded field | (ours) |
| Tolerance | Allowed price variance, e.g. 2% or $25, whichever is less | (ours) |
| Posting mode | `shadow` (nothing posts), `approve` (a person approves each bill), `auto` (clean bills post themselves) | (ours) |
| Demo workspace | A temporary, isolated organization seeded with fictional data for one visitor | (ours) |

## In scope

Self-serve sign-up and onboarding · email intake · extraction of header and line items · validation · QuickBooks reference sync · auto-setup from QuickBooks history · vendor, PO, price and duplicate matching · fraud signals · shadow mode with a comparison report · review and exceptions UI · posting bills with PDF attached and PO linked · learning from corrections · digest and alerts · metrics · trial, plans, Stripe billing and self-serve cancellation · help center · auto-post (opt-in) · admin console · public demo.

## Out of scope (MVP)

Setup calls or done-for-you configuration · Xero, NetSuite, QuickBooks Desktop · paying bills · multi-step approval chains · posting vendor credits · multi-currency · non-English invoices · supplier portals, EDI, paper mail scanning · mobile apps · 3-way match with receipts · public API · the partner workspace for bookkeepers (Phase 7).

---

## E1. Accounts and companies

**E1-1 Sign up and sign in.**
- AC1: Sign-up (email or Google) creates an organization with the user as `owner`.
- AC2: Owners and admins must enrol in MFA before connecting QuickBooks.
- AC3: Sessions expire after 12 hours idle; cookies are `Secure` and `HttpOnly`.
- AC4: The user accepts the terms during sign-up. The terms version, time and user are recorded.
- AC5: A trial starts (E10-1).

**E1-2 Invite teammates** with role `admin` or `reviewer`.
- AC1: Reviewers can approve, edit and reject invoices, but can't change settings, connections or billing.
- AC2: Role changes are written to the audit log.

**E1-3 Connect QuickBooks.** (The onboarding experience around it is E13-2.)
- AC1: OAuth 2.0 with only the `com.intuit.quickbooks.accounting` scope.
- AC2: On success, store realmId, company name and edition, then queue a full sync and the history backfill.
- AC3: If the edition has no purchase orders, the UI says so and explains which checks will run instead.
- AC4: Tokens are stored encrypted (doc 09) and never sent to the browser.
- AC5: If the QuickBooks user can't authorize apps (not an admin), show a plain explanation and an "Invite your QuickBooks admin" action.
- AC6: A QuickBooks company already on a trial or paid plan in another organization can't start a second trial.

**E1-4 Disconnect and reconnect.**
- AC1: Disconnecting revokes the token with Intuit, deletes it, and pauses posting.
- AC2: A refresh failure (`invalid_grant`) marks the company `needs_reconnect`, pauses posting and emails the admins a reconnect link.
- AC3: Invoices keep arriving and being read while disconnected; they wait for posting.

## E2. Intake

**E2-1 Inbox address per company.** Unique and unguessable: `ap-<12+ random chars>@in.<domain>`.
- AC1: Admins can view and rotate it. The old address works for 7 more days, then rejects mail.
- AC2: Mail to an unknown address is dropped and logged without its content.

**E2-2 Receive email.**
- AC1: Accepts PDF, PNG, JPG/JPEG and WEBP attachments up to 20 MB each. Other formats, including HEIC phone photos, are archived with reason `unsupported_format` and shown in the UI. Nothing is emailed back to the sender.
- AC2: Idempotent on the provider's message ID; a redelivered webhook creates no duplicate.
- AC3: Each attachment becomes one document; PDFs holding several invoices are split (E3-4).
- AC4: Store the SPF/DKIM results and the sender on the email record.
- AC5: Webhook receipt to stored-and-queued in under 5 seconds at p95.
- AC6: Gmail forwarding-confirmation emails are recognised, never processed as documents, and their code is shown in onboarding (E13-4).

**E2-3 Manual upload.** Drag and drop PDFs or images into a company's inbox. Same pipeline; source `upload`.

## E3. Extraction

**E3-1 Classify:** `invoice`, `credit_memo`, `statement`, `quote_or_po`, `receipt`, `other`.
- AC1: Only `invoice` continues automatically. `credit_memo` goes to exceptions. The rest are archived with a reason and can be re-queued by hand.

**E3-2 Extract header and lines** to the schema in doc 07.
- AC1: Header: vendor name, address, email, phone, tax ID, remit-to details, invoice number, invoice and due dates, terms, PO numbers, currency, subtotal, tax, freight, total.
- AC2: Lines: description, supplier SKU, quantity, unit, unit price, amount, line PO reference, and kind (item, freight, fee, tax, discount, other).
- AC3: A multi-page invoice produces one invoice with all its lines in order.
- AC4: The output is schema-valid, or the document is `extraction_failed` with the reason. Nothing is ever partially saved.

**E3-3 Validate the arithmetic** in code (doc 08, step 2).
- AC1: Flag `arithmetic_mismatch` for line, subtotal or total mismatches beyond the rounding tolerance.
- AC2: Flag `missing_required_field` if vendor name, invoice number, invoice date or total is missing.

**E3-4 Split multi-invoice PDFs** into one document per invoice, by page range. AC1: covered by a 3-invoice fixture.

## E4. QuickBooks reference data

**E4-1 Sync** vendors, items, accounts, classes, locations, customers (jobs), terms, open POs with lines, and recent bills.
- AC1: A full sync on connect, then incremental Change Data Capture (CDC) every 30 minutes and a nightly refresh of open POs.
- AC2: Read calls are counted per company per day (doc 06).
- AC3: Matching reads only the cache, never QuickBooks live.

**E4-2 Price history:** 12 months of bill lines per vendor and item, backfilled on connect and kept current.

**E4-3 Price lists:** versioned, with effective dates; matching uses the version in effect on the invoice date. The upload experience is E13-5.

## E5. Matching (full rules in doc 08)

**E5-1 Resolve the vendor.** Alias, email domain, tax ID, then fuzzy name.
- AC1: Below the confidence threshold → `unknown_vendor`, with the top 3 suggestions.
- AC2: A reviewer's choice is saved as an alias.

**E5-2 Match to a PO.**
- AC1: Lines match by item, SKU alias, then description similarity.
- AC2: `qty_over_po` when the invoiced quantity is more than the open PO quantity, beyond tolerance.
- AC3: `price_variance` when the unit price is above the PO price, beyond tolerance. Lower prices are noted, never flagged.

**E5-3 Match to a price list or price history** when there's no PO.
- AC1: Each line records its price source: `po`, `price_list`, `history` or `none`.
- AC2: `unverified_price` for source `none` only if the company requires a price source.

**E5-4 Detect duplicates:** same vendor and invoice number, or same vendor, total and date within 3 days, in our records and in QuickBooks.

**E5-5 Suggest coding:** PO line → alias → vendor default → model suggestion.
- AC1: A model-suggested code always sets `needs_coding_review` and is never auto-approvable.

**E5-6 Fraud signals:** `remit_to_changed` and `new_sender`.
- AC1: These can never be auto-approved, whatever the settings.

## E6. Review UI

**E6-1 Queues:** Ready, Exceptions, Posted, Archived, with counts and filters (vendor, date, exception type).

**E6-2 Invoice detail:** the PDF on the left; the extracted fields, match results and coding on the right.
- AC1: Every exception is in plain words with its dollar impact, e.g. "Unit price $14.20 vs PO $12.90 (+10.1%), +$65.00 on 50 units."
- AC2: Every field can be edited; each edit is saved with the user, time, old value and new value.
- AC3: Actions: Approve, Reject (with a reason), Not an invoice, Re-run extraction.
- AC4: Keyboard: `j`/`k` next and previous, `a` approve, `e` edit, `r` reject.
- AC5: Approving with an open exception requires a reason ("Supplier will credit", "Price increase accepted", …).
- AC6: In shadow mode the approve button reads **Mark as would-post**, and nothing is sent to QuickBooks.

**E6-3 Bulk approve** Ready invoices. AC1: only invoices with no exceptions.

**E6-4 Learn from corrections:** "Always do this for <vendor> / <SKU>" (on by default) saves the rule. Settings → Rules lists every rule, with its source (`auto`, `manual`) and a delete button.

## E7. Posting

**E7-1 Create the bill** on approval, in `approve` or `auto` posting mode only.
- AC1: VendorRef, DocNumber, TxnDate, DueDate, terms, item or account lines, class, location, customer/job, and a private note linking back.
- AC2: Lines that matched a PO line are linked to it.
- AC3: The PDF is attached.
- AC4: Idempotent: a retry never creates a second bill (`requestid` plus a pre-post duplicate check).
- AC5: On success, store the bill ID, set `posted`, and show "View in QuickBooks".
- AC6: On failure, set `post_failed` with the QuickBooks error in plain words, and allow a retry. Retryable errors (429, 5xx) retry automatically with backoff, up to 5 times.

**E7-2 Latency:** approval to posted in under 60 seconds at p95.

## E8. Notifications

**E8-1 Daily digest** at 8 AM company time on weekdays: new exceptions with dollar impact, posting failures, Ready-queue size. Skipped if there's nothing to report.

**E8-2 Alerts to admins:** QuickBooks disconnected; no email for 3 business days; more than 3 posting failures in an hour.

## E9. Metrics

**E9-1 Company dashboard:** invoices received, zero-edit rate, exceptions by type, dollars flagged, median time from receipt to posted, estimated hours saved (invoices × minutes per invoice, default 4).

**E9-2 Monthly overcharge report** for the owner: dollars flagged by vendor and how each was resolved.

## E10. Trial and billing

**E10-1 Trial.**
- AC1: 14 days or 100 invoices, whichever comes first. No card required.
- AC2: Banner and emails on trial day 10, 13 and 14, and at 80 invoices.
- AC3: At the end without a plan, extraction and posting pause. Mail that arrives is still stored but not processed. Data is kept 30 days, and choosing a plan processes the stored mail and resumes everything.
- AC4: One trial per QuickBooks company (E1-3 AC6).

**E10-2 Plans and checkout.**
- AC1: Plans from doc 10, monthly or annual, through Stripe Checkout.
- AC2: The Stripe customer portal handles card changes, plan changes and invoices.
- AC3: **Self-serve cancellation** in the portal, with an optional reason. It takes effect at the period end.

**E10-3 Usage and overage.**
- AC1: Usage is invoices that reach `extracted`. Duplicates, statements and non-invoices don't count.
- AC2: Daily usage is reported to a Stripe meter. Billed totals reconcile with `usage_daily` (tested).
- AC3: Because documents that turn out not to be invoices are free but still cost model calls, processing is capped per organization per day: 150 documents in a trial, 500 on a plan, adjustable per organization in the admin console. Documents over the cap wait in the queue, and the admins get one email (T12 in doc 09).

**E10-4 Failed payments.** A banner for 7 days, then posting pauses; intake continues.

**E10-5 Environment rule.** Demo and staging use Stripe test mode only. Organizations with `billing_mode = demo` never create Stripe customers.

## E11. Operations (internal)

**E11-1 Admin console:** pipeline status for every company, stuck documents, failed jobs, re-run any step, API usage, cost per invoice, and each company's auto-setup coverage (vendors ready, checks active) and onboarding progress.
- AC1: Viewing a customer's invoice content requires a support-access flag the customer switched on, and every view is audited.

## E12. Auto-post

**E12-1** Per company and optionally per vendor: invoices with no exceptions and no model-suggested coding post without a person.
- AC1: Available only when the company meets the readiness bar (doc 08); the UI shows the numbers behind it.
- AC2: Switches itself off and alerts the admins if the 7-day zero-edit rate on reviewed invoices drops below 90%, or if an auto-posted bill is edited or deleted in QuickBooks within 7 days.

## E13. Self-serve onboarding (no human on our side)

**E13-1 Getting started.** A step-by-step flow after sign-up: connect → auto-setup review → email route → price lists (optional) → shadow mode.
- AC1: Resumable at any step. A checklist stays on the dashboard until every step is done or skipped.
- AC2: Only "Connect QuickBooks" is required to continue. Everything else can be skipped and finished later.
- AC3: Each step links to a help article (E13-8).

**E13-2 Connect and sync progress.**
- AC1: Live progress for each entity type during the first sync, then a summary (vendors, items, open POs, months of bills).
- AC2: The message depends on the edition (E1-3 AC3).
- AC3: If the sync fails, show the reason in plain words and a retry button. Never a blank spinner.

**E13-3 Auto-setup from QuickBooks history.** Runs after the first sync and backfill (rules in doc 08, "Auto-setup").
- AC1: Creates vendor email-domain aliases, vendor default coding, vendor item mappings, allowed fees and the price-history baseline, all with source `auto`.
- AC2: Never changes a rule a person made (source `learned` or `manual`).
- AC3: Shows a summary: vendors fully set up, vendors needing input later, and which checks are active (PO, price list, history).
- AC4: The user picks a tolerance preset (Strict, Standard, Relaxed) and can customize it later.
- AC5: Measured on the demo dataset: at least 80% of the demo vendors are fully set up automatically (a test).

**E13-4 Email route setup and verification.**
- AC1: Shows the company's inbox address with a copy button, and four routes: Gmail/Google Workspace, Microsoft 365/Outlook, ask suppliers to send directly, upload or forward by hand.
- AC2: **Gmail:** when the Gmail forwarding-confirmation email arrives, the confirmation code appears on the onboarding screen within 10 seconds. A filter query is generated from the vendors' known email domains.
- AC3: **Microsoft 365:** the instructions warn that external forwarding is often blocked (error 5.7.520) and link Microsoft's article. If no mail arrives within 30 minutes of the user saying "rule created", show the troubleshooting panel with the alternatives.
- AC4: **Suppliers direct:** a ready-to-copy notice with the address.
- AC5: A live "waiting for your first email" panel shows the first arrival (vendor, number, total) as soon as it's read.
- AC6: The step is complete when at least one email arrives by a route other than upload. Upload-only users can skip it, with a warning.

**E13-5 Price-list import wizard.**
- AC1: Accepts CSV and XLSX up to 10,000 rows.
- AC2: Suggests column roles (SKU, description, unit, price, effective from and to, vendor) from headers and sample rows. A model may assist; the user confirms every mapping.
- AC3: Shows a preview with failing rows and reasons. Import only when every row passes, or the user chooses to skip the failures.

**E13-6 Shadow mode and the comparison report.**
- AC1: New companies start in `shadow` for 7 days.
- AC2: Bills entered by hand in QuickBooks during shadow mode (seen by CDC) are matched to our invoices by vendor + DocNumber, else vendor + total + date within 3 days.
- AC3: The report shows bills the team entered; how many we had ready; exact matches (vendor, amount, coding); differences, field by field; invoices we flagged that were entered as billed, with dollars.
- AC4: A daily shadow summary email goes to the admins.
- AC5: **Start posting** switches to `approve`. It is recommended once 20 or more invoices reach a 60%+ zero-edit rate; before that it shows a warning but is allowed.

**E13-7 Lifecycle emails and stuck detection.**
- AC1: Emails on day 0 (welcome and next step), 1, 3 and 7, plus the trial emails (E10-1).
- AC2: Triggered emails for each "stuck" signal in doc 02, Part 1. Each email is sent at most once per signal per company.
- AC3: Every email has a one-click unsubscribe, except security and billing notices.

**E13-8 Help center.** At least 12 articles: connecting QuickBooks, Gmail forwarding, Microsoft 365 forwarding, asking suppliers, price lists, tolerances, exceptions explained (one per type), shadow mode, auto-post, plans and billing, data and security, disconnecting and deleting data. Linked in context from the UI.

## E14. Public demo (portfolio)

**E14-1 Instant demo workspace.**
- AC1: "Try the live demo" (with bot protection) creates a private demo organization and signs the visitor into it in under 5 seconds. No sign-up.
- AC2: Seeded from `fixtures/demo` (doc 12): a fictional distributor with vendors, items, open POs, a price list, price history, and 20 invoices covering every scenario, with stored extraction results (no model calls).
- AC3: Each visitor's workspace is isolated. It expires 24 hours after creation and is deleted, files included.
- AC4: Disabled in the demo: connecting or disconnecting QuickBooks, inviting users, changing billing details, outbound emails. Each shows a short "not available in the demo" note.
- AC5: Every page shows a "Demo: fictional data" label.

**E14-2 Guided tour:** three steps (an overcharge flagged, approve a clean invoice, see the resulting bill), using the real UI. Can be dismissed and restarted.

**E14-3 Simulated QuickBooks.** The demo uses the demo ledger adapter.
- AC1: Approving "posts" to the simulated ledger. The posted bill is shown as a QuickBooks-style bill, with a toggle that shows the exact JSON payload the real integration would send (the same payload builder as E7-1).
- AC2: Billed quantities on the demo POs update, so a second invoice against the same PO line behaves correctly.

**E14-4 Upload your own invoice.**
- AC1: At most 3 documents per workspace, 5 pages and 10 MB each. A global daily cap and a daily model-spend cap; when either is hit, uploads are disabled with a message.
- AC2: A notice before upload: "Don't upload confidential documents. Files are deleted within 24 hours."
- AC3: Uploads go through the real pipeline (extraction and checks) against the demo company's data.
- AC4: A kill switch (`DEMO_UPLOADS_ENABLED`) turns uploads off without a deploy.

**E14-5 Demo billing:** the plans page and Stripe Checkout in test mode, showing the test-card hint. No real charges are possible in the demo environment.

---

## Non-functional requirements

| Area | Requirement |
|---|---|
| Time to value | Sign-up to first processed invoice: median under 15 minutes. No step requires contacting us |
| Latency | Email received to Ready or Exceptions: under 3 minutes at p95 |
| Accuracy | Eval gates in doc 07; zero-edit rate 60%+ by the end of shadow week on the demo and sandbox data |
| Correctness | Zero bills posted that a customer must delete because of our error. Every posted bill is traceable to its email, document, extraction, edits and approver |
| Cost | Model cost under $0.15 per invoice; demo model spend under a fixed daily cap |
| Demo | Workspace ready under 5 seconds; 50 concurrent demo workspaces without slowing down |
| Availability | Intake never loses mail: store first, process after |
| Security | Doc 09. Tenant isolation tested on every PR. The demo environment is separate from any customer data |
| Data | Money as decimal strings or `numeric`, never floating point |
