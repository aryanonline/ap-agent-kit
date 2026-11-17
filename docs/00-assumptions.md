# 00 · Assumptions and open questions

Read this first. Every other doc in the kit is built on what's here. If you change something, the "If you change it" column says which docs and tasks move.

Status key: **Decided** = you confirmed it. **Assumed** = I picked it and you haven't confirmed it. **Fact** = checked against a source on the date given.

---

## The goal (Decided 2026-11-16; local-first since 2026-11-17)

**Build the full product as if it were ready to sell, release it as open source that anyone can run on their own computer, and use it as an Upwork portfolio project.** Nobody is selling it or setting it up for customers by hand.

That means:
- **It runs locally.** `docker compose up` on a laptop, with no accounts and no keys, runs the whole product on a fictional demo company. Your own Anthropic key turns on real extraction, and your own Intuit developer keys connect a QuickBooks sandbox company. No domain, no hosting and no monthly bill (decided 2026-11-17).
- **Everything is self-serve, end to end.** Installing it, connecting QuickBooks, getting email in, configuration and support work from the README and the UI, with no call and no human setup. If a step only works with our help, it's a bug.
- **It's built like a product you could sell.** Tenancy, roles, audit, shadow mode, auto-setup, and the pricing and billing design are all built. Billing is off by default and runs in Stripe test mode when switched on.
- **No paid pilots and no setup fee.** The first version of this kit gated everything on 3 paid pilots. That gate is gone.
- **What the portfolio needs comes first:** a short video against a real QuickBooks sandbox, a public repo whose README sells the product and runs it in one command, and an honest case study (see `12-portfolio-and-demo.md`).
- **A hosted edition is a separate, optional phase** (Phase 7 in `11-build-plan.md`): a deployed copy with a domain, Postmark inbound, production QuickBooks keys, Stripe live mode and legal review.

**What this plan no longer tests:** whether anyone will pay. The research found that Upwork posts mostly show demand for custom builds, so a portfolio piece that wins those jobs fits the evidence. If you later decide to sell, use the free overcharge check (doc 10) and hosted trials to measure demand before the rest of Phase 7.

**What local-first gives up** (assumptions; open question 5 tracks the first):
- **A viewer can no longer click a link and try it.** Most Upwork clients won't install Docker, so the video, the README and the case study carry the pitch. The one-command quick start mostly convinces technical clients.
- **Real email intake is narrower.** A laptop can't receive mail from the internet, so a local copy reads a mailbox over IMAP. Microsoft 365 needs OAuth for that, which isn't built until Phase 8 (fact 12); until then, those users forward invoices by hand or upload them.
- **Only sandbox QuickBooks companies connect out of the box.** A real company needs production keys for your own Intuit app (fact 14).

---

## Decided and assumed

