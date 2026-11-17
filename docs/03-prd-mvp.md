# 03 · PRD: MVP scope and acceptance criteria

**MVP** means everything a company running its own copy needs to go from install and sign-up to posting bills, with nobody from our side involved; the zero-key demo company for the portfolio; and billing built in Stripe test mode for a possible hosted edition. In `11-build-plan.md` that's Phases 0 to 6.

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
| Demo company | An organization seeded from `fixtures/demo` with fictional data, replayed extractions and a simulated QuickBooks. Reset at any time | (ours) |
| Instance admin | The person who runs a copy: the first user to sign up on it | (ours) |
| Hosted edition | A deployed copy run as a service for other companies (optional, Phase 7) | (ours) |

## In scope

Self-serve sign-up and onboarding · email intake · extraction of header and line items · validation · QuickBooks reference sync · auto-setup from QuickBooks history · vendor, PO, price and duplicate matching · fraud signals · shadow mode with a comparison report · review and exceptions UI · posting bills with PDF attached and PO linked · learning from corrections · digest and alerts · metrics · trial, plans, Stripe billing and self-serve cancellation (built in test mode, off by default) · help center · auto-post (opt-in) · admin console · the demo company and the one-command local install.

## Out of scope (MVP)

Setup calls or done-for-you configuration · hosting it for other companies (the hosted edition is Phase 7) · OAuth mailboxes for Microsoft 365 and Google Workspace (Phase 8) · Xero, NetSuite, QuickBooks Desktop · paying bills · multi-step approval chains · posting vendor credits · multi-currency · non-English invoices · supplier portals, EDI, paper mail scanning · mobile apps · 3-way match with receipts · public API · the partner workspace for bookkeepers (Phase 7).

---

## E1. Accounts and companies

**E1-1 Sign up and sign in.**
- AC1: Sign-up (email and password; Google too when a Google OAuth client is configured) creates an organization with the user as `owner`. The first user on a copy also becomes its instance admin (E11).
- AC2: Owners and admins must enrol in MFA before connecting QuickBooks.
- AC3: Sessions expire after 12 hours idle; cookies are `Secure` and `HttpOnly`.
- AC4: Hosted edition (billing on): the user accepts the terms during sign-up; the terms version, time and user are recorded. A copy you run yourself shows no terms.
- AC5: Hosted edition: a trial starts (E10-1).
- AC6: The instance admin can close sign-ups (`SIGNUPS_ENABLED=false`, or a setting), so a copy reachable on a network isn't open to strangers. Invitations still work.

**E1-2 Invite teammates** with role `admin` or `reviewer`.
- AC1: Reviewers can approve, edit and reject invoices, but can't change settings, connections or billing.
- AC2: Role changes are written to the audit log.

**E1-3 Connect QuickBooks.** (The onboarding experience around it is E13-2.)
- AC1: OAuth 2.0 with only the `com.intuit.quickbooks.accounting` scope.
- AC2: On success, store realmId, company name and edition, then queue a full sync and the history backfill.
- AC3: If the edition has no purchase orders, the UI says so and explains which checks will run instead.
- AC4: Tokens are stored encrypted (doc 09) and never sent to the browser.
- AC5: If the QuickBooks user can't authorize apps (not an admin), show a plain explanation and an "Invite your QuickBooks admin" action.
- AC6: Hosted edition: a QuickBooks company already on a trial or paid plan in another organization can't start a second trial.

**E1-4 Disconnect and reconnect.**
- AC1: Disconnecting revokes the token with Intuit, deletes it, and pauses posting.
- AC2: A refresh failure (`invalid_grant`) marks the company `needs_reconnect`, pauses posting and emails the admins a reconnect link.
- AC3: Invoices keep arriving and being read while disconnected; they wait for posting.

## E2. Intake

**E2-1 Inbox address per company.** Unique and unguessable: `ap-<12+ random chars>@<INBOUND_DOMAIN>` (default `in.localhost`, served by the built-in SMTP listener; a real domain in a hosted edition).
- AC1: Admins can view and rotate it. The old address works for 7 more days, then rejects mail.
- AC2: Mail to an unknown address is refused (by the SMTP listener) or dropped (from Postmark), and logged without its content.

