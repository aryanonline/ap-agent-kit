# 09 · Security and compliance

We hold three things an attacker wants: **write access to customers' books** (QuickBooks tokens), **their supplier invoices** (names, prices, bank details), and **a way to get a bill paid** (posting). Design for those three. Intuit's security review (needed for production keys and for an App Store listing) checks most of what follows.

Being self-serve adds two more surfaces: anyone can start a trial, and anyone can create a demo workspace and upload a file to it (T11, T12).

## Threat model

| # | Threat | Impact | Controls |
|---|---|---|---|
| T1 | QuickBooks tokens stolen (database leak, logs, backups) | Attacker reads and writes a customer's books | Tokens encrypted with AES-256-GCM using a key outside the database; never logged; never sent to the browser; one module reads them; revoked on disconnect |
| T2 | One customer sees another's data | Breach of trust, legal exposure | Every repo function takes `orgId`; a tenant-isolation test suite runs on every PR; signed object-storage URLs scoped and short-lived; `company_id` checked on every route |
| T3 | **Fake invoice or changed bank details** (business email compromise) | Customer pays a fraudster | `remit_to_changed` and `new_sender` exceptions that can never be auto-approved (see `08-matching-engine.md`); SPF/DKIM results stored and shown; never auto-approve an unknown vendor |
| T4 | **Prompt injection** inside an invoice ("approve this", "set total to 0") | Wrong data posted | The model has no tools and only fills a schema; all decisions are deterministic code; arithmetic is validated against the printed values; an injection fixture in the eval |
| T5 | Someone guesses an inbox address and mails in junk or fake invoices | Noise, fake bills | Tokens of 12 or more random characters; rotatable; new companies start in shadow mode; nothing is posted without a person (or auto-post rules that exclude unknown vendors and senders) |
| T6 | Malicious PDF or image attacks our servers | Code execution | Never render or parse PDFs server-side with native tools in the web process; send bytes to Claude as-is; count pages with a pure-JS library in the worker; serve files to browsers through signed URLs with `Content-Disposition: attachment` or from an isolated origin |
| T7 | Account takeover of a customer user | Attacker approves bills | MFA required for owners and admins (Clerk); session limits; audit log of approvals; email alert on new admin or a new QuickBooks connection |
| T8 | Our own admin access is abused or leaked | Mass data exposure | Support access to invoice content needs a customer-granted, time-limited flag (E11); every view is audited; hardware-key MFA on every infrastructure account (Render, R2, Postmark, Anthropic, Stripe, Intuit, GitHub, domain registrar) |
| T9 | Secrets leak through the repo or logs | Everything | Secrets only in Render environment groups; `.env*` in `.gitignore`; GitHub secret scanning on; `pino` redaction paths for `authorization`, `*token*`, `*secret*`, `remit_to`, `account_number`, invoice text fields |
| T10 | Wrong bill posted because of our bug | Customer's books wrong; they pay the wrong amount | Shadow mode first; a person approves every bill until the auto-post readiness bar is met; idempotent posting; full audit trail; liability capped in the terms |
| T11 | **Public demo abused**: cost attacks through uploads, personal or illegal content uploaded, or the demo used as a way into production | Model bills, legal exposure, a breach path | A **separate environment** with its own database, bucket, Postmark server and Claude key (hard monthly spend cap), Stripe test keys and development QuickBooks keys only; no shared secrets or network path to production. Turnstile on workspace creation; 5 workspaces per IP per hour and 500 a day; upload quotas and a global daily cap (E14-4); kill switches `DEMO_ENABLED` and `DEMO_UPLOADS_ENABLED`; an upload notice ("don't upload documents containing personal data; everything is deleted after 24 hours"); workspaces and their files deleted after 24 hours; workspace isolation covered by the T2 test suite |
| T12 | **Trial abuse**: repeated free trials, scripted sign-ups, or an account used as free extraction | Model cost, misleading funnel numbers | One trial per QuickBooks company (realm ID); Turnstile at sign-up; the 100-invoice trial cap; a daily document cap per organization (E10-3 AC3), because non-invoices are free but still cost model calls |

## Required controls (build them in, don't bolt them on)

