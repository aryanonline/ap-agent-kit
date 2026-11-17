# 01 · Vision

> **Current goal:** a complete, self-serve product that could be sold tomorrow, released as open source that runs on your own computer, and shown as an Upwork portfolio project. It isn't being sold or set up for anyone (see `00-assumptions.md`). This doc describes the product as it would be sold, because that's what the portfolio has to prove.

## One sentence

Line Beagle reads every supplier invoice that arrives by email, checks each line against what the buyer agreed to pay, and posts the clean ones to QuickBooks Online as bills, so a person only touches the invoices that are wrong.

## The problem

Small distributors and service firms get 100 to 1,000 supplier invoices a month, mostly PDFs attached to emails. Someone retypes each one into QuickBooks. Almost nobody checks it against the purchase order or the agreed price, because there isn't time. The Upwork posts that started this project describe it:

- A US distributor has three people keying 150 to 300 supplier documents a day.
- A New Zealand firm wants invoices checked against POs and agreed rates, with duplicates flagged.
- A waste-services manager audits vendor invoices by hand before rebilling customers.
- A construction firm is hiring a $2,000 a month AP clerk to do the retyping.

The business pays twice: once in labour to retype invoices, and again in overcharges nobody catches. Those overcharges are wrong unit prices, quantities above what was ordered, fees that were never agreed, and invoices paid twice.

## Who it's for

**Ideal customer**
- A US company on **QuickBooks Online** (Plus or Advanced for PO matching; Essentials works with price lists and price history)
- 100 to 1,000 supplier invoices a month, mostly PDFs by email
- Buys against **purchase orders or agreed prices**: distributors, wholesalers, and service firms with contracted supplier rates
- Has an office manager or AP clerk doing the data entry, and often an outside bookkeeper

