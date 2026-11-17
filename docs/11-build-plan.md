# 11 · Build plan

Phases are gated: **don't start a phase until the previous gate is met.** The order puts what an Upwork client can see first. A portfolio version goes live at week 8, the one-command local demo at week 10, and the rest of the sale-ready product after that. Everything runs locally: nothing in Phases 0 to 6 needs hosting, a domain or any paid account beyond Claude usage.

| Phase | Weeks* | Goal | Gate to move on |
|---|---|---|---|
| **0. Prove the core** | 1–2 | Extraction and matching proven on the demo dataset and on real invoices | Eval gates pass; demo dataset results match exactly; real-world check recorded |
| 1. Foundations | 3–4 | Auth, database, jobs, QuickBooks connect and sync, email intake, the Docker Compose stack | Sandbox company connected from localhost; a fixture email sent to the SMTP listener lands as a stored document; `docker compose up` works from a fresh clone |
| 2. Core loop | 5–6 | Extract → evaluate → review UI | All 20 demo invoices flow into the review UI with the expected exceptions |
| 3. Posting + **portfolio v1** | 7–8 | Approve → bill in the QuickBooks sandbox; video, screenshots, case study, README | **Portfolio item live on Upwork** |
| 4. Zero-key demo + **portfolio v2** | 9–10 | The demo company on first run, simulated ledger, own-invoice upload, the quick start tested in CI, prebuilt images | 3 developers who've never seen the repo get from `git clone` to a flagged overcharge unaided in under 10 minutes |
| 5. Self-serve onboarding | 11–13 | Sign-up to posting with no human help | 3 first-time users reach a posted sandbox bill unaided in under 15 minutes |
| 6. Billing, ops, hardening + **portfolio v3** | 14–15 | Digests, admin console, auto-post, security, backups; trial and Stripe billing in test mode, off by default | Security checks done; a backup restored; full checkout in test mode with billing on; 3-minute walkthrough published |
| 7. Hosted edition (optional) | — | A deployed copy: domain, Postmark, production keys, App Store, Stripe live, legal, partners | Only if you decide to sell; gates in doc 10 |
| 8. Later | — | OAuth mailboxes, Xero, vendor credits and more | Demand |

*At 20 to 30 hours a week.

## How to run a task with Claude Code

Each task is sized for one Claude Code session and one reviewable pull request. Start a session with:

```
Implement task <ID> from docs/11-build-plan.md.
Read CLAUDE.md and the docs the task lists first. Make a short plan, then build it
with tests. Stop when every "Done when" item passes, run the checks in CLAUDE.md,
tick the task's box in this file, and add anything you decided or discovered to docs/decisions.md.
```

Rules: one task per branch and PR. If a task is bigger than a session, split it in this file first, then build. Tasks marked **(you)** are yours, not Claude Code's.

---

## Phase 0: Prove the core (weeks 1–2)

Everything in `src/core/` and `fixtures/demo/` survives into the product. The scripts are throwaway.

- [x] **P0-1 (you) · Accounts and name.** Intuit Developer account and app (development keys), and a **dedicated sandbox company** for the demo. Anthropic API key with a monthly spend limit. A GitHub repo (public, by decision). The product name: Line Beagle. Done 2026-11-16; no domain is needed while it runs locally (`docs/decisions.md`).
- [x] **P0-2 · Repo bootstrap.**
  Build: pnpm, TypeScript strict, Vitest, ESLint + Prettier, GitHub Actions running `pnpm check` (typecheck, lint, test). `.gitattributes` forcing LF line endings, so a Windows checkout doesn't break scripts inside the containers. Node pinned (`.nvmrc` and `engines`). `.env.example` with every optional key empty and a comment saying where to get it, using the names in `docs/decisions.md` (P0-1). "AP Agent" renamed to Line Beagle in code. `src/core/money.ts` (decimal.js: parse, add, multiply, round half-even to cents, compare with tolerance) with property tests.
  Done when: CI is green on a PR; `money.ts` is 100% covered. Done 2026-11-17 (`docs/decisions.md`).
