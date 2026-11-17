# 02 · Customer journey

Two journeys matter:

- **Part 1: the customer.** A self-serve journey from first visit to auto-posting, with **no human from our side at any step**. Wherever a customer could get stuck, the product detects it and helps, by email or in the app. It's written for a company running its own copy; steps that exist only in a hosted edition (Phase 7) are marked.
- **Part 2: the portfolio viewer.** An Upwork client deciding whether to hire you. They're the real audience right now.

---

## Part 1: The customer (self-serve)

```mermaid
flowchart LR
  A[Discover] --> B[Run the demo<br/>locally]
  B --> C[Sign up]
  A --> C
  C --> D[Connect<br/>QuickBooks]
  D --> E[Auto-setup<br/>from history]
  E --> F[Get email in:<br/>connect a mailbox]
  F --> G[Price lists<br/>optional]
  G --> H[Shadow week:<br/>nothing posts]
  H --> I[Start posting:<br/>approve each bill]
  I --> J[Exceptions only]
  J --> K[Auto-post<br/>opt-in]
  I --> L[Choose plan<br/>hosted edition only]
```

**Targets:** `git clone` to the demo company in **under 5 minutes** with prebuilt images; sign-up to first processed invoice in **under 15 minutes** (median). Connected QuickBooks plus a working email route within 24 hours for **70% or more** of sign-ups.

### 1. Discover
- **Channels now:** the GitHub repo and the Upwork portfolio. **When selling a hosted edition** (doc 10): the QuickBooks App Store, search pages ("match bills to purchase orders QuickBooks") and bookkeeper referrals.
- **The README** leads with dollars caught, not "AI", then a one-command quick start. A hosted edition's landing page would add **Start free trial**.

### 2. Try the demo (optional; see doc 12)
- `docker compose up`, then **Sign in as the demo user**: a fictional distributor's 20 invoices have just arrived by email, with its POs, price list and history already loaded.
- A three-step guided tour: "This invoice is $65 over the PO" → "Approve a clean one" → "See the QuickBooks bill it creates".
- **Moment of truth:** seeing a specific overcharge flagged, with the dollar amount, within 60 seconds.

### 3. Sign up (target: under 2 minutes)
- Email and password (Google sign-in too, if the copy has a Google client configured); organization name. The first account on a copy becomes its instance admin, who can close sign-ups.
- **Hosted edition only:** accept the terms (the version and time are recorded), and a trial starts: 14 days, up to 100 invoices, no card. One trial per QuickBooks company, enforced by realm ID.
- Owners and admins enrol in MFA before connecting QuickBooks.

