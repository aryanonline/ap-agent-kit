# AP Agent: build kit

This kit is everything needed to build an AI accounts-payable inbox for QuickBooks Online with Claude Code. It is designed as a sale-ready, fully self-serve product, and shown first as an Upwork portfolio project. Supplier invoices arrive by email and are checked line by line against POs, price lists or price history. Clean ones post as bills; a person only handles the ones that are wrong.

## Before you build anything

1. **QuickBooks already reads emailed bills for free** (date, amount, vendor). So "AI reads your invoices" is worth nothing, in a portfolio or in a product. Lead every demo, video and case study with **line-level checks against what was agreed**, plus the fraud checks.
2. **Nobody does hands-on setup.** Sign-up, QuickBooks connect, email forwarding, auto-setup from 12 months of history, shadow mode, the trial and billing all work with no one on our side (doc 02 Part 1, PRD E13).
3. **The portfolio ships before the product is finished:** a video and case study around week 8, the public demo around week 10, the full self-serve product around week 15. That schedule assumes 20 to 30 hours a week and that most tasks fit in one Claude Code session; if it slips, the portfolio pieces are already out.
4. **This plan doesn't test whether anyone will pay.** Stripe stays in test mode and QuickBooks on development keys, which reach sandbox companies only. If you decide to sell, Phase 7 starts with a demand check (P7-1), then production keys, legal review and launch.
5. **The riskiest assumption is auto-setup.** It is tested on our demo dataset and on Intuit's sandbox sample data, but real books are messier, and only real companies can show how well it works (doc 00, open question 2).

## How to use it

Copy the whole folder into the root of a new repository:

```
CLAUDE.md          -> repo root (Claude Code loads it every session)
docs/              -> repo root
```

Then, in Claude Code: `Implement task P0-2 from docs/11-build-plan.md` (the template is at the top of that file). Work through the tasks in order. Each one is sized for one session and one PR.

## Contents

| File | What it's for |
|---|---|
| `CLAUDE.md` | Rules, commands and the doc map for Claude Code |
| `docs/00-assumptions.md` | **Read first.** The goal, assumptions, facts checked on 2026-11-16, and open questions |
| `docs/01-vision.md` | Problem, customer, product, why it could win, why it might fail, milestones |
| `docs/02-customer-journey.md` | Part 1: the self-serve journey from sign-up to auto-post, with stuck signals. Part 2: what a portfolio viewer sees |
| `docs/03-prd-mvp.md` | MVP scope; user stories E1 to E14 with acceptance criteria |
| `docs/04-architecture.md` | Principles, system diagram, stack, repo layout, pipeline, jobs, environments |
| `docs/05-data-model.md` | Tables, enums, retention |
| `docs/06-integration-quickbooks.md` | OAuth, endpoints, bill payload, API fees, errors, the sandbox and its test plan |
| `docs/07-integration-email-and-claude.md` | Postmark intake, Gmail and Microsoft 365 forwarding, extraction schema and prompt, cost per invoice, evals |
| `docs/08-matching-engine.md` | The core rules: vendor, PO, price, quantity, duplicates, fraud, routing, auto-setup, auto-post bar |
| `docs/09-security-compliance.md` | Threat model (including public demo and trial abuse), required controls, compliance roadmap |
| `docs/10-pricing-gtm-launch.md` | Plans and trial (built in test mode), positioning, channels, go-live gates, the free overcharge check |
| `docs/11-build-plan.md` | Phases 0 to 7, broken into 71 Claude Code–sized tasks (Phase 7 is optional) |
| `docs/12-portfolio-and-demo.md` | Demo dataset, public demo design, sandbox seeding, video shot lists, case study, Upwork item drafts |
| `docs/decisions.md` | Running decision log, seeded with the decisions so far |

## This week

1. **P0-1 (you):** Intuit Developer account and app, with a **dedicated sandbox company** for the demo; Anthropic API key with a spend limit; a private GitHub repo; the product name and a domain that doesn't end in `.app` (Upwork doesn't accept some `.app` links).
2. **Claude Code:** P0-2 to P0-6 (repo, extraction CLI, eval fixtures, the demo dataset, the proof run and Overcharge Report).
3. **P0-7 (you):** run extraction and the proof run on 10 to 20 real invoices you're allowed to use, and hand-check them. Then the gate review (P0-8).

Source research: "SaaS shortlist from Upwork AI jobs" (claude.ai artifact, 2026-11-16).
