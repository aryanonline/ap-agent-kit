# Decisions log

One entry per decision or finding, newest at the top. Claude Code adds entries as it works; you add the business ones. Format:

```
## YYYY-MM-DD · Short title
Status: decided | open | superseded by <title>
Context: why it came up (1–3 lines)
Decision / finding: what we chose or learned
Consequences: what changes, which docs or tasks were updated
```

---

## 2026-11-19 · P0-3 run on synthetic samples
Status: finding
Context: P0-3's done-when check: `pnpm extract` on 3 PDFs and an image, with your key, on `claude-opus-5-5` at effort `medium`. The samples were 4 synthetic invoices made for this check (all fictional; not committed, since P0-4 builds the eval set): a one-page invoice with PO, freight and tax lines and US dates; a two-page invoice with 26 item lines, a discount, a fuel surcharge and long-form dates; one PDF holding two invoices with a remit-to bank block; and a PNG of the first invoice. 0 real invoices.
Finding:
- All 4 succeeded, and every value checked out: each amount, quantity and unit price appears on the source, `qty × unit price` matches every line, and every document's totals add up. US dates came back as ISO with a note on the reading. The two-invoice PDF came back as 2 documents (pages 1 and 2), and the remit-to account and routing numbers were masked in the output.
- Tokens and cost, per call: one-page PDF 2,007 input + 2,854 cache write + 797 output, $0.0382, 10.5 s; two-page PDF 4,783 input + 2,854 cache read + 2,931 output, $0.0783, 21.0 s; two-invoice PDF 3,882 + 2,854 cached + 1,440 output, $0.0449, 11.7 s; PNG 1,385 + 2,854 cached + 787 output, $0.0219, 7.3 s. Doc 07's estimate ($0.03 to $0.10 per invoice) holds on this tiny synthetic set; P0-4 measures it properly.
- Caching works: the system prompt plus the schema is a 2,854-token prefix, written once and read by every later call within 5 minutes.
- No content logged: a run with `ANTHROPIC_LOG=debug` wrote only the 4-line summary to stderr (no invoice text, image data or auth header).
- The paid checks, including the schema test call and the logging run, cost about $0.22.
For P0-4 and P0-6:
- The model lists freight and tax both as lines and in the header `freight` and `tax` fields, so the arithmetic check (doc 08 step 2) must not count them twice.
- A discount has no header field: subtotal + discount line + surcharge = total, so the arithmetic check must include `discount` lines.
- A fuel surcharge was filed as `kind: "freight"` and in the `freight` total, with a note. Whether surcharges belong in `fee` / `other_fees` is a schema-description question for the eval.

## 2026-11-19 · Text that isn't printed is "" in the extraction schema (P0-3)
Status: decided (your call: option (a))
Context: the first real call returned HTTP 400: "Schemas contains too many parameters with union types (25 parameters with type arrays or anyOf) … (limit: 16 parameters with unions)". Every `.nullable()` field in doc 07's schema counted: 5 on a line, 5 under `vendor`, `remit_to` itself and its 5 fields, `invoice_number`, both dates, `terms`, and the 5 totals. The limit wasn't in doc 07 or the claude-api skill.
Options were: (a) text fields `""` when not printed, while quantities, prices, amounts, dates and `remit_to` stay nullable (10 union fields); (b) `""` for every missing value (1 union field); (c) drop fields, which loses data vendor resolution uses.
Decision: (a). Core's format pass turns `""` (or only spaces) into null, so `CheckedExtraction` and everything after it still see null for any missing value; the raw output keeps `""`. The prompt rule now reads "null for amounts, quantities and dates, and an empty string for text". `MAX_UNION_FIELDS = 16` in `src/integrations/claude/config.ts`, and a test holds the schema at 10. A test call before the change also showed the API accepts `fallbacks: "default"` together with structured outputs.
Consequences: doc 07's schema and prompt were updated to match. `PROMPT_VERSION` stays `x1` and `SCHEMA_VERSION` `s1`: no extraction was ever stored with the earlier text. Any new nullable field must stay within the 6 left.

