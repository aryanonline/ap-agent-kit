# 09 · Security and compliance

We hold three things an attacker wants: **write access to customers' books** (QuickBooks tokens), **their supplier invoices** (names, prices, bank details), and **a way to get a bill paid** (posting). Design for those three. Intuit's security review (needed for production keys and for an App Store listing) checks most of what follows.

Being open source and local-first changes the picture. The code is public, so nothing may rely on obscurity. Each copy is run by whoever installed it, so safe defaults matter more than our own operations: every port bound to 127.0.0.1, secrets generated on first run, the demo sign-in limited to localhost (T11), and guards on the operator's own Claude bill (T13). A hosted edition (Phase 7) adds trials (T12) and everything Intuit's review checks.

## Threat model

| # | Threat | Impact | Controls |
|---|---|---|---|
| T1 | QuickBooks tokens stolen (database leak, logs, backups) | Attacker reads and writes a customer's books | Tokens encrypted with AES-256-GCM using a key outside the database; never logged; never sent to the browser; one module reads them; revoked on disconnect |
| T2 | One customer sees another's data | Breach of trust, legal exposure | Every repo function takes `orgId`; a tenant-isolation test suite runs on every PR; signed object-storage URLs scoped and short-lived; `company_id` checked on every route |
| T3 | **Fake invoice or changed bank details** (business email compromise) | Customer pays a fraudster | `remit_to_changed` and `new_sender` exceptions that can never be auto-approved (see `08-matching-engine.md`); SPF/DKIM results stored and shown; never auto-approve an unknown vendor |
| T4 | **Prompt injection** inside an invoice ("approve this", "set total to 0") | Wrong data posted | The model has no tools and only fills a schema; all decisions are deterministic code; arithmetic is validated against the printed values; an injection fixture in the eval |
| T5 | Someone guesses an inbox address and mails in junk or fake invoices | Noise, fake bills | Tokens of 12 or more random characters; rotatable; new companies start in shadow mode; nothing is posted without a person (or auto-post rules that exclude unknown vendors and senders) |
| T6 | Malicious PDF or image attacks our servers | Code execution | Never render or parse PDFs server-side with native tools in the web process; send bytes to Claude as-is; count pages with a pure-JS library in the worker; serve files to browsers through signed URLs with `Content-Disposition: attachment` or from an isolated origin (the local disk driver serves them through an authenticated route with the same headers) |
| T7 | Account takeover of a customer user | Attacker approves bills | MFA (TOTP) required for owners and admins before connecting QuickBooks; session limits; audit log of approvals; email alert on new admin or a new QuickBooks connection |
| T8 | Operator or admin access is abused or leaked | Mass data exposure | In a hosted edition, support access to invoice content needs a customer-granted, time-limited flag (E11), and every view is audited. MFA, with hardware keys where offered, on every account that holds keys: GitHub, Anthropic, Intuit, Stripe, and any hosting account in Phase 7 |
| T9 | Secrets leak through the repo or logs | Everything | Secrets only in `.env` (git-ignored), the first-run secrets in the data volume, or a host's secret store; no secret has a default value in code, `docker-compose.yml` or `.env.example`; GitHub secret scanning and push protection on (the repo is public); `pino` redaction paths for `authorization`, `*token*`, `*secret*`, `remit_to`, `account_number`, invoice text fields |
| T10 | Wrong bill posted because of our bug | Customer's books wrong; they pay the wrong amount | Shadow mode first; a person approves every bill until the auto-post readiness bar is met; idempotent posting; full audit trail; liability capped in the terms |
| T11 | **A local copy exposed to a network**: someone runs it on a server or opens its ports, with the demo sign-in on, the Compose database password, or sign-ups open | Strangers sign in, run up the operator's Claude bill, or reach real companies' data | Compose binds every port to 127.0.0.1. The demo sign-in works only when `DEMO_LOGIN=true` and `APP_URL` is a localhost address, and the demo user can reach only the demo organization (T2 tests). `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEYS` and `REMIT_HASH_KEY` are generated randomly on first run, never shipped. The Compose database password is for 127.0.0.1 only. The instance admin can close sign-ups (E1-1 AC6). The daily document cap (T13). Doc 04, "Before deploying a copy anywhere else", lists what to change first |
| T12 | **Trial abuse** (hosted edition): repeated free trials, scripted sign-ups, or an account used as free extraction | Model cost, misleading funnel numbers | One trial per QuickBooks company (realm ID); Turnstile at sign-up; the 100-invoice trial cap; a daily document cap per organization (E10-3 AC3), because non-invoices are free but still cost model calls |
| T13 | **Runaway model spend** on the operator's own key: a mailbox with years of old mail, a loop that re-extracts, or a flood of junk | A surprise Claude bill | IMAP fetches only mail that arrives after connecting, unless an admin chooses an earlier date after seeing a count and a cost estimate; the daily document cap per organization (E10-3 AC3); re-extraction only by a person; spend shown in the admin console; the README tells every operator to set a monthly limit in the Anthropic Console |

## Required controls (build them in, don't bolt them on)