- [ ] **P0-3 · Extraction client and CLI.** Docs: 07. Load the `claude-api` skill first.
  Build: `src/core/extraction-schema.ts`; `src/integrations/claude/extract.ts` (structured outputs, refusal handling, cost); `pnpm extract <file>` prints the JSON, tokens and cost.
  Done when: it runs on 3 sample PDFs and an image; schema failures and refusals return typed errors; no document content is logged.
- [ ] **P0-4 · Eval fixtures and mini eval.** Docs: 07 Part C.
  Build: `scripts/make-fixtures.ts` makes 10 synthetic eval invoices (5 layouts, including a multi-invoice PDF and the prompt-injection fixture) with expected JSON; `pnpm eval` reports header-field accuracy and cost.
  Done when: `pnpm eval` runs on all 10 and prints a table.
- [ ] **P0-5 · The demo dataset.** Docs: 12 (demo dataset).
  Build: `fixtures/demo/`: the Harbor Lane Supply company, 12 vendors, 25 items, 8 open POs, a price list, 12 months of generated bill history, and the 20 scenario invoices as PDFs (at least 6 layouts) with `expected/<n>.json` (extraction, exceptions, dollar impact). Generated by `scripts/make-demo-dataset.ts`, deterministic from a seed.
  Done when: regenerating gives byte-identical output; every scenario in doc 12 has a PDF and an expected file.
- [ ] **P0-6 · Validate, match and the Overcharge Report.** Docs: 08 (steps 1, 2, 4, 5, 6, 8; coding and fraud come in Phase 2).
  Build: `src/core/validate.ts`, `src/core/match.ts`, `src/core/exceptions.ts` on in-memory inputs. `scripts/proof-run.ts --dataset fixtures/demo` (or `--invoices <dir> --pos pos.csv | --prices prices.csv`) writes `report.md` and `report.csv` (doc 10, Appendix B format).
  Done when: golden tests pass for the in-scope demo scenarios; every flagged dollar reconciles with `expected/`.
- [ ] **P0-7 (you) · Real-world check.** Run `pnpm extract` and the proof run on 10 to 20 real invoices you're allowed to use (your own supplier bills, or public sample invoices whose licence allows it). Hand-check the results.
  Done when: accuracy per field is recorded in `docs/decisions.md`. These invoices become the private eval set (never committed).
- [ ] **P0-8 (you) · Gate review.** Record the eval numbers, the real-world accuracy, and the go or fix decision.
  **Gate:** header fields at least 95% exact on the real-world set, and lines at least 90%. If not, fix extraction before Phase 1, because a polished app on weak extraction makes a weak portfolio.

## Phase 1: Foundations (weeks 3–4)

- [ ] **P1-1 · App shell and auth.** Stories: E1-1 (AC1–3, AC6). Docs: 04, 05.
  Build: Next.js App Router, Tailwind, shadcn/ui; Better Auth in our Postgres (email and password, TOTP two-factor, organizations; read its current docs first, and record the table decision from doc 05 in `docs/decisions.md`); roles owner, admin and reviewer; the first user becomes instance admin; `SIGNUPS_ENABLED`; MFA enforced for owners and admins before sensitive actions; signed-in layout with a company switcher.
  Done when: sign up, create an org, invite a reviewer (the invitation lands in Mailpit); role checks enforced on a protected route (tested); sign-up refused when closed (tested).
- [ ] **P1-2 · Database, repos, tenant isolation.** Docs: 05, 09 (T2).
  Build: Drizzle and migrations for the tenancy tables; the `src/db/repos/` pattern; the `audit()` helper; the CI rule against direct `db` imports; the `tests/tenant-isolation.test.ts` harness; a first `docker-compose.yml` with Postgres and Mailpit (ports on 127.0.0.1) for local work, and a Postgres service in CI.
  Done when: the isolation test passes for every repo function; the CI rule fails a deliberately bad import.
