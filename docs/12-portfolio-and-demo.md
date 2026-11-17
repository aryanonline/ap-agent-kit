# 12 · Portfolio and demo

The portfolio has to convince an Upwork client of four things, in this order:

1. **It works on real invoices**, not only on a scripted happy path.
2. **It catches money:** specific overcharges, in dollars.
3. **It's built properly:** QuickBooks posting that can't double-post, an audit trail, fraud checks, evals.
4. **It's a complete product** that anyone can run: self-serve from install and sign-up to posting, so you can be trusted with a whole build.

## What ships when

| Version | Week | What's public | Depends on |
|---|---|---|---|
| **v1** | 8 | 60-second video against the real QuickBooks sandbox, 6 screenshots, the case study, the public repo and its README, the Upwork portfolio item | Phases 0 to 3 |
| **v2** | 10 | **Run it yourself:** `docker compose up` gives anyone the demo company with no keys, checked in CI on every change; a GIF in the README; upload your own invoice with your own Claude key | Phase 4 |
| **v3** | 15 | 3-minute walkthrough from install and sign-up to posting; case study with final numbers | Phases 5 and 6 |

Shipping v1 at week 8 is deliberate. An Upwork client judges the project from a thumbnail, a minute of video and maybe one click, and that click now lands on the GitHub repo, so the README's first screen matters as much as the video. At v1 the README says plainly that the one-command demo arrives in v2. The self-serve and billing work (Phases 5 and 6) makes the product complete, but it isn't what wins the first invites.

---

## The demo dataset (`fixtures/demo/`, built in task P0-5)

One fictional company drives the tests, the demo company, the sandbox seed, the video and the case study. That way all of them show the same numbers.

**Company:** *Harbor Lane Supply Co.*, a fictional US industrial distributor on QuickBooks Online Plus (POs enabled).

- **12 vendors**, fictional names, with email domains on the reserved `.example` top-level domain (e.g. `billing@acme-fasteners.example`), so no real company is ever implied. **Open (`decisions.md`, 2026-11-17):** QuickBooks refused a `.example` address in the sandbox's company settings but accepted `*.example.com`. If its API also refuses `.example` vendor emails, switch to `*.example.com` hosts, and make the domain checks compare whole hosts (never `example.com` alone), or every vendor would share one domain. Decide in P0-5; confirm in P1-7.
- **25 items**, a mix of each-priced and case-priced.
- **8 open POs**, a price list for 3 vendors, and 12 months of generated bill history (about 400 bills) for the price-history baseline and auto-setup.
- **Fake bank details** that are obviously not real (e.g. routing `000000000`), consistent per vendor except where a scenario changes them.
- **20 invoices** as PDFs in at least 6 layouts, each with expected results (`expected/<n>.json`: extraction, exceptions, dollar impact):

| # | Scenario | Expected result |
|---|---|---|
| 1–6 | Clean: PO-matched (3), price-list matched (2), price-history matched (1) | Ready |
| 7 | Hex bolts at $14.20 vs PO $12.90, 50 units | `price_variance`, +$65.00 |
| 8 | 60 CS invoiced; 40 CS open on the PO line | `qty_over_po`, 20 extra = $258.00 |
| 9 | Fuel surcharge not on the PO or the vendor's allowed fees | `unexpected_fee`, $38.00 |
| 10 | Invoice #2 sent again with the same number | `duplicate_suspected` |
| 11 | Known vendor, bank account changed | `remit_to_changed` |
| 12 | Known vendor's name, sent from a look-alike domain (`acrne-fasteners.example`, "rn" for "m") | `new_sender` |
| 13 | Vendor not in QuickBooks | `unknown_vendor` with suggestions |
| 14 | Priced per case; PO in each; known factor of 12 | Ready (unit conversion shown) |
| 15 | Unit not seen before for this vendor and item | `uom_unknown` |
| 16 | Subtotal printed wrong by $36.00 | `arithmetic_mismatch` |
| 17 | Credit memo | `credit_memo` |
| 18 | Monthly statement | Archived (not an invoice) |
| 19 | One PDF with 2 invoices | Split into 2; both evaluated |
| 20 | Phone photo of a paper invoice | Ready, with a `low_quality_scan` warning |