## 2026-11-19 · Extraction replies are parsed in our code, not by `messages.parse` (P0-3)
Status: decided (you approved it in the P0-3 plan)
Context: doc 07 said structured outputs "through `messages.parse`". Reading `@anthropic-ai/sdk` 1.10.0 showed two problems with that helper.
Finding: `parse()` runs JSON.parse and zod on every text block before the caller can look at `stop_reason`, and throws an `AnthropicError` that embeds the parser's message. (1) A reply cut off at `max_tokens` throws instead of returning, so the stop reason (needed for the streamed retry) and the usage (needed for cost) are lost. (2) V8's JSON.parse messages quote part of the input, so invoice text would sit in an error message that some later caller could log (CLAUDE.md rule 7).
Decision: still structured outputs. `output_config.format` is `{ type: "json_schema", schema }`, where the schema is the SDK's own `betaZodOutputFormat(ExtractionResult).schema` (the same zod schema through the same strict-schema transform). Requests go through `messages.create` and, for the retry, `messages.stream`. `src/integrations/claude/extract.ts` checks `stop_reason` first, then runs JSON.parse, the wire schema and the format pass, and reports only schema paths and codes. Doc 07's Output row says so.
Consequences: a JSON.parse failure is `schema_invalid` with stage `json` and no message. The SDK also throws a raw `SyntaxError` quoting the body when an HTTP 200 body isn't JSON (a proxy page, say); that becomes `api_error` with no status, and the message is dropped.