### 4. Connect QuickBooks
- A copy you run yourself connects sandbox companies with your own Intuit development keys; a real company needs production keys (doc 06).
- **Connect to QuickBooks** (Intuit's standard button) → Intuit consent → back to a sync screen: "Reading your vendors, items, open POs and 12 months of bills…" with live progress.
- Messages depend on the edition. Plus or Advanced: "14 open POs found; invoices will be checked against them." Essentials: "Your plan has no purchase orders. We'll check prices against your price lists and your own past bills."
- **Drop-off:** QuickBooks only lets an admin connect apps. **Remedy:** "Not a QuickBooks admin? Invite yours", which sends them an invite to the organization as admin.

### 5. Auto-setup from history (the replacement for a setup call)
Runs automatically after the first sync (details in E13-3 and doc 08):
- Vendor email domains from QuickBooks vendor records and past invoices → vendor aliases
- Each vendor's usual expense account, class and location → vendor defaults
- Line descriptions on past bills → item mappings for each vendor
- Vendors whose bills usually include freight → freight allowed for them
- Unit prices per vendor and item → the price-history baseline

**The user sees a summary:** "Set up 42 of 51 active vendors from your history. 9 vendors have too little history; we'll ask about them when their first invoice arrives." Then they pick a tolerance preset: **Strict** (exact), **Standard** (2% or $25, whichever is less), or **Relaxed** (5% or $100).

### 6. Getting email in (the step most likely to fail; see E13-4)
The routes depend on where the copy runs, with tabs:

| Route | What the product does |
|---|---|
| **Connect a mailbox (IMAP)** | The default for a copy you run yourself. Point it at the mailbox suppliers already send invoices to, or a dedicated one: host, username and password (an app password for Gmail). It reads only mail that arrives after you connect, unless you pick an earlier date after seeing the message count and an estimated cost. Login errors come with the provider's fix. **Microsoft 365** needs OAuth, which isn't built yet (doc 00, fact 12): the screen says so and offers the routes below. |
| **Upload or forward by hand** | Drag and drop, or forward single emails to the connected mailbox. Always available. Forwarding by hand works even where Microsoft 365 blocks automatic forwarding. |
| **Ask suppliers to send directly** | A ready-to-send notice the user can paste into their own email: "Please send invoices to …", with the connected mailbox's address (or the company's own address in a hosted edition). |
| **Forward to the company's own address** (hosted edition only) | The address `ap-<random>@in.<domain>` with a copy button. **Gmail:** step-by-step forwarding setup; Gmail emails a **confirmation code** to that address, and the product **shows the code on screen within seconds**, then gives a ready-to-paste filter built from the vendors' email domains, e.g. `from:(@acmesupply.com OR @boltco.com) has:attachment`. **Microsoft 365:** inbox rule instructions, plus a warning that it **blocks automatic forwarding outside the company by default** (error `5.7.520`). If nothing arrives within 30 minutes of the user saying the rule is set up, show the fix: ask IT to allow forwarding for this mailbox (link to Microsoft's article), or use another route. |
| **Send a test email** (local) | `pnpm send-invoice <file>` delivers a PDF to the built-in SMTP listener, so the whole path can be tried without a real mailbox. |

**Verification:** a live "Waiting for your first email…" panel turns green with "Received: Acme Supply, invoice 10442, $1,284.50" when the first invoice arrives. The step is done when one email comes through a route other than upload.

### 7. Price lists (optional)
Upload a CSV or Excel file in any layout. The product suggests which column is which (SKU, description, unit, price, effective date); the user confirms; a preview shows rows that failed and why. Skipping is fine; price history covers the gap.

### 8. Shadow week (default: first 7 days)
- Invoices are read and checked, but **nothing posts to QuickBooks**. The review queue works, and "approve" means "would post".
- Behind the scenes, Line Beagle watches the bills the team keeps entering by hand in QuickBooks (via sync) and matches them to its own results.
- **The shadow comparison report** (in the app, plus a daily email): "Your team entered 38 bills this week. Line Beagle had 36 of them ready; 31 matched exactly (vendor, amount, coding); 5 differed (see each). It flagged $640 in price variances on 4 invoices that were entered as billed."
- **Start posting** is offered when at least 20 invoices have been processed with a 60% or better zero-edit rate. The user can start earlier, after a warning.

### 9. Start posting: approve every bill
The clerk works the **Ready** queue with the PDF beside the fields. Approve, and the bill is in QuickBooks within a minute, PDF attached and PO linked. Exceptions sit in their own queue with the reason and the dollar impact.

### 10. Exceptions only
After a few weeks the clerk bulk-approves Ready invoices once a day and spends their time on exceptions. A **daily digest** at 8 AM local time lists new exceptions with dollar impact.

### 11. Auto-post (opt-in)
Offered only when the company meets the readiness bar in doc 08. The admin turns it on, optionally for selected vendors only. It switches itself off if accuracy drops.

### 12. Choose a plan (hosted edition only)
A copy you run yourself has no plans, trials or invoice limits, only the daily document cap that protects its owner's Claude bill (E10-3).
- In-app banner and emails on trial day 10, 13 and 14. **Choose plan** opens Stripe Checkout; the customer portal handles card, plan changes and **self-serve cancellation**.
- No plan at trial end: processing and posting pause (incoming mail is still stored), data is kept 30 days, and choosing a plan picks up where it left off.

### 13. Expand
More QuickBooks companies under one organization; invite the bookkeeper; Partner plan for bookkeeping firms (doc 10).

### Where self-serve users get stuck, and what the product does

| Signal (detected automatically) | Likely cause | Product response |
|---|---|---|
| Signed up, no QuickBooks connection after 24 hours | Not an admin; unsure what it accesses | Email: what we access and why, plus "invite your QuickBooks admin" |
| Connected, no email received after 48 hours | No mailbox connected, a Microsoft 365 mailbox, or forwarding blocked by Microsoft 365 | Email with provider-specific troubleshooting and the alternatives |
| The mailbox's IMAP login starts failing | Password changed or app password revoked | Pause that mailbox, show the fix in the app, and email the admins once |
| Gmail confirmation email received but no invoices after 1 hour | Confirmed, but no filter created | In-app prompt with the generated filter text |
| Shadow zero-edit rate under 40% after 20 invoices | Vendors or items not mapped; unusual layouts | Show the 3 least accurate vendors with one-click fixes |
| Ready queue growing, nobody approving | Reviewer left or lost trust | Email the owner a summary; suggest bulk approve |
| No invoices for 3 business days (after previously active) | Forwarding rule broke | Alert the admins with a re-test button |
| QuickBooks disconnected | Token revoked, or app removed | Pause posting; email a reconnect link |

Stuck-signal and lifecycle emails go out over SMTP. On a local copy they land in Mailpit unless `SMTP_URL` points at a real provider, so the in-app version of each message matters as much as the email.

**Activation** = QuickBooks connected, an email route verified, and 10 invoices processed within 7 days of sign-up. A hosted edition tracks it weekly; below 50%, fix onboarding before anything else. A local copy sends no analytics, so this is measured in the usability tests (P5-9).

---

## Part 2: The portfolio viewer (Upwork client)

```mermaid
flowchart LR
  A[Sees portfolio item<br/>or proposal link] --> B[Opens item:<br/>60-second video]
  B --> C[Opens the GitHub repo:<br/>README]
  C --> D[Reads case study]
  C --> E[Runs docker compose up<br/>technical viewers]
  E --> F[Finds an overcharge<br/>in the demo company]
  D --> G[Invites or messages<br/>on Upwork]
  F --> G
```

| Step | What they need | Design rule |
|---|---|---|
| Sees the item in your profile grid | A thumbnail and title that say "QuickBooks" and show a dollar amount | Thumbnail: the exception screen with "+$65.00 over PO" visible at 1000×750 |
| Opens the item | Understands it in 10 seconds | The first 300 characters of the description stand alone; the video's first 5 seconds show the result, not a logo |
| Opens the repo | Understands what it does before scrolling | The README's first screen: one sentence, what it catches in dollars, a GIF of the exception screen (from v2), the status stated honestly, fictional data labelled as such |
| Runs it (technical viewers) | It works the first time, with nothing to sign up for | One command, prebuilt images, the demo sign-in, under 5 minutes from `git clone`; tested in CI on every change |
| Tries it | Sees a real check, not a canned animation | The guided tour uses the real review UI. With their own Claude key, they can upload their own invoice and run real extraction |
| Reads the case study | Evidence that it's built properly | Architecture, accuracy on the test set (labelled as such), security, idempotent posting, audit trail. **No invented clients or results** |
| Decides to contact you | A clear next step on Upwork | **No email, phone or contact form** in the repo, the README, the case study or your GitHub profile (Upwork's rule covers linked sites). "Invite me to your job on Upwork" is the only call to action |

**Track:** profile views (Upwork's own stats), repo visitors and clones (GitHub Insights → Traffic), video views, and invites or messages that mention the project. A local copy sends no analytics.