Golden tests assert every row. The total dollars flagged across the dataset becomes the headline number in the README, the demo and the video, and it's computed, never typed in.

**What the seed must contain for these results to be true:**
- **The rules auto-setup produces from this history**, precomputed by `scripts/make-demo-dataset.ts` (a test checks they equal a live auto-setup run). #12 is caught only because auto-setup knows `acme-fasteners.example` from the vendor's QuickBooks email.
- **A few `learned` rules**, as if a reviewer had already corrected them: the case-of-12 factor that #14 needs.
- **Order:** scenarios 1–6 arrive first. The vendor in #11 also sent one of them, which gives the bank-detail baseline, and #10 repeats #2.
- **Two vendors deliberately not ready** after auto-setup (one with no email on file, one with mixed coding), to show the "needs input later" path. That's 10 of 12 ready, above the 80% bar in E13-3 AC5.

---

## The demo company (local, Phase 4)

### Why a seeded demo company on a simulated ledger

Anyone who clones the repo should see the product working within minutes, with no Intuit, Anthropic or Stripe account. So the demo company:
- is a normal organization (`kind = demo`) seeded from `fixtures/demo/`, sitting beside any real companies in the same copy;
- replays stored extractions, so it needs no Claude key and gives the same results every time, while **matching runs for real**;
- posts to a **simulated QuickBooks** (the demo ledger adapter), so it needs no Intuit account and can be reset at will.