| # | Item | Status | Why | If you change it |
|---|---|---|---|---|
| A1 | **No hands-on setup.** Onboarding configures itself from the company's QuickBooks history, and learns from each correction (doc 08, E13 in doc 03). | **Decided** | Your instruction | — |
| A2 | **QuickBooks Online first; Xero later.** | Assumed | Most matching Upwork posts were US buyers, and QuickBooks Online is the default US small-business ledger. | Rewrite `06-integration-quickbooks.md` for Xero. The rest of the kit holds, because the ledger sits behind an adapter (doc 04). |
| A3 | **Customer:** US small distributors, wholesalers and service firms (field service, waste, fleet repair) with 100 to 1,000 supplier invoices a month. Not construction. | Assumed | Those posts asked for matching against POs and agreed rates. Construction is served by Adaptive. | Update the ideal customer in doc 01 and the demo company in doc 12. |
| A4 | **Builder:** you, solo, with Claude Code, about 20 to 30 hours a week. **Running cost $0:** everything runs locally; the only spend is Claude usage under a $20 monthly limit. | Assumed (hours); Decided (cost, 2026-11-17) | You chose local-first to avoid recurring costs. | Timelines in doc 11 scale with your hours. |
| A5 | **No real customers yet.** The demo company uses a simulated QuickBooks; your own copy connects sandbox companies (development keys only); Stripe stays in test mode; every company in the repo is fictional. | Decided (follows from the goal) | Development keys only connect to sandbox companies. | — |
| A6 | **Human approval by default.** New companies start in shadow mode (nothing posts), then approve-every-bill. Auto-post is per company, only after its numbers prove it (doc 08). | Assumed | Mistakes land in someone's books, and QuickBooks has no draft bill. | Not negotiable for a product that writes to customers' books. |
| A7 | **English-language invoices in USD**, one currency per company. | Assumed | Matches A3. | Multi-currency is in Phase 8. |
| A8 | **2-way match** (invoice against PO, price list or price history), not 3-way. | Assumed | QuickBooks Online has no receiving documents. | Add a receipts import later. |
| A9 | **No bill payment.** The product posts bills; it never pays them. | Assumed | Moving money adds licensing, fraud and liability. | — |
| A10 | **Name: Line Beagle. No domain while it runs locally.** Register linebeagle.com (or another name that doesn't end in `.app`) only for a hosted edition, because Upwork may not accept some `.app` links (fact 10). | Decided (name 2026-11-16; no domain 2026-11-17) | The name says what sets it apart: it checks every invoice line. A local copy needs no domain. | Search and replace. |
| A11 | **Stack:** Next.js + TypeScript, Postgres (Drizzle), pg-boss jobs, Better Auth, files on local disk (S3-compatible when hosted), a built-in SMTP listener and IMAP polling for email (Postmark only when hosted), Claude API, QuickBooks Online API, Stripe in test mode (optional), packaged with Docker Compose. | Assumed | One language, few vendors, and nothing that needs an account just to run it. | Read `docs/decisions.md` before swapping. Anything new needs a local default (CLAUDE.md rule 13). |
| A12 | **The repo is public and MIT-licensed.** Code, docs and demo data are on show; real invoices and secrets never are. | Decided (2026-11-17) | You chose to build in public, and a reviewer can read the code. | Relicensing later works only while you hold all the copyright (decisions.md). |
| A13 | **Who runs it:** a portfolio viewer (the demo company only), a developer evaluating the code, or a small business running its own copy for its own books. Multi-company tenancy stays. | Assumed | The demo company sits beside real companies in one install, and a hosted edition needs tenancy anyway. | Docs 02, 03 (E1, E14). |
| A14 | **A local copy gets real email over IMAP, or by upload.** Forwarding to the product's own address needs a public server and a domain, so it moves to the hosted edition. | Assumed | A laptop can't receive email from the internet. | Doc 07 Part A; E2, E13-4. |

---

## Facts this kit relies on (checked 2026-11-16 unless dated)

Re-check the QuickBooks, Upwork and email ones before you publish; these platforms change their rules often.

**QuickBooks**
1. **QuickBooks already captures emailed bills for free.** Users forward bills to an `@assist.intuit.com` address, and QuickBooks pulls date, amount and vendor into a Receipts list. Intuit's help page mentions no line items or PO matching. ([QuickBooks help](https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-payable/email-receipts-bills-quickbooks-online/L7r2LAQ7C_US_en_US)) **So the product, the demo and the case study must all lead with line-level checking, not with "reads your invoices".**
2. **Purchase orders only exist in QuickBooks Online Plus and Advanced.** ([ApprovalMax](https://support.approvalmax.com/portal/en/kb/articles/limitations-for-the-different-quickbooks-online-editions)) **So** matching also works from price lists and from the company's own past bills (doc 08).
3. **Intuit meters API reads, not writes.** Creating bills is free. Reads are metered: 500,000 a month free on the Builder tier, hard-capped. ([Truto](https://truto.one/blog/how-much-does-the-quickbooks-api-cost-2026-pricing-rate-limits/))
4. **Bills can be linked to PO lines through the API**, and minor version 75 or later is required. ([Intuit blog](https://blogs.a.intuit.com/2019/08/19/new-entities-supported-in-linked-transactions); [Truto guide](https://www.truto.one/blog/how-to-integrate-with-the-quickbooks-online-api-2026-guide))
5. **Real (non-sandbox) companies need production keys**: an app assessment questionnaire, plus EULA and privacy URLs. The App Store listing adds reviews reported at 6 weeks to over 6 months. ([Apideck](https://www.apideck.com/blog/quickbooks-security-review.md); [Satva](https://satvasolutions.com/blog/intuit-app-store-approval-timeline-developer-guide)) **Both are deferred to the optional go-live phase.**

**Email** (these shape self-serve onboarding)

6. **Postmark inbound needs the Pro plan** ($16.50 a month for 10K) or Platform. ([Postmark](https://postmarkapp.com/blog/new-we-made-pro-and-platform-tier-features-accessible-to-lower-volume-email-plans))
7. **Microsoft 365 blocks automatic external forwarding by default** for most organizations. Inbox rules that forward or redirect outside the company fail with `5.7.520 Access denied, Your organization does not allow external forwarding`. ([Microsoft Learn](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-policies-external-email-forwarding)) **So** onboarding has to detect this and offer alternatives (doc 02, E13-4).
8. **Gmail forwarding needs confirming:** Gmail sends a confirmation code to the forwarding address before it will forward. Our inbox receives that email, so onboarding must show the code to the user (E13-4).

**Upwork portfolio**

9. **Portfolio item fields:** title up to 70 characters, role up to 100, description up to 600, and up to 5 skill tags. Content can be images, video, audio, documents and external links. Recommended image size is 1000×750 (minimum 400×300). ([Upwork help](https://support.upwork.com/hc/en-us/articles/360016144974); [GigRadar](https://gigradar.io/blog/how-to-add-a-portfolio-on-upwork))
10. **No contact details:** portfolio items can't include email addresses or phone numbers, and **linked sites must follow the same rule**. Some hosting domains, including certain `.app` domains, may not be accepted as links. (Same Upwork help article.)
11. **Video:** Upwork's Project Catalog accepts one MP4 video of up to 60 seconds and 100 MB. I couldn't confirm the limits for portfolio items, so the plan uses a 60-second cut that fits both. ([Upwork help](https://support.upwork.com/hc/en-us/articles/4402033684115-Add-Video-to-Your-Project))

**Local-first** (checked 2026-11-17)

12. **Microsoft 365 mailboxes need OAuth for IMAP.** Basic authentication is disabled in all Exchange Online tenants and can't be turned back on; apps that read mail over IMAP must use OAuth 2.0. ([Microsoft Learn](https://learn.microsoft.com/en-us/exchange/clients-and-mobile-in-exchange-online/deprecation-of-basic-authentication-exchange-online)) **So** the password-based IMAP route works for personal Gmail and many other providers, not Microsoft 365. OAuth mailboxes are Phase 8.
13. **Gmail over IMAP needs an app password,** which requires 2-Step Verification. App passwords may be unavailable for work or school accounts, for 2-Step Verification with security keys only, and under Advanced Protection, and Google discourages them where an app offers Sign in with Google. ([Google](https://support.google.com/accounts/answer/185833)) **So** Google Workspace works only where the admin allows app passwords.
14. **QuickBooks development keys accept plain-HTTP `localhost` redirect URIs; production keys need HTTPS.** The development part was confirmed when setting up P0-1 (2026-11-16). ([Apideck](https://www.apideck.com/blog/how-to-get-your-quickbooks-api-key); [Intuit blog](https://blogs.intuit.com/2017/08/11/oauth-2-0-integration-tips-testing-redirect-url/)) **So** a laptop copy connects sandbox companies; a real company needs production keys for your own Intuit app (an assessment) and an HTTPS address.

---

## Open questions (answer them by building, then record them in `docs/decisions.md`)

1. How accurate is extraction on real invoice layouts, not just synthetic ones? (Task P0-7 uses real invoices you're allowed to use.)
2. How much of a typical company's setup can be inferred from 12 months of QuickBooks history? This is the self-serve plan's weakest assumption: real books are messier than any dataset we generate. P5-3 measures it on the demo dataset (ours, so partly circular) and on the sample data Intuit puts in a fresh sandbox company (not ours, so fairer). The real answer only comes from real companies in P7-1, which is why the admin console shows each company's auto-setup coverage (E11-1).
3. Can someone who has never seen the product get from sign-up to a posted sandbox bill in under 15 minutes, with no help? (Usability test, P5-9.)
4. Does the Upwork portfolio item lead to invites and interviews? (Track it from the day the item goes live, P3-9.)
5. Do viewers run it, or only watch? Compare repo visitors and clones (GitHub Insights → Traffic) with video views and invites. If almost nobody runs the quick start, keep it green in CI but spend polish on the video and the case study.
