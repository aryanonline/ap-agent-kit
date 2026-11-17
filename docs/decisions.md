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