**E2-2 Receive email** through any intake route: the built-in SMTP listener, an IMAP mailbox (E2-4), or Postmark inbound in a hosted edition (doc 07).
- AC1: Accepts PDF, PNG, JPG/JPEG and WEBP attachments up to 20 MB each. Other formats, including HEIC phone photos, are archived with reason `unsupported_format` and shown in the UI. Nothing is emailed back to the sender.
- AC2: Idempotent on the message ID for its route (Postmark's `MessageID`; the `Message-ID` header, or a hash of the raw message, for SMTP and IMAP); a redelivery creates no duplicate.
- AC3: Each attachment becomes one document; PDFs holding several invoices are split (E3-4).
- AC4: Store the SPF/DKIM results and the sender on the email record.
- AC5: Arrival (a webhook, the end of SMTP `DATA`, or an IMAP fetch) to stored-and-queued in under 5 seconds at p95.
- AC6: Gmail forwarding-confirmation emails are recognised, never processed as documents, and their code is shown in onboarding (E13-4).

**E2-3 Manual upload.** Drag and drop PDFs or images into a company's inbox. Same pipeline; source `upload`.

**E2-4 IMAP mailbox.**
- AC1: An admin connects one mailbox per company in Settings → Email: host, port, TLS, username and password. The password is encrypted at rest like QuickBooks tokens and never shown again.
- AC2: Only mail received after connecting is fetched, unless the admin picks an earlier date after seeing the message count and an estimated model cost.
- AC3: The mailbox is opened read-only: nothing is marked, moved or deleted. It's polled every 2 minutes, and each message is processed once (UID tracking plus the unique message ID).
- AC4: A login failure pauses the mailbox, emails the admins once, and shows the provider's fix: an app password for Gmail; for Microsoft 365, "not supported yet" with the alternatives (forward by hand, upload).
- AC5: No message content in logs.

## E3. Extraction

**E3-1 Classify:** `invoice`, `credit_memo`, `statement`, `quote_or_po`, `receipt`, `other`.
- AC1: Only `invoice` continues automatically. `credit_memo` goes to exceptions. The rest are archived with a reason and can be re-queued by hand.

**E3-2 Extract header and lines** to the schema in doc 07.
- AC1: Header: vendor name, address, email, phone, tax ID, remit-to details, invoice number, invoice and due dates, terms, PO numbers, currency, subtotal, tax, freight, total.
- AC2: Lines: description, supplier SKU, quantity, unit, unit price, amount, line PO reference, and kind (item, freight, fee, tax, discount, other).
- AC3: A multi-page invoice produces one invoice with all its lines in order.
- AC4: The output is schema-valid, or the document is `extraction_failed` with the reason. Nothing is ever partially saved.
- AC5: With no `ANTHROPIC_API_KEY`, documents outside the demo company stop at `extraction_failed` with reason `no_api_key`, shown in plain words with how to add a key. Re-running after adding one works.

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

**E7-1 Create the bill** on approval, in `approve` or `auto` posting mode only, through the company's ledger adapter (QuickBooks, or the demo ledger for the demo company).
- AC1: VendorRef, DocNumber, TxnDate, DueDate, terms, item or account lines, class, location, customer/job, and a private note linking back.
- AC2: Lines that matched a PO line are linked to it.
- AC3: The PDF is attached.
- AC4: Idempotent: a retry never creates a second bill (`requestid` plus a pre-post duplicate check).
- AC5: On success, store the bill ID, set `posted`, and show "View in QuickBooks".
- AC6: On failure, set `post_failed` with the QuickBooks error in plain words, and allow a retry. Retryable errors (429, 5xx) retry automatically with backoff, up to 5 times.

**E7-2 Latency:** approval to posted in under 60 seconds at p95.

## E8. Notifications

All email goes out over SMTP. On a local copy it lands in Mailpit unless `SMTP_URL` points at a real provider.

**E8-1 Daily digest** at 8 AM company time on weekdays: new exceptions with dollar impact, posting failures, Ready-queue size. Skipped if there's nothing to report.

**E8-2 Alerts to admins:** QuickBooks disconnected; no email for 3 business days; more than 3 posting failures in an hour.

## E9. Metrics

**E9-1 Company dashboard:** invoices received, zero-edit rate, exceptions by type, dollars flagged, median time from receipt to posted, estimated hours saved (invoices × minutes per invoice, default 4).

**E9-2 Monthly overcharge report** for the owner: dollars flagged by vendor and how each was resolved.

## E10. Trial and billing (hosted edition; off unless `BILLING_ENABLED=true`)

With billing off, the default, there are no trials, plans or invoice limits; only the daily document cap (E10-3 AC3) applies.

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
- AC3: Every document costs a model call, including those that turn out not to be invoices, so processing is capped per organization per day, **with billing on or off**: 500 by default (150 in a hosted trial), adjustable by the instance admin. Documents over the cap wait in the queue, and the admins get one email (T12 and T13 in doc 09).

**E10-4 Failed payments.** A banner for 7 days, then posting pauses; intake continues.

**E10-5 Test mode only.** Until Phase 7, only Stripe test keys are accepted: the app refuses to start with a live key. Demo organizations always have `billing_mode = none` and never create Stripe customers.

## E11. Operations (instance admin)

**E11-1 Admin console** for whoever runs the copy: pipeline status for every company, stuck documents, failed jobs, re-run any step, API usage, cost per invoice, and each company's auto-setup coverage (vendors ready, checks active) and onboarding progress.
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
- AC1: Shows the routes that work on this copy: connect a mailbox (IMAP, E2-4), upload or forward by hand, ask suppliers to send directly (to the connected mailbox), and, when an inbound domain is configured (hosted edition), forward to the company's own address with a copy button.
- AC2: **Gmail forwarding:** when Gmail's forwarding-confirmation email arrives by any route, its confirmation code appears on the onboarding screen within 10 seconds of arriving (for IMAP, of the next poll; the screen offers "Check now"). A filter query is generated from the vendors' known email domains.
- AC3: **Microsoft 365:** the instructions say that its mailboxes need OAuth for IMAP (not built yet) and that automatic external forwarding is often blocked (error 5.7.520), and link Microsoft's articles. If no mail arrives within 30 minutes of the user saying "rule created", show the troubleshooting panel with the alternatives.
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
- AC1: Emails on day 0 (welcome and next step), 1, 3 and 7, plus the trial emails in a hosted edition (E10-1).
- AC2: Triggered emails for each "stuck" signal in doc 02, Part 1. Each email is sent at most once per signal per company.
- AC3: Every email has a one-click unsubscribe, except security and billing notices.

**E13-8 Help center.** At least 12 articles: running it locally and adding your own keys, connecting QuickBooks, connecting a mailbox, Gmail, Microsoft 365, asking suppliers, price lists, tolerances, exceptions explained (one per type), shadow mode, auto-post, plans and billing (hosted edition), data and security, disconnecting and deleting data. Kept as Markdown in the repo and rendered in the app, so they work offline. Linked in context from the UI.

## E14. The demo company and the local quick start (portfolio)

**E14-1 The demo company on first run.**
- AC1: `docker compose up` on an empty database seeds the demo organization (`kind = demo`), its company (`ledger = demo`) and a demo user from `fixtures/demo` (doc 12): a fictional distributor with vendors, items, open POs, a price list, price history, and 20 invoices covering every scenario, with stored extraction results (no model calls).
- AC2: The 20 invoices arrive through the built-in SMTP listener (doc 07, A1) in scenario order, and go through the real pipeline: replayed extraction, real evaluation.
- AC3: **Sign in as the demo user** appears only when `DEMO_LOGIN=true` and `APP_URL` is a localhost address; otherwise the button is absent and the demo user can't sign in. The demo user belongs only to the demo organization and is never the instance admin.
- AC4: Every page in the demo company shows a "Demo company: fictional data" label.
- AC5: **Reset demo company** (in Settings, for admins of the demo organization, and `pnpm demo:reset`) restores the seeded state, files included, in under 30 seconds.
- AC6: The demo company can't connect QuickBooks. Real companies in the same copy are untouched by it and by its reset (covered by the tenant-isolation tests).

**E14-2 Guided tour:** three steps (an overcharge flagged, approve a clean invoice, see the resulting bill), using the real UI. Can be dismissed and restarted.

**E14-3 Simulated QuickBooks.** The demo company uses the demo ledger adapter.
- AC1: Approving "posts" to the simulated ledger. The posted bill is shown as a QuickBooks-style bill, with a toggle that shows the exact JSON payload the real integration would send (the same payload builder as E7-1).
- AC2: Billed quantities on the demo POs update, so a second invoice against the same PO line behaves correctly.

**E14-4 Bring your own invoice.**
- AC1: Uploading a document into the demo company runs real extraction with the copy's `ANTHROPIC_API_KEY`, and real checks against the demo company's data.
- AC2: With no key set, the upload panel says what's needed and links to the README section. Nothing fails silently.
- AC3: The daily document cap applies (E10-3 AC3).
- AC4: A notice before upload: "Files stay on this computer. Their contents are sent to Anthropic's API to be read."

**E14-5 The quick start keeps working.**
- AC1: A CI job on every pull request starts the stack from a clean checkout with no secrets and runs a Playwright script: sign in as the demo user, open the +$65.00 price variance, approve a clean invoice, open the simulated bill.
- AC2: The commands CI runs are the README's commands.
- AC3: Prebuilt images (amd64 and arm64) are published to GitHub Container Registry from `main`, so `docker compose up` doesn't have to build from source. It builds locally if the image can't be pulled.

**E14-6 Billing demo (optional).** With `BILLING_ENABLED=true` and Stripe test keys, the plans page and Stripe Checkout work in test mode, with the test-card hint, and the Stripe CLI forwards webhooks to localhost. No real charge is possible (E10-5).

---

## Non-functional requirements

| Area | Requirement |
|---|---|
| Time to value | `git clone` to the demo company under 5 minutes with prebuilt images; sign-up to first processed invoice: median under 15 minutes. No step requires contacting us |
| Latency | Email received to Ready or Exceptions: under 3 minutes at p95 |
| Accuracy | Eval gates in doc 07; zero-edit rate 60%+ by the end of shadow week on the demo and sandbox data |
| Correctness | Zero bills posted that a customer must delete because of our error. Every posted bill is traceable to its email, document, extraction, edits and approver |
| Cost | Model cost under $0.15 per invoice; the demo company costs nothing (replayed extractions) |
| Demo | Demo company reset in under 30 seconds; the quick start passes in CI on every pull request |
| Availability | Intake never loses mail: store first, process after, on every route |
| Security | Doc 09. Tenant isolation tested on every PR. The demo sign-in works only on localhost; every port is bound to 127.0.0.1 |
| Portability | Runs on Windows (Docker Desktop with WSL 2), macOS and Linux, on amd64 and arm64 |
| Data | Money as decimal strings or `numeric`, never floating point |
