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

## 2026-11-16 · P0-1 accounts set up
Status: decided
Context: task P0-1.
Finding: Intuit app "Line Beagle" (workspace LineBeagle, development keys under Keys and credentials > Development). Its scopes are locked to accounting + payment; we request only `com.intuit.quickbooks.accounting` in the OAuth URL, so the consent screen asks only for that. Development redirect URIs: Intuit's OAuth Playground and `http://localhost:3000/api/qbo/callback`. Add the staging and demo callback URLs once they exist.
Sandboxes: **Harbor Lane Supply Co.** (QuickBooks Online Plus, US, realm 9341458718457078) is the demo company; purchase orders and the items table are on. "Sandbox Company US 438d" (realm 9341458718647416) is the scratch company for the P1-7 experiments. Every Intuit sandbox comes with Intuit's sample data, so the demo company is not empty: the seed and reset scripts (P3-6) and auto-setup must cope with the sample vendors, customers and bills, or delete them first. The sandbox's company email is the developer's real address: change it to a `.example` address before recording (doc 12 rule).
Anthropic: workspace `line-beagle-dev` with a $20 monthly spend limit and an email alert at $10 (org limit $1,000). Staging and demo get their own workspaces and keys later (doc 09, T11).
Local `.env` names (P0-2's `.env.example` must match): `ANTHROPIC_API_KEY`, `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT=sandbox`. The Anthropic key `local-dev` expires 2026-12-16.
Consequences: P0-1 done apart from registering the domain. Doc 06 and doc 12 should mention the sample data when P3-6 is built.

## 2026-11-16 · Product name: Line Beagle (linebeagle.com)
Status: decided (domain not yet registered)
Context: A10 left "AP Agent" as a working name, to be replaced in P0-1. The domain can't be `.app`.
Decision: Line Beagle, because the name says what sets it apart from QuickBooks' free bill capture: it checks every invoice line. `linebeagle.com` was unregistered on 2026-11-16 (Verisign RDAP). Other names considered and still free that day: aphound.com, matchwarden.com, payablesentry.com, apmarshal.com. AP Hawk was dropped as too close to Payhawk, an existing AP and spend product. A web search found no product called Line Beagle; this is not a trademark search.
Consequences: the Intuit app is named Line Beagle. Rename "AP Agent" across the kit, code and the bill `PrivateNote` marker in P0-2. Register the domain before recording the video (P3) or setting up the inbound mail subdomain.

## 2026-11-16 · Open: can development keys connect other developers' sandbox companies?
Status: open; resolve in P4 only if you want the optional "connect your own sandbox" sign-up in the demo (doc 12)

## 2026-11-16 · Open: Gmail forwarding-confirmation pattern
Status: open; resolve in P5-4 with a real Gmail account (sender, subject and code format; doc 07)

## 2026-11-16 · Fraud checks work from a new customer's first invoice
Status: decided
Context: `new_sender` needed 3 earlier invoices per vendor. A self-serve customer would have had no look-alike-domain protection in their first weeks, and demo scenario #12 couldn't fire.
Decision: auto-setup takes vendor domains from QuickBooks, and `new_sender` also fires on look-alike domains (confusable characters, or one edit away) from the first invoice.
Consequences: doc 08 steps 3 and 9 and the new Auto-setup section; `vendor_aliases` gains `email_address` for free-mail vendors; `ref_bill_lines` added to doc 05.

## 2026-11-16 · The public demo is a separate environment
Status: decided
Context: an anonymous public demo is the largest attack surface the product will have (doc 09, T11).
Decision: its own deployment, database, bucket, Postmark server, Claude key with a hard spend cap, Stripe test keys and development QuickBooks keys. Nothing is shared with staging or production.
Consequences: infrastructure costs about $90 to $180 a month before go-live (doc 04). CLAUDE.md rule 13.

## 2026-11-16 · Public demo: one workspace per visitor, on a simulated ledger
Status: decided
Context: a portfolio needs something a viewer can try. A shared login to one QuickBooks sandbox breaks: visitors see each other's edits, POs get used up, our duplicate check trips on earlier visitors' bills, and visitors can't open the sandbox to see the result anyway.
Decision: each visitor gets an isolated 24-hour workspace seeded from `fixtures/demo`, with replayed extractions, the real matching engine, and a demo ledger adapter that shows the exact bill it would post. The real sandbox is used for the videos and the nightly end-to-end test.
Consequences: E14, P4-1 to P4-6, the `demo` ledger adapter and the `demo_bills` table.

## 2026-11-16 · Goal: a sale-ready, self-serve product, shown as an Upwork portfolio project
Status: decided (your call)
Context: the first plan sold hands-on setup to paid pilots before building the rest. You ruled out hands-on setup and chose to build the whole product as if ready to sell, and to attach it to Upwork as a portfolio project.
Decision: everything is self-serve: sign-up, QuickBooks connect, email routes, auto-setup, shadow mode, trial and billing, with no setup call. Stripe stays in test mode and QuickBooks on development keys (sandbox only) until Phase 7, which is optional. Portfolio pieces ship first: video and case study around week 8, the public demo around week 10, the full product around week 15.
Consequences: no pilot gate and no setup fee. The plan no longer tests whether anyone will pay; P7-1 does that if you decide to sell. Docs 00, 01, 02, 03, 10 and 11 rewritten; doc 12 added; docs 04 to 09 and CLAUDE.md updated.

## 2026-11-16 · Stack for the MVP
Status: decided (revisit only with a concrete reason)
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