## 2026-11-19 · Extraction call settings and limits (P0-3)
Status: decided
Context: P0-3 built the extraction client. The claude-api skill, the SDK's published types and the live API docs were checked on 2026-11-19.
Decision:
- **Refusals:** `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta, on the beta Messages endpoint. The API accepts it alongside `output_config.format` (checked with a real call). A fallback attempt is priced at its own model's rates, from `usage.iterations`; Claude Opus 5 and Claude Opus 4.8 (the documented fallback targets) are in the price table. In a streamed reply that fell back mid-output, only the text after the last `fallback` block is read.
- **Thinking and effort:** `thinking: { type: "adaptive" }` is sent explicitly (it is Opus 5.5's default, but a fallback model may need it said). Effort is `medium`, Opus 5.5's own default, set explicitly until P0-4's eval compares `low` and `medium`.
- **Retries:** the SDK's own (`maxRetries: 3`, so 4 tries, exponential backoff honouring `retry-after`). It also retries 408, 409, other 5xx and connection errors. A 401 or 403 is `invalid_api_key`.
- **Logging:** the SDK client is built with `logLevel: "warn"`. Without that, `ANTHROPIC_LOG=debug` in the environment makes it log full request and response bodies, which a test demonstrates as a control. The client never logs; it returns the extraction or a typed failure plus a record of each call (model, stop reason, tokens, cost, latency, request ID).
- **Auth:** the key is passed explicitly with `authToken: null`, so `ANTHROPIC_AUTH_TOKEN` or an `ant` login can't stand in for a missing key (E3-2 AC5). SDK 1.x sends the key as `Authorization: Bearer`, not `x-api-key`.
- **Limits:** PDFs up to 20 MB (E2-2 AC1); images up to 7.5 MB, because the API takes 10 MB of base64 per image. Doc 07's "32 MB" request limit was stale: it is 128 MB on the first-party API, 600 pages. The type comes from the file's first bytes, never its name. GIF is accepted by the API but not by E2-2, so it is refused.
- **Cost:** exact decimals from list prices (pricing page, 2026-11-19). A model missing from the table gives `null` rather than a guess. A failed call with no reply is recorded with no usage and zero cost.
- **CLI:** `pnpm extract` masks remit-to account and routing numbers to the last 4 digits unless `--show-bank-details` is given, since terminal output is easy to paste somewhere public.
- **Tooling:** scripts run with `tsx` (the repo's imports are extensionless, so Node's own type stripping can't run them). Its dependency esbuild has an install script; `pnpm-workspace.yaml` denies it (`allowBuilds: esbuild: false`), and tsx works without it. ESLint now rejects `@anthropic-ai/sdk` imports outside `src/integrations/claude/` (doc 07).
Consequences: P2-1 can save `calls` straight into `extractions` (one row per call, a `max_tokens` retry included) and `failure.reason` as the document's error. Doc 07's Input, Output, Refusals, Length, Retries and Logging rows were updated.

## 2026-11-17 · Toolchain pins (P0-2)
Status: decided (Node 24 was your call)
Context: P0-2 bootstraps the repo. Versions were checked against the npm registry on 2026-11-16.
Decision: Node 24 (LTS "Krypton", supported until April 2028) in `.nvmrc` and `engines` (`^24.11.0`). Node 26 is the active LTS, but 24 was already installed and still bundles corepack. pnpm 12.21.0 in `packageManager`, with its defaults kept: a package version isn't installed until it's a day old (`minimumReleaseAge`), and a dependency with build scripts needs an `allowBuilds` entry (none needs one yet). TypeScript `~6.0.3`, not 7.0, because typescript-eslint supports only TypeScript below 6.1. ESLint 10 flat config with typescript-eslint `strictTypeChecked`, plus a rule that every `eslint-disable` gives a reason. Prettier 3 with defaults; Markdown is excluded, so the docs aren't reformatted. Vitest 5 with V8 coverage, and Vite 8 as an explicit dev dependency (Vitest 5 lists it as a peer). fast-check 4 and decimal.js 10.6. GitHub Actions pinned to commit SHAs (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.1). CI runs `pnpm check` on Ubuntu and Windows; the Windows job checks out with `core.autocrlf` on, so it proves `.gitattributes` keeps every file LF.
Beyond the Build line: ESLint keeps `src/core` pure. Imports from `db/`, `integrations/`, `app/`, `pipeline/` and Node built-ins are rejected, as are `Date.now()`, `new Date()`, `Math.random()`, `process`, `parseFloat` and `.toNumber()`. That enforces CLAUDE.md rules 2 and 3 from the first core file.
Consequences: moving to TypeScript 7 waits for typescript-eslint. pnpm 11 and later read only auth and registry settings from `.npmrc`; other pnpm settings go in `pnpm-workspace.yaml`. Developers need pnpm 12 (`npm install -g pnpm@12`); the README says so.

## 2026-11-17 · money.ts: what it accepts and how it rounds
Status: decided
Context: P0-2 built `src/core/money.ts`, the decimal helpers every later check uses.
Decision:
- **Input** is a plain decimal string only: an optional `-`, 1 to 14 digits before the point (what `numeric(18,4)` holds), and optionally a point and 1 to 10 digits. Anything else throws `InvalidMoneyError`. That covers forms decimal.js would accept (`1e5`, `0x1f`, `Infinity`, `+1`) and printed forms (`$1`, `1,000`, `.5`, `5.`). Turning printed values into this form is the extraction layer's job (P0-3, which can reuse `isDecimalString`). The error message never contains the input, which may be invoice content (rule 7).
- **Arithmetic** (`add`, `sum`, `subtract`, `multiply`) is exact. A private decimal.js clone works to 1,000 significant digits, and a parsed value has at most 24. Results are never `-0` and never in exponent notation. `Money` is a branded type, so a raw decimal.js result can't be passed back in.
- **`roundToCents`** rounds half to even. A supplier's system may round half up, so at an exact half cent the two can differ by $0.01. Doc 08's $0.01 arithmetic tolerance absorbs that, so P0-6 must keep the tolerance rather than compare exactly.
- **`compareWithTolerance(a, b, tol)`** returns 0 when |a − b| ≤ tol: the boundary counts as equal, matching doc 08's "more than". Otherwise it returns 1 or −1, by sign. It covers both the two-sided arithmetic checks and the one-sided `variance > allowed + rounding_abs`.
Consequences: property tests check every operation against an independent BigInt model, and a Vitest threshold holds `money.ts` at 100% coverage. Still to come: the price-variance rule (`min(pct × expected, abs)`) in P2-4, and formatting money for messages in P0-6.

## 2026-11-17 · .env.example lists only keys something reads
Status: decided
Context: P0-2 asks for every optional key, empty, with where to get it, using the P0-1 names.
Decision: it holds the P0-1 names. `ANTHROPIC_API_KEY`, `QBO_CLIENT_ID` and `QBO_CLIENT_SECRET` are empty. `QBO_REDIRECT_URI=http://localhost:3000/api/qbo/callback` and `QBO_ENVIRONMENT=sandbox` are filled in, because they aren't secrets and have only one right value on a local copy. Each later task adds the keys its code reads (`SMTP_URL`, `BILLING_ENABLED`, `SENTRY_DSN` and the rest), so every line in the file does something.
Consequences: `tests/env-example.test.ts` fails if a secret gets a value or a key loses its comment.