- [ ] **P1-3 · Job worker.** Docs: 04 (Jobs).
  Build: `src/worker/index.ts` with pg-boss: handler registry, retries with backoff, singleton jobs, schedules, a failed-jobs view. `pnpm worker`.
  Done when: a demo job retries 3 times, shows as failed, and a re-run succeeds.
- [ ] **P1-4 · Token encryption and log redaction.** Docs: 09 (T1).
  Build: `src/lib/crypto.ts` (AES-256-GCM, key versions); a rotation script; logger redaction config; first-run generation of `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEYS` and `REMIT_HASH_KEY` into the data volume when they aren't set.
  Done when: tests cover round trip, a tampered ciphertext failing, rotation, a second start reusing the generated keys, and a redaction test showing tokens and passwords never reach log output.
- [ ] **P1-5 · Connect QuickBooks.** Stories: E1-3, E1-4. Docs: 06 (OAuth). Depends on P1-2, P1-4.
  Build: connect, callback and disconnect routes; signed `state`; token storage; refresh under a row lock; `invalid_grant` → `needs_reconnect`; revoke on disconnect; the not-an-admin error path (E1-3 AC5).
  Done when: the sandbox company connects end to end from http://localhost:3000; a concurrency test runs two refreshes and gets one rotation; disconnect deletes the tokens.
- [ ] **P1-6 · QuickBooks client.** Docs: 06.
  Build: `src/integrations/ledger/qbo/client.ts`: typed fetch, `QBO_MINOR_VERSION`, a per-company concurrency limit of 4, backoff, the error mapping with tests, `intuit_tid` logging, read-call counting. Define the `LedgerAdapter` interface.
  Done when: unit tests cover each error-table row against recorded responses.
- [ ] **P1-7 · Sandbox verification spike.** Docs: 06 (sandbox test plan).
  Build: `scripts/qbo-sandbox-check.ts` runs the checks in the sandbox test plan (the non-admin check is manual).
  Done when: the results are in `docs/decisions.md` and the VERIFY markers in doc 06 are resolved.
- [ ] **P1-8 · Reference data sync.** Stories: E4-1. Depends on P1-6.
  Build: `ref_*` tables, full sync, CDC every 30 minutes (including Bill), nightly open-PO refresh, edition detection, `sync_state`.
  Done when: the sandbox syncs; a vendor changed in the sandbox appears within one CDC cycle; read calls are counted.
- [ ] **P1-9 · Bill history backfill.** Stories: E4-2. Depends on P1-8.
  Build: 12 months of bills → `price_history`, `ref_bills` and `ref_bill_lines` (coding, for auto-setup); normalized descriptions; kept current from CDC.
  Done when: sandbox bills appear; re-running creates no duplicates.
- [ ] **P1-10 · Email intake: SMTP listener and storage.** Stories: E2-1, E2-2 (AC1–5). Docs: 07 Part A (A1).
  Build: the storage interface with the local disk driver (the S3 driver waits for Phase 7) and signed download URLs; the built-in SMTP listener in the worker; inbox tokens with rotation; `emails` and `documents`; the `email.ingest` job; attachment filtering; forwarded-sender parsing; `pnpm send-invoice <file> --to <address>`.
  Done when: sending 5 fixture emails (including the same message twice, an unknown address and a forwarded email) gives the right rows and no duplicates, and the files are on disk.
- [ ] **P1-11 · Docker Compose stack.** Docs: 04 (Environments, First run).
  Build: one multi-stage `Dockerfile` (web and worker run it with different commands); `docker-compose.yml` with web, worker, Postgres and Mailpit, every port bound to 127.0.0.1; `.env` passed through when it exists; migrations on start under an advisory lock; `/api/health`, which Compose waits on; Sentry only when `SENTRY_DSN` is set.
  Done when: from a fresh clone with no `.env`, `docker compose up` brings everything up healthy, and `pnpm send-invoice` against it stores a document. Checked on Windows (Docker Desktop) and on macOS or Linux; recorded in `docs/decisions.md`.

