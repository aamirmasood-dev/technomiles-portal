# Technomiles Accounts Hub

Internal web app for Technomiles (owners: Aamir Masood and Imran Anwar Awan, 50/50 partners). It pulls orders and marketplace fees from client stores every day and produces month-end statements showing what each client owes Technomiles under their contract.

Today this is done by hand: downloading order files from every platform and calculating in Excel. The goal is to remove that work.

## Scope

In scope:
- Platforms: **Shopify, eBay, Amazon**. Design the connector layer so **Walmart** can be added later without changing the rest of the app.
- Clients with configurable contract terms, added and edited from the UI.
- Daily automatic sync, manual expense entry, product costs (COGS), month-end statements that can be locked and exported.

In scope since Sep 2026 (owner's decision): an internal **Company** section in the same portal, see "Company accounts" below.

## Current clients

| Client | Stores | Currency | Agreement |
|---|---|---|---|
| Kensingtons (Mr. Qasim), UK bedding | Shopify: Kensingtons Bedding (kensingtonsbedding.co.uk), Raymat Textiles (raymattextile.co.uk); Amazon UK: 1 account; eBay UK: 4 accounts (Kensingtons Bedding `kensingtons-uk`, Raymat Home `raymathome`, Online Bedding 4U `onlinebedding4u`, Duvets Online) | GBP | **10% of net sale** after all online selling expenses (marketplace charges, Shopify fees incl. plan and apps, shipping service charges, ad costs) |
| Jawa Jewelers, US jewelry | Shopify: jawajewelers.com; Amazon US: 1 account; eBay US: 2 accounts (Jawa Fashion `goldntime2013`, Ask4Fashion) | USD | **50% of net profit** after all expenses |

New clients must be addable from the UI with their own terms.

## Business decisions (confirmed by the owner, Sep 2026)

These apply to **every client**, current and future.

- **Follow the contract, not the old Excel.** The Aug 2026 Excel for Kensingtons deducted only the eBay variable final value fee, ignored refunds, used eBay sales before discount, and estimated Amazon fees at 18%. The system must deduct **all** actual platform charges (fixed + variable FVF, regulatory, international, surcharges, Promoted Listings, labels, refunds, actual Amazon fees) and use sales after discounts. Expect results to differ from the old Excel.
- **VAT / sales tax is not our concern.** The client handles VAT. Use the sale amount the platform shows; never add tax to sales (Shopify: net sales excl. tax; eBay UK: amounts as reported, no separate VAT; US marketplace-collected sales tax is excluded).
- **Refunds count in the month they happen**, not the month of the sale (sale 25 Aug, refund 10 Sep → refund deducted in Sep).
- **Losses carry forward.** If a month's base is negative (big refunds, bulk stock purchase), the loss is carried to the next month and deducted from its base; Technomiles is paid only once the loss is recovered. No floor-at-zero that discards a loss.
- **Closed months stay editable**, but the amount already invoiced never changes: any later difference (positive or negative) is carried into the **next open month** as an adjustment line.
- **Currency conversion:** foreign-currency sales (e.g. Kensingtons' EU orders in EUR) are converted to the client's currency at the **rate on the order/transaction date** (ECB daily reference rate unless the owner picks another source).
- **Jawa costing is per order, not per SKU** (hand-made pieces, daily gold/silver prices, dropship from several suppliers). Each sold order gets a cost entry: **supplier name, item cost, handling charge** (separate fields). Bulk purchases are entered once as a "Purchases" expense and the orders it covers get cost 0 (managed manually). **A month cannot be closed while any order has no cost entry.**
- **External shipping costs** (Parcelforce, EVRI, ShipStation, …) are entered manually per client as configurable shipping-provider columns, shown separately from sales. Platform-bought labels come from the APIs. Shipping charged to customers is shown separately from item sales in the summary.
- **Shopify plan and app fees** count as selling expenses (they are not in the API: enter as recurring manual expenses).
- **Start month: October 2026.** No historical import.
- **Clients have no login.** The owners download the PDF invoice and email it themselves; the app sends nothing.

## Tech stack and hosting

- **Next.js** (App Router, TypeScript), server actions for forms.
- **MySQL** (Hostinger provides managed MySQL). Use an ORM that has no native binaries to download; Drizzle + mysql2 is a good fit.
- Hosted on the owner's **Hostinger Business** plan as a Node.js web app (hPanel → Websites → Add website → **Deploy Web App**, using **file upload**, not GitHub). Start command must honour `$PORT`. Develop and test **locally first**, then deploy.
- Daily sync is triggered by an hPanel **cron job** calling a protected URL, e.g. `curl -s "https://<domain>/api/cron/sync?key=$CRON_SECRET"`. Also a "Sync now" button per store.
- Login for the owners only (email + password, bcrypt, signed session cookie). A script to create users.
- All platform credentials encrypted at rest (AES-256-GCM, key from env `ENCRYPTION_KEY`). Never log secrets.

## Data model (suggested)

- `users`
- `clients`: name, timezone (e.g. Europe/London, America/New_York), notes, active
- `stores`: client, platform (SHOPIFY / EBAY / AMAZON / WALMART), name, currency, region/marketplace, encrypted credentials, sync start date, last sync time and status, active
- `orders` + `order_items`: unique on (store, external order id); items hold SKU, title, quantity (used for COGS)
- `ledger_lines`: one row per money movement: store, external id (unique per store, so re-syncing is idempotent), order id, posted date, **category**, signed amount, currency, description
- `manual_expenses`: client, optional store, date, deduction group, amount, currency, description, optional shipping provider; recurring monthly expenses (e.g. Shopify plan/apps)
- `shipping_providers`: client, name (Parcelforce, EVRI, ShipStation, …): the columns for external shipping costs
- `order_costs`: order, supplier name, item cost, handling charge, currency, notes (per-order COGS; replaces per-SKU product costs)
- `fx_rates`: date, from/to currency, rate (cached daily rates)
- `contract_terms`: see below
- `statements`: client, period (YYYY-MM), closed snapshot (JSON), closed at/by, invoice number, loss carried in/out, adjustment carried in
- `business_settings`: Technomiles logo, name, address, bank details, invoice numbering, other invoice text (edited in the portal)
- `sync_logs`: per run: store, times, status, message, counts

Store money as **integer minor units** (pence/cents) to avoid rounding errors.

### Ledger categories and sign convention

Amounts are signed from the seller's point of view: money in is positive, costs are negative.

`SALES`, `SHIPPING_CHARGED`, `TAX_COLLECTED`, `TAX_WITHHELD`, `REFUNDS`, `MARKETPLACE_FEES`, `FULFILLMENT_FEES`, `PAYMENT_FEES`, `SHIPPING_LABELS`, `ADVERTISING`, `SUBSCRIPTION`, `OTHER_FEES`, `REIMBURSEMENTS`, `ADJUSTMENTS`

Payouts/transfers/withdrawals are money movement, not P&L: do not record them.

## Contract terms and calculation

Each client can have one or more terms, each with:
- name and a label for the base (e.g. "Net sale", "Net profit")
- rate % applied to the base, plus an optional fixed monthly fee
- which **deduction groups** are subtracted (checkboxes): refunds, marketplace fees (incl. fulfilment), payment fees, shipping (platform labels + manual courier costs), advertising, subscriptions, other platform fees/adjustments (net of reimbursements), COGS, other manual expenses
- include shipping charged in sales (default yes), include tax in sales (default no)
- which stores count (default: all of the client's stores)
- effective from / to month

Calculation for a client and month:
1. Gross = SALES (+ SHIPPING_CHARGED) (+ tax, if included), converted to the client currency at order-date rates
2. Base = Gross − each selected deduction group (as a positive cost)
3. Base −= loss carried forward from the previous month; += adjustments carried in from changes to closed months
4. If Base < 0: share = 0 and the loss carries forward. Otherwise Share = Base × rate + fixed fee
5. Group everything **by currency**; never mix GBP and USD.

Kensingtons' term = 10%, deducting refunds, marketplace, payment, shipping (platform labels + Parcelforce/EVRI), advertising, subscriptions (incl. Shopify plan/apps), other platform fees. Base = "Total net sales" after shipping labels.
Jawa's term = 50%, deducting all of those plus COGS (per-order costs), purchases and other manual expenses (e.g. ShipStation).

Manual expenses are tagged with a deduction group, so they fall into the same checkboxes. A manual expense with no store applies only to terms covering all stores.

COGS = sum of per-order cost entries (item cost + handling) for orders in the month. List orders with no cost entry; they block closing the month.

Month boundaries use the **client's timezone**. Lines are assigned to a month by their **posted/transaction date**.

Statements: view live (draft), then **Close** to save a snapshot and assign an invoice number. A closed month can still be edited, but its invoiced amount stays fixed; the difference is carried into the next open month as an adjustment. Export CSV and a PDF (print-friendly page) with two parts:
1. **Invoice**: Technomiles logo, business details, bank details, invoice number/date, client, month, amount due.
2. **Monthly summary**: sales per platform/store, shipping charged, expenses by category, external shipping costs, loss/adjustments carried in, base, share. Per-store and per-category breakdown so the client can check it.

### Statement rules as implemented

- Engine: `src/lib/statement/engine.ts` (pure, unit-tested); loading, carry-forward and closing: `src/lib/statement/load.ts`.
- Months are closed **in order** per term, and only after the month has ended. Closing assigns the next invoice number (`business_settings.next_invoice_number`) and stores the full result as a JSON snapshot.
- Only the most recently closed month can be **reopened** (for mistakes before the invoice is sent); its invoice number is not reused.
- Drift in a closed month = live base-before-carry − snapshot base-before-carry − adjustments already carried for it. It is applied to the first open month and recorded in `statement_adjustments` when that month closes.
- The fixed monthly fee is charged even in a loss month; the percentage share is 0 while the base (after carry-forward) is negative.
- FX: ECB reference rates via frankfurter.dev (no key), cached in `fx_rates`; weekends use the previous business day. A missing rate blocks closing.
- COGS applies only if the term ticks it; cancelled orders (`status = CANCELLED`) need no cost.

## Platform connectors

Each connector: test connection, then fetch orders and ledger lines for a date range. Every sync re-fetches from (last sync − 3 days) to catch late fees; upserts make this safe. Handle rate limits with retries and backoff. Write a sync log per run.

Keep the mapping from raw API data to orders/ledger lines in **pure functions** and unit-test them with sample payloads.

### Shopify

- Apps must be created in the **Shopify Dev Dashboard** (creating custom apps in the store admin stopped on 1 Jan 2026). Custom distribution, installed on the store. Credentials: shop domain, Client ID, Client Secret. Get an access token with the **client credentials grant**: `POST https://{shop}.myshopify.com/admin/oauth/access_token` with `client_id`, `client_secret`, `grant_type=client_credentials`. Cache the token until it expires. Also accept a legacy `shpat_` admin token for stores that already have an older app.
- Admin **GraphQL** API (pin the version in config).
- Orders (filter by `updated_at`, skip test orders): SALES = subtotal (minus tax if `taxesIncluded`), SHIPPING_CHARGED = shipping, TAX_COLLECTED = total tax, dated at `processedAt`. Each refund becomes a REFUNDS line (negative), keyed by refund id, dated at refund `createdAt`. Line items give SKU and quantity.
- **Shopify Payments** balance transactions (`shopifyPaymentsAccount.balanceTransactions`, paginate by processed date): fee → PAYMENT_FEES (negative); dispute types → ADJUSTMENTS. If the account is null (store doesn't use Shopify Payments), skip. Scopes: read orders, read Shopify Payments payouts.
- Shopify plan/app bills and PayPal fees aren't in these APIs: enter them as manual expenses.

### eBay

- One free eBay developer account for Technomiles. App ID, Cert ID and RuName go in env vars. Each eBay seller account connects once through an in-app OAuth consent flow (authorize URL → callback exchanges the code → store the **refresh token** per store, together with the marketplace, e.g. EBAY_GB / EBAY_US).
- Scopes: `https://api.ebay.com/oauth/api_scope/sell.finances` and `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`. Access token via `POST https://api.ebay.com/identity/v1/oauth2/token` with the refresh token.
- **Finances API** `GET https://apiz.ebay.com/sell/finances/v1/transaction` with `filter=transactionDate:[from..to]`, `limit` up to 1000, offset paging, `X-EBAY-C-MARKETPLACE-ID` header.
  - SALE: SALES = amount + totalFeeAmount; MARKETPLACE_FEES = −totalFeeAmount
  - REFUND: REFUNDS = −(amount + totalFeeAmount); MARKETPLACE_FEES = +totalFeeAmount (fee credit)
  - NON_SALE_CHARGE: `feeType` AD_FEE → ADVERTISING, otherwise OTHER_FEES; sign from `bookingEntry` (DEBIT negative)
  - SHIPPING_LABEL → SHIPPING_LABELS; DISPUTE → ADJUSTMENTS; CREDIT → ADJUSTMENTS
  - TRANSFER, WITHDRAWAL, PAYOUT, LOAN_REPAYMENT → skip
  - **Verify these mappings against one real month's eBay transaction report** before trusting them.
- **Digital signatures:** Finances API calls for **UK/EU sellers** (all 4 Kensingtons eBay accounts) must be signed. Create an Ed25519 signing key once via the Key Management API (`POST https://apiz.ebay.com/developer/key_management/v1/signing_key`, body `{"signingKeyCipher":"ED25519"}`, application token), store the private key and JWE in env, and add the `x-ebay-signature-key`, `Signature-Input` and `Signature` headers (covering `x-ebay-signature-key`, `@method`, `@path`, `@authority`) to every Finances call. Signing US calls too is harmless.
- **Fulfillment API** `GET https://api.ebay.com/sell/fulfillment/v1/order` filtered by `lastmodifieddate` for order items (SKU, quantity); use the item ID when a listing has no SKU.

### Amazon (SP-API)

- **Private developer** registration done inside each client's own Seller Central (no Technomiles company registration needed). Role: **Finance and Accounting** (plus Inventory and Order Tracking if needed). No buyer personal data roles. Per-store credentials: LWA Client ID, Client Secret, Refresh Token, region (NA for Jawa, EU for Kensingtons), marketplace ID.
- Access token: `POST https://api.amazon.com/auth/o2/token` with the refresh token; send as `x-amz-access-token`. Endpoints: `sellingpartnerapi-na.amazon.com`, `sellingpartnerapi-eu.amazon.com`.
- **Finances API v0** `GET /finances/v0/financialEvents` with `PostedAfter`, `PostedBefore` (must be a few minutes in the past), `MaxResultsPerPage=100`, `NextToken`. Rate limit is about 0.5 requests/second: pause between pages and retry on 429. Data can lag up to 48 hours.
- Amounts in financial events are already signed from the seller's side. Mapping:
  - ShipmentEventList → item charges: Principal → SALES; ShippingCharge/GiftWrap → SHIPPING_CHARGED; Tax/ShippingTax/GiftWrapTax → TAX_COLLECTED; ItemTaxWithheld → TAX_WITHHELD; promotions → SALES (negative); item fees → MARKETPLACE_FEES, or FULFILLMENT_FEES for FBA fee types. Also build orders + items (SellerSKU, QuantityShipped) from these, dated at PostedDate, so the Orders API isn't needed.
  - RefundEventList, ChargebackEventList, GuaranteeClaimEventList → same shape with adjustments: principal/shipping → REFUNDS, tax → TAX_COLLECTED, fee adjustments → MARKETPLACE_FEES.
  - ServiceFeeEventList → SUBSCRIPTION for subscription fees, otherwise OTHER_FEES.
  - ProductAdsPaymentEventList (note lower-case keys) → ADVERTISING, charges negative.
  - AdjustmentEventList → REIMBURSEMENTS for reimbursement types, skip reserve types, otherwise ADJUSTMENTS.
  - Log any other event list names found, so nothing is silently missed.
- Events have no IDs: build a deterministic external ID by hashing (event list, order ID, posted date, SKU, charge/fee type, position).
- Ad spend only appears here if ads are paid from the seller balance; card-paid ads must be entered manually.

## Screens

Left menu: **Dashboard**, **Clients** (dropdown listing every client, plus "All clients" and "Add client"), **Settings**.

- Login
- Dashboard: month selector, per-client gross / base / amount due / status, store sync status and errors
- Client workspace `/clients/[id]` (owner's request: everything for a client on one screen), tabs with a shared month picker:
  - **Overview**: month summary (gross, deductions, base, share, loss carried), problems, sales by store, orders/expenses/stores at a glance
  - **Orders**: orders in the month with per-order cost entry (supplier, item cost, handling, notes); filter "without a cost"
  - **Expenses**: manual expenses and courier costs, per-courier totals
  - **Profit sheet**: the statement breakdown, close / reopen, Invoice PDF, CSV
  - **Stores**: store list, add/edit, (later) credentials, test connection, eBay connect, sync now, sync log
  - **Contract & setup**: client details, contract terms, recurring expenses, shipping providers
- Transactions: browse ledger lines with filters for auditing (to be added with the connectors)
- Settings: business details, logo, bank details, invoice numbering; users

## Users and access

- Roles: **ADMIN** (Aamir, Imran: everything) and **STAFF** (client-side work only). Enforced with `requireAdmin()` / `requireUser()` in every page and server action (`src/lib/auth.ts`); staff get 404 on admin pages.
- Staff can: see the client list, a client's Orders (incl. Jawa order costs), Expenses (client expenses such as shipping/couriers, per store) and Stores (connect / edit accounts).
- Staff cannot see: dashboard, client overview figures, profit sheets, statements, invoices, transactions, contract terms/setup, and anything in the Company section (salaries, P&L, invoices paid/unpaid, partners). Settings (business details, users) is admin only.
- Users are managed in Settings → Users and access (add, role, active, reset password); `npm run create-user -- email "Name" [admin|staff]` still works.

## Client types

`MARKETPLACE` (ongoing store management, monthly profit sheet), `SERVICE` (web development / hosting / website management billed monthly or yearly), `PROJECT` (one-time work). Service and project clients are billed through invoices (below) rather than statements.

## Company accounts

Decided with the owner (Sep 2026):
- Company books in **PKR**; bank: **Albaraka Bank (PKR)**. Partners may also pay company expenses personally.
- **Invoices** in the client's currency (GBP, USD, any future currency) that also show the **PKR equivalent** at the day's interbank rate (auto-fetched, editable per invoice). Sources: closed monthly statements (automatic), manual invoices for services/projects (hosting yearly renewals, one-time websites).
- **Payments received**: installments per invoice, each with date, amount in invoice currency, **actual PKR credited** by the bank; exchange difference = actual PKR − invoice-rate PKR; status unpaid / partly paid / paid; "mark as fully received" even with a small remaining difference. Payments without an invoice (one-off project money) can also be recorded.
- **Company expenses** (own left-menu item): date, category (rent, internet, utilities, subscriptions, hardware, other), details, amount, **paid by** Technomiles account / Aamir / Imran (a partner-paid expense is owed to that partner); fixed monthly expenses can repeat.
- **Payroll** (paid between the 10th and 15th of the following month, in PKR): Nouman Nawaz PKR 70,000/month; Hassan Chohan PKR 15,000/month; **Ehsaan Latif: 1% of Net Sales** of Kensingtons Amazon + its 4 eBay accounts only (no salary). Net Sales per his contract = those stores' sales after all their expenses (platform fees, refunds, ads, labels, and manual expenses assigned to those stores, e.g. Parcelforce/EVRI entered per store); zero or negative month = no commission, **losses not carried forward**; paid in PKR at the rate the company actually received. Bonuses, deductions, advances, payslips.
- **Partners**: monthly company profit split 50/50 into each partner's running balance; payments to partners, partner-paid expenses and opening balances (entered manually for Oct 2026) all post to it; carried forward every month; the statement says who owes whom (e.g. Imran took 55k more than his share → "Imran owes Aamir 55k", accumulating until cleared).
- **Assets**: item, category, quantity, purchase date, price, condition, location/assigned to; add and remove (sold/disposed/lost with date and value).
- Start: accounting month **October 2026**, opening balances entered manually.
- **Profit is recognised when money is received** (owner chose option A): a month's income = PKR actually credited in that month. Unpaid invoice amounts are shown as **"Previous balance outstanding"** on the client's next invoice (same currency), and a lump payment is applied to the **oldest unpaid invoice first**.
- Built (Sep 2026): Company section (`/company`: Overview, Invoices, Payments received, Expenses), client "Invoices & payments" tab with recurring billing plans, invoice PDF (`/print/invoice/[id]`, with the monthly summary for statement invoices). Closing a month creates the invoice automatically (not when nothing is due). Invoice rules are pure functions in `src/lib/invoices/calc.ts` (tested). PKR rates: open.er-api.com (latest only), cached in `fx_rates`. `npm run seed-company` creates the partners and the Albaraka account on a fresh database.
- **Payroll** (`/company/payroll`, `src/lib/payroll.ts`): one line per staff per month worked; commission base = `netSalesForStores()` in `src/lib/statement/load.ts` (all deduction groups, only expenses assigned to the chosen stores); PKR rate = effective rate of the client's payments on that month's invoice, else today's interbank (editable). Salaries count as a cost in the month **paid**. Payslip PDF `/print/payslip/[id]`.
- **Partners** (`/company/partners`, `src/lib/partners/`): balance = entries (opening, profit share, drawings, personal expenses, transfers, adjustments) + company expenses and salaries the partner paid personally. Positive = company owes the partner. "Who owes whom" = each partner's gap to their share of the combined balance (tested with the owner's 145k/200k/55k example). Company months close in order from `BOOKS_START` (2026-10) and post profit (or loss) shares; only the latest can be reopened.
- **Bank balance** = opening + payments received − expenses − salaries − partner withdrawals/personal expenses paid from the account.
- **Assets** (`/company/assets`): register with add/edit/remove (sold, disposed, lost, given away) and an option to book the purchase as a Hardware expense.
- First-run: with no users, `/login` shows a "create administrator" form (for Hostinger without shell access). Deployment steps in `DEPLOY.md`.

## Demo data (remove before go-live)

`npm run demo -- add` loads the owner's Aug 2026 Excel figures (`scripts/demo/august-2026.json`, no buyer personal data) as orders, ledger lines and expenses tagged `DEMO-` / `[DEMO]`, and moves the contract terms to start 2026-08 so the profit sheet shows them. `npm run demo -- remove` deletes all of it, any statements closed for months before 2026-10, and restores the terms to start 2026-10. **Run `remove` before going live.**

## Rollout

1. Build Shopify and eBay first (easy access); Amazon once the Seller Central registrations are approved.
2. Run the first month (October 2026) in parallel with the Excel method and reconcile totals per store and category before relying on it (differences from the old Excel's missing fees/refunds are expected).
3. Walmart later, as a new connector.

@AGENTS.md