The real QuickBooks sandbox appears in the video and in `pnpm test:e2e:sandbox`, which prove the real integration. (A shared login on one sandbox was never an option for viewers: they'd see each other's edits, use up the POs and trip the duplicate check on each other's bills.)

### How it works

| Part | Design |
|---|---|
| First run | `docker compose up` on an empty database seeds the demo organization and its demo user, then emails the 20 invoices to the built-in SMTP listener in scenario order, so they arrive through the real intake path (E14-1). |
| Sign-in | **Sign in as the demo user** on the sign-in page, shown only when `DEMO_LOGIN=true` (the Compose default) and `APP_URL` is a localhost address. The demo user belongs to the demo organization only and is never the instance admin (doc 09, T11). |
| Extractions | Seed invoices load the stored extraction for their file's SHA-256 (`model = replay`). Your own uploads into the demo company use your Claude key; with none set, the upload panel says how to add one. |
| Ledger | `src/integrations/ledger/demo/` implements `LedgerAdapter`: reference data from the seeded tables; `createBill` writes to `demo_bills` and assigns an ID; PO billed quantities update; attachments are recorded. The "posted bill" view renders a QuickBooks-style bill, plus a toggle showing the **exact JSON** the real QuickBooks integration would send (same payload builder). |
| Restrictions | The demo company can't connect QuickBooks; it always uses the simulated ledger. Its emails go to Mailpit, like everything on a local copy. |
| Reset | **Settings → Reset demo company**, or `pnpm demo:reset`: deletes its rows and files, reseeds it, and resends the invoices, in under 30 seconds. |
| Label | Every page in the demo company shows "Demo company: fictional data". |
| Guided tour | Three steps on the real UI: an overcharge flagged, approve a clean invoice, see the bill it created (E14-2). |
| Billing | Off. With `BILLING_ENABLED=true` and Stripe test keys, the plans page and Checkout work in test mode (card 4242 4242 4242 4242), with webhooks forwarded by the Stripe CLI. |
| CI | Every pull request runs the quick start from a clean checkout with no secrets and walks the tour with Playwright (P4-4). If the README's promise breaks, the PR can't merge. |

---

## The QuickBooks sandbox (for the video and end-to-end tests)

- Create a **dedicated sandbox company** for the demo; don't use the default sample company.
- `scripts/seed-qbo-sandbox.ts` (task P3-6) creates the demo dataset's vendors, items, POs and a slice of bill history in the sandbox. Writes are free (doc 06).
- `scripts/reset-qbo-sandbox.ts` deletes bills that Line Beagle created (identified by the `PrivateNote` marker) and recreates used-up POs. **Run it before every recording.**
- Intuit's sample data is in the sandbox too (`decisions.md`, P0-1): hide or delete it before recording, so only Harbor Lane's data is on screen.
- For the v3 walkthrough, connect a Gmail mailbox you control over IMAP (with an app password) and send it a demo invoice, so the video shows real mail arriving. Keep its address off screen.

---

## Video

### 60-second Upwork cut (v1; MP4, 1080p, under 100 MB, captions burned in)

| Time | Shot | Caption |
|---|---|---|
| 0–5 s | Exception screen: "+$65.00 over PO 4471" | "Catches supplier overcharges before you pay them" |
| 5–15 s | Email with PDF arrives → appears in the queue, read | "Invoices arrive by email and are read line by line" |
| 15–30 s | Open #8 (quantity over PO) and #9 (surprise fee), dollars shown | "Every line checked against POs, price lists and past prices" |
| 30–42 s | Approve a clean invoice → QuickBooks sandbox bill with PDF attached and PO linked | "Clean invoices post to QuickBooks with one key" |
| 42–52 s | #11 changed bank details, with the warning | "Flags changed bank details and look-alike senders" |
| 52–60 s | Dashboard: dollars flagged, zero-edit rate | "Open source: run it yourself from the link" |

Record on a local copy, in a 1920×1080 browser window at 100% zoom, with the reset sandbox and the demo dataset. **Never show real email addresses, real company names or contact details.**

### 3-minute walkthrough (v3)
`docker compose up` → sign-up → connect the sandbox → auto-setup summary → connect a mailbox → the first invoice arrives → shadow comparison report → start posting → an exception resolved → bill in QuickBooks → (optional) plans and Stripe test checkout → a 15-second architecture slide. Host it as an unlisted video and link it from the README and the case study.

## Screenshots (1000×750 minimum; capture at 2000×1500)

| # | Screen | Caption |
|---|---|---|
| 1 (thumbnail) | Exception detail with "+$65.00" visible | An invoice $65 over its purchase order, flagged line by line before anyone pays it. |
| 2 | Ready queue | Clean invoices wait in one queue; approve with one key and the bill is in QuickBooks within a minute. |
| 3 | QuickBooks sandbox bill | The bill as QuickBooks shows it: PDF attached, lines coded, purchase order linked. |
| 4 | Shadow comparison report | Shadow mode: before posting anything, it compares its work with the bills the team entered by hand. |
| 5 | Onboarding: mailbox connected | Connect the mailbox your invoices already go to; the first one appears within minutes. |
| 6 | Dashboard | Dashboard: dollars flagged, zero-edit rate and time saved, on fictional demo data. |

---

## Case study (in the repo)

**Where:** `docs/case-study.md`, linked from the top of the README. GitHub renders it; publishing it with GitHub Pages is optional.

**Upwork rule:** linked pages can't contain contact details. No email address, phone number or contact form in the case study, the README, the rest of the repo, or your GitHub profile (check its public email and website fields). The only call to action is your Upwork profile. A local copy collects nothing, so no privacy policy is needed until a hosted edition. Re-read Upwork's current rule before you link anything.

**Outline**
1. **Headline:** "An AP agent that checks every supplier invoice line against what you agreed to pay, then posts it to QuickBooks."
2. **The problem**, paraphrased from real Upwork posts (no client names): retyping 150 to 300 invoices a day; nobody checking prices.
3. **What it does:** 5 bullets, the 60-second video, and a **Run it yourself** link to the README's quick start.
4. **How it works:** the pipeline diagram from doc 04.
5. **Why it's reliable:** the model reads and code decides; arithmetic checked against the printed values; posting can't duplicate; every change audited; shadow mode before posting; fraud checks; evals on every change.
6. **Results on the test set:** a table filled from `pnpm eval` and the demo dataset, covering header accuracy, line accuracy, median processing time and model cost per invoice. Label it: "Measured on N synthetic and M real invoices on <date>."
7. **Security and data handling:** 4 lines from doc 09.
8. **Tech stack.**
9. **Footer:** "Portfolio project. All company data shown is fictional." plus a link to your Upwork profile.

**Honesty rules:** no invented clients, testimonials or logos; no "saved a client $X". Every number is reproducible from the repo and dated. Being caught overclaiming costs more than a modest number.

---

## Upwork portfolio item (draft; character counts checked)

| Field | Draft | Length |
|---|---|---|
| Title (max 70) | **AI Invoice Agent for QuickBooks: PO & Price Matching** | 52 |
| Title, short option | AI Invoice Agent for QuickBooks Online | 38 |
| Role (max 100) | Product design and full-stack build: Next.js, Postgres, Claude API, QuickBooks Online API | 89 |
| Skills (5 tags) | Pick the closest tags Upwork offers to: QuickBooks Online · API Integration · AI agent development · Next.js · Accounts payable | — |

**Description (max 600; 516 used):**
> Supplier invoices arrive by email. This AI agent reads every line, checks it against purchase orders, price lists and past prices, and posts clean invoices to QuickBooks Online as bills with the PDF attached. People only handle the exceptions: price increases, extra quantities, surprise fees, duplicates and changed bank details. Built as a complete product: QuickBooks connection, auto-setup, shadow mode, audit trail and evals. Open source; runs on your computer with one command. Code and case study at the link.

**Short version, if only 300 characters display (288):**
> Supplier invoices arrive by email. This AI agent reads every line, checks it against POs, price lists and past prices, and posts clean ones to QuickBooks Online as bills. People only handle exceptions: price increases, extra quantities, surprise fees, duplicates and changed bank details.

**Media order:** thumbnail (screenshot 1) → 60-second video → screenshots 2 to 6 → link to the GitHub repo → link to the case study.

## Using it in proposals

For job posts about invoices, bills, AP or QuickBooks data entry:

> You need invoices from email read and entered into QuickBooks. I've built that, and it also checks each line against your POs and agreed prices before anything posts. It's in my portfolio: "AI Invoice Agent for QuickBooks". The one-minute video shows it flagging overcharges on sample data, and the code is public.
>
> For your setup: {one sentence about their volume, tools or format from the post}.
>
> One question so I can scope it: are your POs in QuickBooks, or do you work from price lists or contracts?

Keep it under 120 words, keep all contact on Upwork, and end with one qualifying question.

**Optional, later:** Upwork's Project Catalog sells fixed-price packages (title up to 75 characters including the "You will get…" prefix; description 120 to 1,200 characters; one MP4 video up to 60 seconds). It suits selling custom deployments of this build (the open-source code makes that easy to show), which is a different business from a hosted product. Decide separately.

## Publish checklist

- [ ] The README's first screen says what it does and what it catches, and states the status honestly
- [ ] No email, phone, contact form or off-Upwork contact link in the repo, the README or the case study
- [ ] Your GitHub profile shows no email, phone or personal website (Upwork's rule covers linked sites)
- [ ] "Fictional data" stated on the demo company, in the README and in the case study
- [ ] From v2: the quick-start smoke test is green on `main`, and a clone in a fresh folder reaches the demo company
- [ ] No secrets in the git history: GitHub secret scanning and push protection on, no open alerts
- [ ] Video at most 60 seconds, captions burned in, no real data or addresses on screen
- [ ] Case study numbers match the latest `pnpm eval` output, with the date shown
- [ ] `LICENSE` present; the repo's description and topics set

## Open-source launch (optional, after v2)

Once the quick start is green in CI: a Show HN post, and posts in communities such as r/selfhosted and r/QuickBooks where their rules allow it. Stars make the portfolio look more credible, but they're a noisy signal; invites on Upwork remain the measure (doc 00, open question 4).