## Phase 2: Core loop (weeks 5–6)

- [ ] **P2-1 · Extraction job.** Stories: E3-1, E3-2, E3-4. Depends on P0-3, P1-10.
  Build: `document.extract`: `extractions` rows, splitting by page range, classification routing, `invoices` and `invoice_lines`, failure handling, re-run.
  Done when: a 3-invoice PDF makes 3 invoices; a statement is archived; a refusal or schema failure is visible and can be re-run.
- [ ] **P2-2 · Full eval.** Docs: 07 Part C.
  Build: 50+ fixtures across 15+ layouts; all metrics and gates; `--private` mode reading the real-world set (P0-7) from `EVAL_PRIVATE_DIR`, a folder outside the repo; a manually triggered CI workflow (it costs money).
  Done when: the baseline is recorded in `docs/decisions.md`; the gates pass.
- [ ] **P2-3 · Vendor resolution.** Stories: E5-1. Docs: 08 step 3.
  Done when: there's a table test for each method, including the free-mail exclusion.
- [ ] **P2-4 · Full matching.** Stories: E5-2, E5-3. Docs: 08 steps 4–6.
  Build: PO selection, line assignment, units via `item_aliases`, tolerance, open quantity, price lists by effective date, price history (median).
  Done when: there's a scenario test for each row of the price-source decision; property tests on tolerance pass; demo scenarios 1–9 and 13–16 produce their expected results.
- [ ] **P2-5 · Duplicates and fraud signals.** Stories: E5-4, E5-6. Docs: 08 steps 8–9, 09.
  Build: `core/duplicates.ts`, `core/fraud-signals.ts`; HMAC of remit-to numbers at save time.
  Done when: demo scenarios 10–12 pass; full account numbers are never written (asserted in a test).
- [ ] **P2-6 · Coding.** Stories: E5-5. Docs: 08 step 7, 07 (second use).
  Done when: model-suggested lines are always `needs_coding_review` (tested).
- [ ] **P2-7 · Evaluate job and routing.** Docs: 08 step 10, 04.
  Build: the `invoice.evaluate` job keyed on `revision`; re-evaluation on reference data changes; posting-mode aware.
  Done when: an edit bumps the revision and re-routes; a PO change re-evaluates open invoices.
- [ ] **P2-8 · Price list storage and simple upload.** Stories: E4-3. (The full wizard is P5-5.)
  Done when: a CSV in the documented format imports with versioning; a bad row shows its reason.
- [ ] **P2-9 · Review queues.** Stories: E6-1.
  Done when: it works with 1,000 seeded invoices at under 500 ms per page.
- [ ] **P2-10 · Invoice detail.** Stories: E6-2 (AC1–3, AC5–6).
  Build: PDF pane (signed URL), editable header and lines, exceptions with dollar impact, approve and reject with reasons, `field_edits` + audit.
  Done when: Playwright covers edit → re-evaluate → approve with a reason.
- [ ] **P2-11 · Learning loop.** Stories: E6-4.
  Done when: fixing one invoice makes the next invoice from that vendor resolve automatically (integration test).

## Phase 3: Posting and portfolio v1 (weeks 7–8)

- [ ] **P3-1 · Post bills.** Stories: E7-1, E7-2. Docs: 06. Depends on P1-7.
  Build: `invoice.post`: duplicate guard, a pure bill-payload builder (tested; reused by the demo ledger), `requestid`, attachment upload, PO line links, `ledger_postings`, error mapping, retries, "View in QuickBooks", the `POSTING_ENABLED` switch, and no posting in `shadow` mode.
  Done when: sandbox posting works for item, account and PO-linked lines; a forced timeout and retry creates no duplicate.
- [ ] **P3-2 · Fast review.** Stories: E6-3, E6-2 AC4.
  Done when: a clean invoice can be approved in under 20 seconds, keyboard only.
- [ ] **P3-3 · Metrics dashboard.** Stories: E9-1.
  Done when: the numbers reconcile with a SQL check on the seeded demo data.
