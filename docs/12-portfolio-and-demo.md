# 12 · Portfolio and demo

The portfolio has to convince an Upwork client of four things, in this order:

1. **It works on real invoices**, not only on a scripted happy path.
2. **It catches money:** specific overcharges, in dollars.
3. **It's built properly:** QuickBooks posting that can't double-post, an audit trail, fraud checks, evals.
4. **It's a complete product:** self-serve sign-up through billing, so you can be trusted with a whole build.

## What ships when

| Version | Week | What's public | Depends on |
|---|---|---|---|
| **v1** | 8 | 60-second video against the real QuickBooks sandbox, 6 screenshots, case study page, Upwork portfolio item | Phases 0 to 3 |
| **v2** | 10 | **Live demo:** instant private workspace, guided tour, upload your own invoice | Phase 4 |
| **v3** | 15 | 3-minute walkthrough from sign-up to Stripe checkout; case study with final numbers | Phases 5 and 6 |

Shipping v1 at week 8 is deliberate. An Upwork client judges the project from a thumbnail, a minute of video and maybe one click. The self-serve and billing work (Phases 5 and 6) makes the product complete, but it isn't what wins the first invites.

---

## The demo dataset (`fixtures/demo/`, built in task P0-5)

One fictional company drives the tests, the public demo, the sandbox seed, the video and the case study. That way all of them show the same numbers.

**Company:** *Harbor Lane Supply Co.*, a fictional US industrial distributor on QuickBooks Online Plus (POs enabled).

- **12 vendors**, fictional names, with email domains on the reserved `.example` top-level domain (e.g. `billing@acme-fasteners.example`), so no real company is ever implied.
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

Golden tests assert every row. The total dollars flagged across the dataset becomes the headline number in the demo and the video, and it's computed, never typed in.

**What the seed must contain for these results to be true:**
- **The rules auto-setup produces from this history**, precomputed by `scripts/make-demo-dataset.ts` (a test checks they equal a live auto-setup run). #12 is caught only because auto-setup knows `acme-fasteners.example` from the vendor's QuickBooks email.
- **A few `learned` rules**, as if a reviewer had already corrected them: the case-of-12 factor that #14 needs.
- **Order:** scenarios 1–6 arrive first. The vendor in #11 also sent one of them, which gives the bank-detail baseline, and #10 repeats #2.
- **Two vendors deliberately not ready** after auto-setup (one with no email on file, one with mixed coding), to show the "needs input later" path. That's 10 of 12 ready, above the 80% bar in E13-3 AC5.

---

## The public demo (Phase 4)

### Why per-visitor workspaces, not a shared login on the QuickBooks sandbox

A shared demo login on one sandbox company breaks in practice. Visitors would see each other's edits. The second visitor to approve a seeded invoice would trip our own duplicate check on the first visitor's bill. POs would be used up within a day. Visitors can't log in to your sandbox to see the result anyway. So:

- **Public demo:** each visitor gets a private, 24-hour workspace on a **simulated QuickBooks** (the demo ledger adapter) seeded from `fixtures/demo/`.
- **The real QuickBooks sandbox** appears in the video and in the nightly end-to-end test, which proves the real integration.

### How it works

| Part | Design |
|---|---|
| Environment | A **separate deployment** (`demo.<domain>`): its own Render web, worker and Postgres, R2 bucket, Postmark server (inbound `in-demo.<domain>`), a Claude API key with its own spend limit, Stripe test keys, QuickBooks development keys. No customer data ever lives here. |
| Start | "Try the live demo" → Cloudflare Turnstile check → create a demo organization (`kind = demo`, `expires_at = now + 24h`) → bulk-insert the seed rows → set a signed, `HttpOnly` demo session cookie. Target: under 5 seconds. |
| Seed PDFs | Stored once in a shared read-only R2 prefix. Only visitor uploads are stored per workspace. |
| Extractions | Seed invoices load with their stored extraction (`model = replay`). **Matching runs for real** on load, so the exceptions come from the actual `src/core` code. |
| Ledger | `src/integrations/ledger/demo/` implements `LedgerAdapter`: reference data from the seeded tables; `createBill` writes to `demo_bills` and assigns an ID; PO billed quantities update; attachments are recorded. The "posted bill" view renders a QuickBooks-style bill, plus a toggle showing the **exact JSON** the real QuickBooks integration would send (same payload builder). |
| Restrictions | No QuickBooks connect or disconnect, no team invites, no outbound email, no billing-detail changes. Each shows "Not available in the demo". |
| Own invoice | Email to the workspace's inbox address or upload: 3 documents per workspace, 5 pages and 10 MB each; global daily cap; daily model-spend cap; kill switch `DEMO_UPLOADS_ENABLED`. |
| Abuse limits | 5 new workspaces per IP per hour; 500 per day globally; kill switch `DEMO_ENABLED`. Offensive edits only reach the person who made them, because workspaces are isolated. |
| Cleanup | An hourly job deletes expired workspaces: database rows and uploaded files. |
| Billing | The plans page and Stripe Checkout in test mode, with a "use card 4242 4242 4242 4242" hint. |
| Analytics | Privacy-friendly page analytics (no ad trackers): demo starts, tour completion, uploads. |