## 2026-11-17 · "AP Agent" renamed in code
Status: decided
Finding: there was no code yet. So the rename comes down to this: the package is named `line-beagle`, and no new file says "AP Agent". The bill `PrivateNote` marker ("Line Beagle · inv … · approved by …", doc 06) is first written by the bill payload builder in P3-1. The GitHub repo is still `aryanonline/ap-agent-kit`; renaming it is your call, and GitHub redirects the old URL.
Consequences: P3-1 uses doc 06's marker format.

## 2026-11-17 · Open: unit prices printed with more than 4 decimals
Status: open; decide in P1-2 (the schema)
Finding: doc 05 stores money and quantities as `numeric(18,4)`, but doc 07 keeps every printed decimal, and some suppliers print unit prices like $0.01875. Saved with 4 decimals, that becomes $0.0188. On 10,000 units the recomputed line is then $0.50 off the printed amount, a false `arithmetic_mismatch`. `money.ts` already accepts up to 10 decimals.
Options: (a) a wider scale, such as `numeric(18,6)`, for unit-price columns (`invoice_lines.unit_price` and `expected_unit_price`, `price_list_rows`, `ref_po_lines`, `price_history`); (b) keep the printed string next to the rounded value.
Recommendation: (a). How many decimals QuickBooks accepts in a bill line's `UnitPrice` is a **VERIFY** for P1-7.

## 2026-11-17 · Local-first and open source; hosting only in an optional hosted edition
Status: decided (your call on the decision card: "Local-first, hosting optional later")
Context: with linebeagle.com at checkout, you asked for the product to run entirely on a computer instead, because it's a portfolio piece and hosting would be a cost forever. Staging plus the public demo were estimated at $90 to $180 a month, plus a domain.
Decision: anyone can run it with `docker compose up`. With no keys, it runs the demo company (Harbor Lane) on replayed extractions and the demo ledger. With their own keys: real extraction (Anthropic) and a QuickBooks sandbox (Intuit development keys). Clerk → Better Auth in our own Postgres. R2 → local disk (S3-compatible optional). Postmark → a built-in SMTP listener for testing, plus IMAP polling of a real mailbox (Postmark kept for a hosted edition). Render → none. Stripe stays, in test mode, off by default. Turnstile and analytics only in a hosted edition. The hosted public demo (per-visitor 24-hour workspaces) is dropped, and the case study lives in the repo. A hosted edition stays possible as Phase 7, on the same image.
Consequences: running cost $0 plus Claude usage under the $20 limit. CLAUDE.md rule 13 rewritten ("Local-first; the demo is a tenant, not a mode"); rule 11 adds "no secret has a default value". Every doc updated. Build plan: P1-10 (SMTP listener and local storage), P1-11 (the Compose stack replaces the staging deploy), Phase 4 rewritten (demo company on first run, demo ledger, bring your own invoice, the quick start in CI, open-source basics), P5-4 (IMAP), P6-1 (billing off by default), Phase 7 (hosted edition, with Postmark as P7-9). What it gives up: (1) viewers can't try it from a link, so the video, README and case study carry the pitch (doc 00, open question 5); (2) Microsoft 365 mailboxes can't connect over IMAP until OAuth mailboxes exist (Phase 8), so those users forward by hand or upload; (3) only sandbox QuickBooks companies connect out of the box, because a real company needs production keys for its own Intuit app and an HTTPS address. Supersedes "The public demo is a separate environment" and part of "Public demo: one workspace per visitor".