- [ ] **P3-4 · Settings.** Stories: E1-2, E2-1 AC1.
  Build: tolerance presets and custom values, vendor defaults, allowed fees, tax handling, inbox address rotation, team management.
- [ ] **P3-5 · Manual upload.** Stories: E2-3.
- [ ] **P3-6 · Sandbox seed and reset scripts.** Docs: 12 (sandbox).
  Build: `scripts/seed-qbo-sandbox.ts` (demo dataset → sandbox vendors, items, POs, some history bills); `scripts/reset-qbo-sandbox.ts` (delete Line Beagle bills by marker; recreate used-up POs). Cope with Intuit's sample data in the sandbox, and settle the `.example` email question first (`docs/decisions.md`).
  Done when: seed → process all 20 demo invoices on a local copy connected to the sandbox → reset → seed again works with no leftovers.
- [ ] **P3-7 · End-to-end test against the sandbox.** `pnpm test:e2e:sandbox`: Playwright on a local copy connected to the sandbox: fixture email to the SMTP listener → extract → evaluate → approve → the bill exists in the sandbox. It needs your Intuit keys and a live connection, so you run it before each recording; CI runs the keyless demo-company version instead (P4-4).
- [ ] **P3-8 (you) · Video v1 and screenshots.** Docs: 12 (video, screenshots).
  Done when: a 60-second MP4 (captions burned in) and 6 screenshots exist, recorded on a local copy against the reset sandbox, with no real data on screen.
- [ ] **P3-9 (you) · Case study v1 and Upwork portfolio item.** Docs: 12.
  Build (Claude Code can help): the case study as `docs/case-study.md`, numbers from `pnpm eval`, no contact details; the README's first screen with screenshots and an honest status line.
  Done when: the portfolio item is published with thumbnail, video, screenshots, and links to the repo and the case study. Start tracking invites, repo visitors and clones.

## Phase 4: Zero-key demo and portfolio v2 (weeks 9–10)

- [ ] **P4-1 · The demo company on first run.** Stories: E14-1, E14-2. Docs: 12 (the demo company), 04 (First run).
  Build: `src/demo/`: seed the demo organization, company and user from `fixtures/demo` on an empty database; replayed extractions keyed by file SHA-256; `pnpm demo:send` through the SMTP listener; the localhost-only **Sign in as the demo user**; **Reset demo company** and `pnpm demo:reset`; the "Demo company: fictional data" label; the guided tour.
  Done when: on an empty database, `docker compose up` ends with all 20 invoices in their expected queues; a reset restores it in under 30 seconds; the demo sign-in is refused when `APP_URL` isn't a localhost address (tested); a real company in the same copy is untouched by a reset (tested).
- [ ] **P4-2 · Demo ledger adapter.** Stories: E14-3.
  Build: `src/integrations/ledger/demo/` implementing `LedgerAdapter`; the `demo_bills` table; PO billed-quantity updates; the QuickBooks-style bill view with the JSON payload toggle.
  Done when: the same evaluate-and-post integration tests pass against both the demo adapter and a recorded QuickBooks adapter.
- [ ] **P4-3 · Bring your own invoice.** Stories: E14-4, E3-2 AC5.
  Done when: with a key, an upload into the demo company goes through the real pipeline; without one, the upload panel explains how to add a key; the daily document cap is enforced (tested).
- [ ] **P4-4 · The quick start in CI, and prebuilt images.** Stories: E14-5.
  Build: a GitHub Actions workflow that, on every pull request, builds the image, starts the stack from a clean checkout with no secrets using the README's commands, and runs the Playwright tour (demo sign-in → the +$65.00 exception → approve a clean invoice → the simulated bill). On `main`, publish amd64 and arm64 images to GitHub Container Registry; `docker-compose.yml` pulls them and builds locally if it can't.
  Done when: the workflow is green and required for merging; a fresh clone reaches the demo company on Windows and on macOS or Linux using the published image (recorded in `docs/decisions.md`).