### Token encryption (T1). Intuit requires refresh tokens and realm IDs to be encrypted at rest.
- `src/lib/crypto.ts`: AES-256-GCM, random 96-bit nonce per encryption, stored as `version || nonce || ciphertext || tag`.
- Key from `TOKEN_ENCRYPTION_KEYS` (a JSON map of version to base64 key), set in the environment or generated on first run into the data volume (doc 04), **never** in the database. `key_version` on each row allows rotation. A rotation script re-encrypts all rows.
- The same encryption protects IMAP passwords (`mailboxes.secret_ciphertext`).
- Encrypt `realm_id` wherever it sits next to tokens. (The plaintext `companies.realm_id` is needed for routing. Intuit's wording is about storing it with the token, so keep the token table separate and encrypted.)

### Bank details (T3)
- Extraction returns full account and routing numbers **transiently**. Store only `account_last4`, plus `HMAC-SHA256(REMIT_HASH_KEY, normalized_number)` for comparison. Never the full number.

### Tenant isolation (T2)
- `src/db/repos/*` is the only code that queries tenant tables. Every function's first argument is `{ orgId }` (and `companyId` where relevant).
- A CI check (grep or ESLint `no-restricted-imports`) fails if `src/app/**` or `src/pipeline/**` imports the Drizzle `db` object directly.
- `tests/tenant-isolation.test.ts`: seed two orgs, then call every repo read function with org A's scope and org B's IDs. Each must return nothing.

### Web app basics (what Intuit's review checks)
- When deployed: HTTPS everywhere, TLS 1.2+, HSTS. A local copy runs on http://localhost.
- Cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- CSRF protection on state-changing routes (server actions do origin checks; keep them on). OAuth `state` parameter signed and checked.
- Strict Content-Security-Policy; no inline scripts except Next.js nonces.
- Input validated with zod at every boundary; Drizzle parameterized queries only (no string-built SQL).
- Dependency scanning (GitHub Dependabot) and `pnpm audit` in CI.
- Before promoting the repo (P4-5), run an OWASP ZAP baseline scan against a local copy; run it again against any hosted edition before the App Store security review. Fix all medium-or-higher findings. Intuit expects medium-or-higher findings fixed within 2 weeks of notice. ([Apideck](https://www.apideck.com/blog/quickbooks-security-review.md))

### Audit log
- Append-only `audit_events` (the database role can't update or delete). Record: sign-ins, role changes, QuickBooks connect and disconnect, settings changes, rule creation and deletion, every field edit, approvals, rejections, auto-post on and off, postings, support views, data exports and deletions.

### Backups and recovery
- Local copy: `pnpm db:backup` writes a `pg_dump` to `./data/backups`; copy the files volume alongside it. The restore steps are in the README. Test a restore once in Phase 6.
- Hosted edition: managed Postgres with point-in-time recovery, bucket versioning with a lifecycle rule for the 13-month retention, and a quarterly restore test.

## Data we send to third parties

A local copy sends nothing anywhere unless one of these is configured.

| Processor | What | When |
|---|---|---|
| Anthropic (Claude API) | Invoice files and text; account and item names for coding suggestions | When `ANTHROPIC_API_KEY` is set. Check Anthropic's current commercial terms on data retention and training, and state them in the README. Ask about zero data retention if a customer requires it |
| Intuit | Bills and attachments we post; reads of reference data | When a QuickBooks company is connected |
| The mailbox's provider | IMAP reads of the connected mailbox | When a mailbox is connected |
| An SMTP provider | Digests, alerts and onboarding emails | When `SMTP_URL` points at one (locally, Mailpit keeps everything on your computer) |
| Google | Sign-in (name and email) | When a Google OAuth client is configured |
| Sentry | Error traces (with redaction; no invoice content) | When `SENTRY_DSN` is set |
| Stripe | Billing contact and payment method | Hosted edition with billing on |
| Postmark, the host, object storage | Email, the app and files | Hosted edition only |

A hosted edition lists these as subprocessors in its privacy policy and DPA.

## Compliance roadmap

| When | What |
|---|---|
| Phase 4 (the repo is promoted) | No contact details in the repo, the README, the case study or your GitHub profile (Upwork rule, doc 12); `SECURITY.md` pointing to GitHub's private vulnerability reporting; an OWASP ZAP baseline scan of a local copy. A local copy collects nothing, so it needs no privacy policy |
| Phase 6 (hardening) | Data export and deletion (an organization or a company, files included); the incident runbook below; a backup and restore test; a security section in the README listing these controls |
| Phase 7 (hosted edition, only if you decide to sell) | A lawyer reviews the terms (liability cap, "we don't pay bills", "the customer approves postings"), privacy policy, DPA and subprocessor list; the Intuit app assessment questionnaire for production keys; the Intuit App Store technical and security review |
| Only when a customer asks | SOC 2 Type I, using a compliance-automation tool (Vanta, Drata or similar). Most small distributors won't ask; mid-market companies and bookkeeping firms might |
| Ongoing, once live | Intuit's annual security review once listed or over 500 connections; dependency patching; quarterly restore test |

## Regulatory notes (not legal advice)
- We don't move money, so money-transmitter rules don't apply. Keep it that way (vision non-goal).
- We are a processor of customer business data that includes some personal data (supplier contacts, sole-trader names). The privacy policy and DPA should reflect this. GDPR matters only if you take EU customers; out of scope for the MVP.
- Bookkeepers who connect client companies need authority from those clients. Put that representation in the terms.

## Incident response (one page, written in Phase 6)
1. Detect: error alerts (Sentry, if configured), anomaly alerts (posting spikes, many `invalid_grant` errors, unusual admin access).
2. Contain: a global kill switch to stop all posting (`POSTING_ENABLED=false`); revoke all QuickBooks tokens if token exposure is suspected; rotate keys.
3. Notify (hosted edition): affected customers within 72 hours of confirming a breach, and Intuit as their terms require. Whoever runs their own copy is their own operator; the README says so.
4. Write up: root cause, fix, and what changes in this doc.