## 2026-11-17 · MIT license
Status: decided (easy to change before anyone else contributes)
Context: an open-source repo needs a license; without one, nobody may legally use the code.
Decision: MIT, copyright Aryan Singh. It's the usual choice for portfolio work and the least friction for a client who reads or reuses the code.
Consequences: anyone may use, change and sell it, including as a hosted service. If you later want companies that host it to publish their changes, AGPL for future versions is the usual choice. Relicensing is simple only while you hold all the copyright, so take outside contributions under a contributor agreement if that matters to you.

## 2026-11-17 · The domain isn't registered
Status: decided
Context: linebeagle.com was at Cloudflare's checkout ($11.17 a year) when you chose local-first. Nothing was bought.
Decision: don't register it. A local copy needs no domain: the inbound address uses `in.localhost`, and the case study lives in the repo.
Consequences: register a domain only for a hosted edition (P7-2). The risk is that someone else registers linebeagle.com first; if the name matters to you, $11 a year removes that risk. Check RDAP again before Phase 7.

## 2026-11-17 · Open: QuickBooks refuses `.example` email addresses
Status: open; decide in P0-5, confirm through the API in P1-7
Finding: in the Harbor Lane sandbox's company settings, saving `ap@harborlanesupply.example` failed with a generic error, while `ap@harborlanesupply.example.com` saved. The demo dataset's vendor emails use `.example` (doc 12). If the API refuses them too, `pnpm qbo:seed` (P3-6) fails.
Options: (a) switch the dataset to `*.example.com` hosts, such as `billing@acme-fasteners.example.com` and the look-alike `acrne-fasteners.example.com`. Then the vendor-domain and look-alike checks (doc 08) must compare whole hosts, with a subdomain-suffix rule, never the registrable domain; otherwise every vendor collapses to `example.com`, and auto-setup's "not shared by two vendors" rule drops them all. (b) Keep `.example` in the fixtures and map the addresses only when seeding QuickBooks. But then auto-setup in the sandbox learns different domains from the demo company's, and the video stops matching the tests.
Recommendation: (a).
Consequences: the sandbox company's email was changed to `ap@harborlanesupply.example.com` on 2026-11-17.

## 2026-11-17 · Open: Better Auth's tables or our own for organizations and memberships
Status: open; resolve in P1-1 (doc 05, "Auth tables")

## 2026-11-17 · The GitHub repo stays public
Status: decided
Context: P0-1 and the README planned a private repo; `aryanonline/ap-agent-kit` was created public.
Decision: keep it public and build in public.
Consequences: any secret committed by mistake is exposed at once, so `.env*` stays in `.gitignore`, GitHub secret scanning and push protection stay on (doc 09, T9), and nothing private goes in the docs (real names, emails, customer data). Real-world invoices from P0-7 are never committed, as planned.