- [ ] **P4-5 · README, case study and open-source basics.** Docs: 12 (case study, publish checklist), 09 (compliance roadmap).
  Build: README screenshots and a GIF of the demo company; the case study brought up to date; `CONTRIBUTING.md`; `SECURITY.md` pointing to GitHub's private vulnerability reporting (you switch it on in the repo settings); issue templates; the repo description and topics. An OWASP ZAP baseline scan of a local copy, with medium-or-higher findings fixed.
  Done when: the publish checklist in doc 12 passes.
- [ ] **P4-6 (you) · Portfolio v2.** Three developers who've never seen the repo follow the README on their own machines (at least one on Windows), with no help. Five non-technical people watch the 60-second video and say what the product does. Fix what trips them up. Add the GIF to the Upwork item.
  **Gate:** all 3 developers get from `git clone` to a flagged overcharge in under 10 minutes.

## Phase 5: Self-serve onboarding (weeks 11–13)

- [ ] **P5-1 · Sign-up, terms and trial start (billing on only).** Stories: E1-1 (AC4–5), E10-1 (AC1, AC4), E1-3 AC6.
  Done when: with billing off (the default), sign-up shows no terms and starts no trial; with billing on, sign-up records the terms acceptance and starts a trial, and a second trial for the same QuickBooks company is refused (tested).
- [ ] **P5-2 · Connect step with sync progress.** Stories: E13-1, E13-2.
  Done when: live per-entity progress, the edition-aware summary, and a failure state with retry all work against the sandbox.
- [ ] **P5-3 · Auto-setup from history.** Stories: E13-3. Docs: 08 (Auto-setup).
  Build: the `company.auto_setup` job (email-domain aliases, vendor defaults, item mappings, allowed fees); summary screen; tolerance presets.
  Done when: at least 80% of the demo vendors are ready from the seeded history (test); rules a person made are never changed (test). Also run it on a fresh sandbox company's Intuit sample data and record the coverage in `docs/decisions.md` (doc 00, open question 2).
- [ ] **P5-4 · Connect a mailbox (IMAP) and the email-route step.** Stories: E2-4, E13-4, E2-2 AC6. Docs: 07 (A2).
  Build: the `mailboxes` table and the Settings → Email screen; `email.poll_imap` (read-only, UID tracking, new mail only by default, a count and cost estimate before any backfill); login-failure handling with each provider's fix; Gmail confirmation-email detection with the code shown in onboarding; the generated Gmail filter; the Microsoft 365 guidance; the supplier notice; the live first-email panel.
  Done when: a real Gmail mailbox with an app password connects using only the screen, and a new invoice sent to it appears within one poll; older mail isn't fetched; a wrong password pauses the mailbox and shows the fix; a Gmail confirmation fixture is never processed as a document.
- [ ] **P5-5 · Price-list import wizard.** Stories: E13-5.
  Done when: 5 differently laid-out CSV and XLSX files import correctly after confirming the suggested mappings.
- [ ] **P5-6 · Shadow mode and comparison report.** Stories: E13-6.
  Build: `posting_mode` (default `shadow` for 7 days); the `company.shadow_compare` job matching manually entered QuickBooks bills to our invoices; the report UI; the daily shadow email; Start posting with the threshold warning.
  Done when: bills entered by hand in the sandbox show up in the report correctly matched, including a deliberate difference.
- [ ] **P5-7 · Checklist, lifecycle emails, stuck detection.** Stories: E13-1 AC1, E13-7.
  Done when: each stuck signal in doc 02 fires its email once (tested with a fake clock).
- [ ] **P5-8 · Help center.** Stories: E13-8. At least 12 articles, linked in context.
- [ ] **P5-9 (you) · Usability test.** Three people who've never seen the product go from sign-up to a posted sandbox bill.
  **Gate:** all 3 succeed unaided in under 15 minutes. Fix and retest until they do.

## Phase 6: Billing, operations, hardening, portfolio v3 (weeks 14–15)