**Optional:** real sign-up in the demo environment, so technical visitors can connect their own Intuit sandbox company. **VERIFY** first that development keys accept sandbox companies from other Intuit developer accounts. If they don't, keep sign-up in the demo environment for your own recordings only.

---

## The QuickBooks sandbox (for the video and end-to-end tests)

- Create a **dedicated sandbox company** for the demo; don't use the default sample company.
- `scripts/seed-qbo-sandbox.ts` (task P3-6) creates the demo dataset's vendors, items, POs and a slice of bill history in the sandbox. Writes are free (doc 06).
- `scripts/reset-qbo-sandbox.ts` deletes bills that AP Agent created (identified by the `PrivateNote` marker) and recreates used-up POs. **Run it before every recording.**
- For the v3 walkthrough, use a Gmail account you control, forwarding to staging, so the video shows the Gmail confirmation code being caught on screen.

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
| 52–60 s | Dashboard: dollars flagged, zero-edit rate | "Live demo at the link" |

Use a 1920×1080 browser window at 100% zoom, the reset sandbox, and the demo dataset. **Never show real email addresses, real company names or contact details.**

### 3-minute walkthrough (v3)
Sign-up → connect the sandbox → auto-setup summary → Gmail confirmation code caught → first invoice → shadow comparison report → start posting → an exception resolved → bill in QuickBooks → plans and Stripe test checkout → a 15-second architecture slide. Host it on the case study page (and as an unlisted video, if you like).

## Screenshots (1000×750 minimum; capture at 2000×1500)

| # | Screen | Caption |
|---|---|---|
| 1 (thumbnail) | Exception detail with "+$65.00" visible | An invoice $65 over its purchase order, flagged line by line before anyone pays it. |
| 2 | Ready queue | Clean invoices wait in one queue; approve with one key and the bill is in QuickBooks within a minute. |
| 3 | QuickBooks sandbox bill | The bill as QuickBooks shows it: PDF attached, lines coded, purchase order linked. |
| 4 | Shadow comparison report | Shadow mode: before posting anything, it compares its work with the bills the team entered by hand. |
| 5 | Onboarding: Gmail code caught | Self-serve onboarding catches Gmail's forwarding confirmation code and shows it on screen. |
| 6 | Dashboard | Dashboard: dollars flagged, zero-edit rate and time saved, on fictional demo data. |

---

## Case study page (on the demo domain)

**Upwork rule:** linked pages can't contain contact details. No email address, phone number or contact form on this page or the demo. The only call to action is your Upwork profile. The privacy policy (needed because the demo accepts uploads) needs a contact for data requests: keep it on its own page, and re-read Upwork's current rule before you link anything.

**Outline**
1. **Headline:** "An AP agent that checks every supplier invoice line against what you agreed to pay, then posts it to QuickBooks."
2. **The problem**, paraphrased from real Upwork posts (no client names): retyping 150 to 300 invoices a day; nobody checking prices.
3. **What it does:** 5 bullets, the 60-second video, a **Try the live demo** button.
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

**Description (max 600; 480 used):**
> Supplier invoices arrive by email. This AI agent reads every line, checks it against purchase orders, price lists and past prices, and posts clean invoices to QuickBooks Online as bills with the PDF attached. People only handle the exceptions: price increases, extra quantities, surprise fees, duplicates and changed bank details. Fully self-serve: sign-up, QuickBooks connection, email forwarding, shadow mode and Stripe billing. Try the live demo (fictional data) from the link.

**Short version, if only 300 characters display (288):**
> Supplier invoices arrive by email. This AI agent reads every line, checks it against POs, price lists and past prices, and posts clean ones to QuickBooks Online as bills. People only handle exceptions: price increases, extra quantities, surprise fees, duplicates and changed bank details.

**Media order:** thumbnail (screenshot 1) → 60-second video → screenshots 2 to 6 → link to the live demo → link to the case study.

## Using it in proposals

For job posts about invoices, bills, AP or QuickBooks data entry:

> You need invoices from email read and entered into QuickBooks. I've built that, and it also checks each line against your POs and agreed prices before anything posts. It's in my portfolio: "AI Invoice Agent for QuickBooks". The live demo lets you approve invoices and see overcharges flagged on sample data in about a minute.
>
> For your setup: {one sentence about their volume, tools or format from the post}.
>
> One question so I can scope it: are your POs in QuickBooks, or do you work from price lists or contracts?

Keep it under 120 words, keep all contact on Upwork, and end with one qualifying question.

**Optional, later:** Upwork's Project Catalog sells fixed-price packages (title up to 75 characters including the "You will get…" prefix; description 120 to 1,200 characters; one MP4 video up to 60 seconds). It suits selling custom deployments of this build, which is a different business from the self-serve product. Decide separately.

## Publish checklist

- [ ] Domain isn't `.app`; demo and case study open in a private window with no login
- [ ] No email, phone or contact form on any linked page
- [ ] "Fictional data" label on the demo and the case study
- [ ] Kill switches (`DEMO_ENABLED`, `DEMO_UPLOADS_ENABLED`) tested; spend caps set on the Claude key
- [ ] Privacy policy live (the demo accepts uploads); uploads deleted within 24 hours (tested)
- [ ] Video at most 60 seconds, captions burned in, no real data on screen
- [ ] Case study numbers match the latest `pnpm eval` output, with the date shown
