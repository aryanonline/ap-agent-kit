# 10 · Pricing, go-to-market and go-live

> **Status:** designed as if live, **built in Stripe test mode, and off by default** (`BILLING_ENABLED=false`). The open-source copy is free under the MIT license and has no plans or trials: everything below applies to a hosted edition someone would sell (Phase 7). Until then, the only channels running are the Upwork portfolio and the GitHub repo (doc 12).

## Pricing

**No setup fee, no setup call.** Onboarding is self-serve (doc 02).

### Trial
- **14 days or 100 invoices**, whichever comes first. No card required.
- **One trial per QuickBooks company**, enforced by realm ID, so nobody can reset it with a new email address.
- Every feature except auto-post, which needs 200 reviewed invoices anyway.

### Plans

| Plan | Price | Includes | Overage |
|---|---|---|---|
| **Starter** | $249 / month | 1 company, 200 invoices a month, PO, price-list and price-history checks, fraud checks, shadow mode, daily digest | $0.75 per invoice |
| **Growth** | $499 / month | Up to 3 companies, 600 invoices a month, auto-post, monthly overcharge report | $0.60 per invoice |
| **Partner** (bookkeeping firms; Phase 7) | $149 / month per client company | 150 invoices per company; one login across clients | $0.75 per invoice |

- Annual billing: 2 months free.
- Usage counts invoices that reach `extracted`. Duplicates, statements and non-invoices are free (E10-3).
- Cancel any time in the customer portal; it takes effect at the end of the period.

### Why these numbers (hypotheses, to test once live)

| Anchor | Value |
|---|---|
| The construction firm's AP clerk post on Upwork | $2,000 a month |
| Retyping at 4 minutes per invoice × 200 invoices × $25 an hour | about $333 a month |
| Overcharges caught | Unknown until real customers use it. The shadow comparison report and the free overcharge check measure it |

**Unit economics per Starter customer (estimate):** $249 revenue, minus model cost $6 to $20, minus Stripe fees about $8, minus a share of hosting and email about $5. That's about **85 to 90% gross margin**, and with no setup labour it stays there as customers grow. Support is a help center plus asynchronous email; no calls.

**Trial cost:** at most 100 invoices × $0.03 to $0.10 = **$3 to $10 per trial** in model cost. That's fine as long as the one-trial-per-company rule holds.

**First price test (once live):** quote $349 for Starter to half of new visitors for one month, and compare trial-to-paid conversion.

## Positioning

> For US distributors and service firms on QuickBooks Online that buy against POs or agreed prices, Line Beagle is the AP inbox that checks every supplier invoice line by line against what you agreed to pay, and posts the clean ones to QuickBooks. Unlike QuickBooks' own bill capture, Dext or BILL, it catches the overcharges, not just the totals. Set up in 15 minutes, with no call.

**Lead with money, then time. Don't lead with "AI".**
1. "It found $X in overcharges in your last 20 invoices." (owner)
2. "No more retyping; you only look at the ones that are wrong." (clerk)
3. "Every bill arrives coded, with the PDF attached and the PO linked." (bookkeeper)

## Channels (when selling)

| # | Channel | How | Notes |
|---|---|---|---|
| 1 | **QuickBooks App Store** | Listing with screenshots, the video, reviews | The highest-intent channel for QuickBooks add-ons, but approval can take months. Apply at the start of Phase 7 |
| 2 | **Search + free overcharge check** | One useful page per query ("match bills to purchase orders in QuickBooks Online", "catch vendor overcharges", "duplicate bill detection QuickBooks"), each ending with the free check (Appendix A) | Compounds slowly; start early in Phase 7 |
| 3 | **Bookkeepers and fractional controllers** | Partner plan, plus a 20% revenue share for 12 months on referred companies | One bookkeeper can bring 5 to 30 companies |
| 4 | **Upwork** | The portfolio item and proposals (doc 12) | Brings custom-build work, and sometimes product customers. Upwork's terms require clients you meet there to pay through Upwork, so don't move them to Stripe ([ConductAtlas summary](https://conductatlas.com/platform/upwork/upwork-terms-of-service/non-circumvention-and-conversion-fee/)) |
| 5 | **LinkedIn outreach** | Short messages to controllers and AP leads at US distributors with 10 to 100 employees, linking the demo and the free check | No calls; the demo and trial do the selling |
| 6 | **AI automation agencies** | Reseller pricing | Phase 8 |

**Sales assets:** the one-command local demo, the 60-second and 3-minute videos, the case study, the help center, a security page, and a comparison page ("Line Beagle vs QuickBooks bill capture"; state only facts you've checked).

**Funnel (track weekly once live):** `visitors → demo starts → trials → activated (doc 02) → paid`
Starting hypotheses: activation at least 50% of trials; trial-to-paid at least 15% of activated. Below either, fix that step before buying traffic.

## Go-live plan (Phase 7)

### Gates (all required)
- [ ] Demand check (P7-1) shows trials connecting QuickBooks and activating
- [ ] QuickBooks production keys approved; App Store listing submitted (launch doesn't wait for approval)
- [ ] Stripe live mode, with usage billing reconciled against `usage_daily`
- [ ] Usability gate met (P5-9), and onboarding emails and stuck detection live
- [ ] Security hardening done (P6-7); restore tested; incident runbook written
- [ ] Terms, privacy policy, DPA and subprocessors page reviewed by a lawyer
- [ ] Help center live; support inbox answered within one business day
- [ ] Production monitoring and alerts on intake, extraction, posting and billing

### Sequence

| When | What |
|---|---|
| T−4 weeks | Production site, pricing page, free overcharge check page, comparison page |
| T−3 weeks | Partner page and terms; App Store listing submitted |
| T−2 weeks | Publish 3 search pages; record a short partner walkthrough video |
| T−1 week | Soft launch to a waitlist; watch activation daily |
| Launch week | LinkedIn post (the build story plus demo numbers, labelled as demo data); email the partner list; post in bookkeeping communities where the rules allow it |
| T+1 to 4 weeks | Read every stuck signal and every cancellation reason weekly; fix the top onboarding drop-off each week |

---

## Appendix A: Free overcharge check (self-serve lead magnet)

- **What:** upload up to 10 invoices, plus an optional PO or price-list CSV. Get the Overcharge Report (Appendix B) in the browser within a few minutes. No QuickBooks connection.
- **How (hosted edition):** a temporary workspace, deleted after 24 hours, running the same pipeline as uploads (E2-3), with per-visitor quotas, a daily spend cap and bot protection.
- **Locally:** the same report comes from `pnpm proof-run`, or from uploads into the demo company.
- **Next step:** "Start a free trial to check every invoice automatically."
- **Upwork note:** any page linked from the portfolio must not collect email addresses or show contact details (doc 12). A hosted edition's own site, not linked from Upwork, can ask for an email to send the report.

## Appendix B: Overcharge Report outline

Used by the Phase 0 proof run, the monthly report (E9-2) and the free check.

1. **Summary:** invoices checked, invoices with issues, **total dollars flagged** by type
2. **Table:** invoice, vendor, issue, expected vs actual, dollar impact
3. **Duplicates** found, if any
4. **What each line was checked against** (PO, price list, history), and what couldn't be checked
5. **Method note:** "Values read from your PDFs and checked line by line against the sources listed. Lines we couldn't verify are marked."