- [ ] **P6-1 · Stripe billing (test mode, off by default).** Stories: E10-1 (AC2–3), E10-2 to E10-5, E14-6. Products and prices, Checkout, customer portal, the overage meter, trial conversion, dunning that pauses posting, self-serve cancellation. All behind `BILLING_ENABLED`; live keys refused before Phase 7; webhooks reach localhost through the Stripe CLI.
  Done when: with billing off, there's no billing UI and no Stripe call (tested); with billing on, a full trial → paid → overage → cancel cycle passes in Stripe test mode, and billed usage reconciles with `usage_daily`.
- [ ] **P6-2 · Digest and alerts.** Stories: E8-1, E8-2. Tested with a fake clock; no empty digests.
- [ ] **P6-3 · Admin console.** Stories: E11-1. Pipeline view, failed jobs, re-run, cost per invoice, read-call usage with an alert at 70%, auto-setup coverage and onboarding progress per company, support-access flag with audit.
- [ ] **P6-4 · Auto-post.** Stories: E12-1. Readiness bar, toggle, vendor allow-list, kill switch, detection of edited or deleted auto-posted bills.
- [ ] **P6-5 · Monthly overcharge report.** Stories: E9-2.
- [ ] **P6-6 · Per-vendor accuracy.** Zero-edit rate by vendor, worst first, in the dashboard and the admin console.
- [ ] **P6-7 · Security hardening.** Docs: 09. CSP, an OWASP ZAP baseline scan with fixes, Dependabot, the incident runbook, `pnpm db:backup` with a tested restore.
- [ ] **P6-8 · Data export and deletion.** Export a company's data; delete an organization or a company, files included; retention jobs; a security section in the README listing the controls in doc 09. (The DPA template moves to P7-5.)
- [ ] **P6-9 (you) · Portfolio v3.** Record the 3-minute walkthrough (doc 12); update the case study with final numbers; refresh the Upwork item.

## Phase 7: Hosted edition and go live (optional; only if you decide to sell)

- [ ] **P7-1 (you) · Demand check first.** Open trials on a hosted copy (P7-2) to a small audience: bookkeeping communities, and search pages with the free overcharge check (doc 10). Go on only if trials connect QuickBooks and activate (doc 02).
- [ ] **P7-2 · Hosted environment.** A deploy guide and one tested target (any Docker host, behind a TLS proxy); a domain that doesn't end in `.app` (A10); managed Postgres with point-in-time recovery; the S3 storage driver; a restore test; monitoring and alerts. Separate from every local copy.
- [ ] **P7-3 (you) · QuickBooks production keys** (assessment questionnaire, EULA and privacy URLs, HTTPS redirect URIs); join the App Partner Program; apply for the App Store listing (6 weeks to 6+ months; don't block on it).
- [ ] **P7-4 · Stripe live mode**, sales tax settings, receipts.
- [ ] **P7-5 (you) · Legal review** of the terms, privacy policy and a DPA template; a subprocessors page.
- [ ] **P7-6 · Partner workspace** for bookkeepers, and partner billing.
- [ ] **P7-7 · QuickBooks webhooks** for faster PO updates (optional; they need a public URL; doc 06).
- [ ] **P7-8 (you) · Launch** per doc 10.
- [ ] **P7-9 · Postmark inbound and the forwarding route.** Stories: E2-2 (Postmark), E13-4 (forwarding to the company's own address). Docs: 07 (A3). The webhook with basic auth; `pnpm replay-email <fixture.json>`; the forwarding tab with the Microsoft 365 30-minute troubleshooting panel; Turnstile on sign-up; cookie-less analytics on the marketing pages.

## Phase 8: Later (customer demand decides)

OAuth mailboxes for Microsoft 365 and Google Workspace (each copy registers its own app with Microsoft or Google) · Xero adapter (a third `LedgerAdapter`) · posting vendor credits · multi-currency · receipts import for 3-way match · multi-step approvals · supplier statement reconciliation · SOC 2 Type I.