**Not for (yet):** construction (Adaptive owns it), companies under about 50 invoices a month (QuickBooks' free capture is enough for them), NetSuite or SAP companies, and anyone who wants us to pay their bills.

| Role | What they care about | Their fear |
|---|---|---|
| **Owner / GM** (pays) | Money leaking to suppliers; the cost of data entry | Paying for software nobody uses |
| **AP clerk / office manager** (daily user) | Less retyping; fewer "why did we pay this?" questions | Being replaced; the tool making mistakes they get blamed for |
| **Outside bookkeeper** (influencer) | Clean books; fewer cleanup hours | A tool that makes a mess in QuickBooks |

## The product

1. **Sign up and connect QuickBooks in minutes.** Line Beagle reads 12 months of the company's bills and configures itself: which vendors send from which email domains, how each vendor is usually coded, what each item usually costs. No setup call.
2. **Email comes straight in.** Connect the mailbox suppliers already send invoices to (or, in a hosted edition, forward to the company's own address). Upload works everywhere.
3. **It reads every line:** vendor, invoice number, dates, PO number, each line's item, quantity, unit and price, plus freight, fees and tax.
4. **It checks every line** against the open PO in QuickBooks, an uploaded price list, or the company's own recent prices from that vendor. It also checks the arithmetic, and looks for duplicates and changed bank details.
5. **It starts in shadow mode.** For the first week nothing posts. Line Beagle compares what it would have posted with the bills the team entered by hand, and shows the result. Trust is earned before it touches the books.
6. **Clean invoices** go to a one-click approve queue (later, posted automatically). **Wrong ones** say exactly what's wrong and by how many dollars.
7. **Approved invoices become QuickBooks bills**, with the PDF attached, lines coded, and the PO linked.
8. **Every correction teaches it.** Map "SKU 44-210 Hex Bolt" to a QuickBooks item once, and it's used every time after.

## Why it could win

The honest version: reading invoices is a commodity. QuickBooks does it for free at header level, and Dext, Hubdoc, BILL and Ramp all capture invoices. A product like this wins only on three things:

1. **Line-level checking against what was agreed.** Capture tools record what the supplier says. This checks whether the supplier is right, and that's where the money is.
2. **Fit without a setup call.** It configures itself from the company's own QuickBooks history and learns from every correction, so it fits each customer's vendors, items and units without anyone doing the setup.
3. **Proof in dollars.** The shadow-mode comparison and the monthly "overcharges flagged" number justify the price better than "hours saved".

## Why it might fail

Kept here so the build and the portfolio stay honest.

| Risk | Early signal | Response |
|---|---|---|
| **Tuned to synthetic invoices**, so it looks polished but fails on real layouts | Real-world check (P0-7) far below the synthetic eval | Fix extraction on real layouts before building the app. Anyone running it can upload their own invoice with their own key (P4-3), so the demo isn't canned |
| **Nothing to match against:** many small businesses have no POs or price lists | Auto-setup (P5-3) finds little price history in sandbox-like data | Price history from past bills is the fallback; say plainly in onboarding which checks are active |
| **Self-serve users stall on getting email in** (Microsoft 365 needs OAuth for IMAP and blocks automatic forwarding by default; Gmail needs an app password) | Sign-ups that never receive a first email | Detect each case and show the provider's fix, with forwarding by hand and upload as fallbacks (E13-4). OAuth mailboxes in Phase 8 |
| **Nobody runs it:** Upwork clients won't install Docker to try a portfolio piece | Repo visitors but few clones (GitHub Insights → Traffic) | The video, README and case study carry the pitch; CI keeps the quick start working for the technical clients who do run it |
| **Real QuickBooks companies can't connect** without production keys for the copy's own Intuit app | People running a copy ask how to connect their real company | Doc 06 explains the production-key steps; the sandbox is enough for the portfolio |
| **Accuracy below 60% zero-edit** for a new company | Shadow comparison report | Shadow mode, per-vendor accuracy, and the learning loop. Don't let a company post until it's ready |
| **Intuit adds PO matching to QuickBooks** | Intuit announcements | The edge is fit and checks, not the feature. Move to Xero and multi-entity |
| **Intuit changes API fees or rules** | Partner Program emails | The ledger sits behind an adapter; read calls are counted per company |
| **A wrong bill leads to a wrong payment** | Any posted bill a customer has to fix | Human approval by default, shadow mode, a full audit trail, and liability limited in the terms |
| **The portfolio doesn't bring work** | No invites a month after it goes live (P3-9) | Fix the thumbnail, title and first 300 characters; target posts that mention QuickBooks and PDFs |

## What success looks like

**For the portfolio** (now):

| When | Milestone |
|---|---|
| Week 2 | Eval gates pass on synthetic invoices; real-world check recorded |
| Week 8 | **Portfolio v1 live on Upwork:** a 60-second video against the QuickBooks sandbox, screenshots, case study, and the public repo |
| Week 10 | **Portfolio v2:** `docker compose up` gives anyone the demo company with no keys, where they can approve invoices and see overcharges flagged; checked in CI on every change |
| Week 15 | **Portfolio v3:** the full self-serve flow, from install and sign-up to posting, in a 3-minute walkthrough |
| Ongoing | Invites and interviews from the portfolio; repo visitors and clones per week |

**If you decide to sell** (Phase 7): a hosted edition with production keys, an App Store listing and Stripe live, then 10 paying self-serve customers at a 70% or better zero-edit rate.

**North-star metric (product):** the **zero-edit rate**, the share of invoices posted with no human change to any field.
**Proof metric (customers and portfolio):** **dollars flagged** per month, next to the subscription price.

## Non-goals

- Done-for-you setup, onboarding calls, or anything needing a person on our side
- Paying bills, or holding customer money
- Approval chains with multiple approvers
- Supplier portals, EDI, or scraping supplier websites
- Receipts and card expenses (QuickBooks and Dext already do this)
- Accounts receivable (sales invoices)
- A general "AI bookkeeper"