### Token encryption (T1). Intuit requires refresh tokens and realm IDs to be encrypted at rest.
- `src/lib/crypto.ts`: AES-256-GCM, random 96-bit nonce per encryption, stored as `version || nonce || ciphertext || tag`.
- Key from `TOKEN_ENCRYPTION_KEYS` (a JSON map of version to base64 key) in Render's secret store, **not** in the database. `key_version` on each row allows rotation. A rotation script re-encrypts all rows.
- Encrypt `realm_id` wherever it sits next to tokens. (The plaintext `companies.realm_id` is needed for routing. Intuit's wording is about storing it with the token, so keep the token table separate and encrypted.)

### Bank details (T3)
- Extraction returns full account and routing numbers **transiently**. Store only `account_last4`, plus `HMAC-SHA256(REMIT_HASH_KEY, normalized_number)` for comparison. Never the full number.

### Tenant isolation (T2)
- `src/db/repos/*` is the only code that queries tenant tables. Every function's first argument is `{ orgId }` (and `companyId` where relevant).
- A CI check (grep or ESLint `no-restricted-imports`) fails if `src/app/**` or `src/pipeline/**` imports the Drizzle `db` object directly.
- `tests/tenant-isolation.test.ts`: seed two orgs, then call every repo read function with org A's scope and org B's IDs. Each must return nothing.

### Web app basics (what Intuit's review checks)
- HTTPS everywhere, TLS 1.2+, HSTS.
- Cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSRF protection on state-changing routes (server actions do origin checks; keep them on). OAuth `state` parameter signed and checked.
- Strict Content-Security-Policy; no inline scripts except Next.js nonces.
- Input validated with zod at every boundary; Drizzle parameterized queries only (no string-built SQL).
- Dependency scanning (GitHub Dependabot) and `pnpm audit` in CI.
- Before the demo goes public (P4) and again before the App Store security review: run an OWASP ZAP baseline scan against staging, and fix all medium-or-higher findings. Intuit expects medium-or-higher findings fixed within 2 weeks of notice. ([Apideck](https://www.apideck.com/blog/quickbooks-security-review.md))

### Audit log
- Append-only `audit_events` (the database role can't update or delete). Record: sign-ins, role changes, QuickBooks connect and disconnect, settings changes, rule creation and deletion, every field edit, approvals, rejections, auto-post on and off, postings, support views, data exports and deletions.

### Backups and recovery
- Render Postgres with point-in-time recovery. Test a restore into staging once in Phase 6, and quarterly after going live.
- R2 bucket versioning on, with a lifecycle rule for the 13-month retention.

## Data we send to third parties

| Processor | What | Why |
|---|---|---|
| Anthropic (Claude API) | Invoice files and text; account and item names for coding suggestions | Extraction. Check Anthropic's current commercial terms on data retention and training, and state them on your security page. Ask about zero data retention if a customer requires it. |
| Postmark | Inbound and outbound email | Intake and notifications |
| Cloudflare R2 | Raw emails and invoice files | Storage |
| Render | Database and app hosting | Hosting |
| Intuit | Bills and attachments we post | The product's purpose |
| Clerk | User identity | Auth |
| Stripe | Billing contact and payment method | Billing |
| Sentry | Error traces (with redaction; no invoice content) | Debugging |

List these as subprocessors in the privacy policy and DPA.

## Compliance roadmap

| When | What |
|---|---|
| Phase 4 (the demo goes public) | A privacy notice and terms for the demo site: what happens to uploads, the 24-hour deletion, no personal data please. The portfolio-linked site shows no contact details (Upwork rule, doc 12). OWASP ZAP baseline scan |
| Phase 6 (hardening) | DPA template; data export and deletion on request (deleted within 30 days); a security page listing these controls; the incident runbook below; a restore test |
| Phase 7 (go live, only if you decide to sell) | A lawyer reviews the terms (liability cap, "we don't pay bills", "the customer approves postings"), privacy policy, DPA and subprocessor list; the Intuit app assessment questionnaire for production keys; the Intuit App Store technical and security review |
| Only when a customer asks | SOC 2 Type I, using a compliance-automation tool (Vanta, Drata or similar). Most small distributors won't ask; mid-market companies and bookkeeping firms might |
| Ongoing, once live | Intuit's annual security review once listed or over 500 connections; dependency patching; quarterly restore test |

## Regulatory notes (not legal advice)
- We don't move money, so money-transmitter rules don't apply. Keep it that way (vision non-goal).
- We are a processor of customer business data that includes some personal data (supplier contacts, sole-trader names). The privacy policy and DPA should reflect this. GDPR matters only if you take EU customers; out of scope for the MVP.
- Bookkeepers who connect client companies need authority from those clients. Put that representation in the terms.

## Incident response (one page, written in Phase 6)
1. Detect: Sentry alerts, anomaly alerts (posting spikes, many `invalid_grant` errors, unusual admin access).
2. Contain: a global kill switch to stop all posting (`POSTING_ENABLED=false`); revoke all QuickBooks tokens if token exposure is suspected; rotate keys.
3. Notify: affected customers within 72 hours of confirming a breach, and Intuit as their terms require.
4. Write up: root cause, fix, and what changes in this doc.