## 2026-11-16 · P0-1 accounts set up
Status: decided
Context: task P0-1.
Finding: Intuit app "Line Beagle" (workspace LineBeagle, development keys under Keys and credentials > Development). Its scopes are locked to accounting + payment; we request only `com.intuit.quickbooks.accounting` in the OAuth URL, so the consent screen asks only for that. Development redirect URIs: Intuit's OAuth Playground and `http://localhost:3000/api/qbo/callback`. A hosted edition adds its own HTTPS callback in Phase 7.
Sandboxes: **Harbor Lane Supply Co.** (QuickBooks Online Plus, US, realm 9341458718457078) is the demo company; purchase orders and the items table are on. "Sandbox Company US 438d" (realm 9341458718647416) is the scratch company for the P1-7 experiments. Every Intuit sandbox comes with Intuit's sample data, so the demo company is not empty: the seed and reset scripts (P3-6) and auto-setup must cope with the sample vendors, customers and bills, or delete them first. The sandbox's company email was the developer's real address; it was changed on 2026-11-17 (see the `.example` entry above).
Anthropic: workspace `line-beagle-dev` with a $20 monthly spend limit and an email alert at $10 (org limit $1,000). A hosted edition gets its own workspace and key (Phase 7).
Local `.env` names (P0-2's `.env.example` must match): `ANTHROPIC_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT=sandbox`. The Anthropic key `local-dev` expires 2026-12-16.
Consequences: P0-1 done; no domain is needed (2026-11-17). Docs 06 and 12 now mention the sample data.

## 2026-11-16 · Product name: Line Beagle (linebeagle.com)
Status: decided (the domain was deliberately not registered; see 2026-11-17)
Context: A10 left "AP Agent" as a working name, to be replaced in P0-1. The domain can't be `.app`.
Decision: Line Beagle, because the name says what sets it apart from QuickBooks' free bill capture: it checks every invoice line. `linebeagle.com` was unregistered on 2026-11-16 (Verisign RDAP). Other names considered and still free that day: aphound.com, matchwarden.com, payablesentry.com, apmarshal.com. AP Hawk was dropped as too close to Payhawk, an existing AP and spend product. A web search found no product called Line Beagle; this is not a trademark search.
Consequences: the Intuit app is named Line Beagle. "AP Agent" was renamed across the docs on 2026-11-17; code and the bill `PrivateNote` marker follow in P0-2. A domain is needed only for a hosted edition (2026-11-17).

## 2026-11-16 · Open: can development keys connect other developers' sandbox companies?
Status: closed 2026-11-17 as moot: the hosted demo is gone, and every copy uses its own Intuit app

## 2026-11-16 · Open: Gmail forwarding-confirmation pattern
Status: open; resolve in P5-4 with a real Gmail account (sender, subject and code format; doc 07)

## 2026-11-16 · Fraud checks work from a new customer's first invoice
Status: decided
Context: `new_sender` needed 3 earlier invoices per vendor. A self-serve customer would have had no look-alike-domain protection in their first weeks, and demo scenario #12 couldn't fire.
Decision: auto-setup takes vendor domains from QuickBooks, and `new_sender` also fires on look-alike domains (confusable characters, or one edit away) from the first invoice.
Consequences: doc 08 steps 3 and 9 and the new Auto-setup section; `vendor_aliases` gains `email_address` for free-mail vendors; `ref_bill_lines` added to doc 05.

## 2026-11-16 · The public demo is a separate environment
Status: superseded by "Local-first and open source" (2026-11-17)
Context: an anonymous public demo is the largest attack surface the product will have (doc 09, T11).
Decision: its own deployment, database, bucket, Postmark server, Claude key with a hard spend cap, Stripe test keys and development QuickBooks keys. Nothing is shared with staging or production.
Consequences: infrastructure costs about $90 to $180 a month before go-live (doc 04). CLAUDE.md rule 13.

## 2026-11-16 · Public demo: one workspace per visitor, on a simulated ledger
Status: partly superseded by "Local-first and open source" (2026-11-17): the simulated ledger and replayed extractions stay, in the demo company; hosted per-visitor workspaces are dropped
Context: a portfolio needs something a viewer can try. A shared login to one QuickBooks sandbox breaks: visitors see each other's edits, POs get used up, our duplicate check trips on earlier visitors' bills, and visitors can't open the sandbox to see the result anyway.
Decision: each visitor gets an isolated 24-hour workspace seeded from `fixtures/demo`, with replayed extractions, the real matching engine, and a demo ledger adapter that shows the exact bill it would post. The real sandbox is used for the videos and the nightly end-to-end test.
Consequences: E14, P4-1 to P4-6, the `demo` ledger adapter and the `demo_bills` table.

## 2026-11-16 · Goal: a sale-ready, self-serve product, shown as an Upwork portfolio project
Status: decided (your call)
Context: the first plan sold hands-on setup to paid pilots before building the rest. You ruled out hands-on setup and chose to build the whole product as if ready to sell, and to attach it to Upwork as a portfolio project.
Decision: everything is self-serve: sign-up, QuickBooks connect, email routes, auto-setup, shadow mode, trial and billing, with no setup call. Stripe stays in test mode and QuickBooks on development keys (sandbox only) until Phase 7, which is optional. Portfolio pieces ship first: video and case study around week 8, the public demo around week 10, the full product around week 15.
Consequences: no pilot gate and no setup fee. The plan no longer tests whether anyone will pay; P7-1 does that if you decide to sell. Docs 00, 01, 02, 03, 10 and 11 rewritten; doc 12 added; docs 04 to 09 and CLAUDE.md updated.

## 2026-11-16 · Stack for the MVP
Status: decided; auth, storage, email and hosting changed by "Local-first and open source" (2026-11-17)
Context: a solo founder building with Claude Code needs one language and as few vendors as possible.
Decision: TypeScript everywhere. Next.js (App Router) + Postgres (Drizzle) + pg-boss for jobs (no Redis) + Clerk + R2 + Postmark + Claude API + QuickBooks Online API + Stripe, hosted on Render.
Consequences: the web and the worker share code; the job queue lives in the same database, so backups cover it. Alternatives considered: Vercel + Inngest + Neon (three vendors for what Render does alone); Better Auth instead of Clerk (fine if you'd rather own auth data, but more security surface to build).

## 2026-11-16 · The model extracts; deterministic code decides
Status: decided
Context: financial postings need explainable, testable decisions, and invoices are untrusted third-party input that may contain prompt injection.
Decision: Claude fills a fixed schema with no tools. Validation, matching, exceptions, routing and posting are pure functions in `src/core/`.
Consequences: accuracy problems are fixed in the schema, prompt or rules, never by giving the model more authority.

## 2026-11-16 · Matching works without POs
Status: decided
Context: QuickBooks Online Essentials has no purchase orders, and many small businesses don't use them on Plus either.
Decision: price sources in order: PO, then an uploaded price list, then the company's own price history (median of the last 90 days, at least 3 samples).
Consequences: the history backfill is part of Phase 1. The demo dataset covers all three sources. Auto-setup reports which checks are active for each company (E13-3 AC3), so once real companies connect, the admin console shows how many have POs or price lists.

## 2026-11-16 · Charge for pilots
Status: superseded by "Goal: a sale-ready, self-serve product, shown as an Upwork portfolio project"
Context: the research suggested waiving the $500 setup fee for the first five customers.
Decision (no longer in force): charge $400 for setup plus the first 30 days, then $249 a month, through Upwork.

## 2026-11-16 · Open: CSV formats for the proof run (`pos.csv`, `prices.csv`)
Status: open; resolve in P0-6

## 2026-11-16 · Open: QuickBooks sandbox verification results
Status: open; resolve in P1-7 (doc 06 sandbox test plan)
