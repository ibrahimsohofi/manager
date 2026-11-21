# Todos — SOHOFI BRICO (QR point of sale)

Source: `ROADMAP.md`. Status verified against the code on 2026-11-03.
**Full audit of every unchecked item against the code: 2026-11-07 (6th session).** Statuses below reflect it.
**2026-11-11: all completed `[x]` items removed — only partial and open work is listed below.**
**2026-11-13: re-checked against the code; newly completed items removed (see ROADMAP.md verification log).**
Environment note: MySQL is NOT available here -> do not set up / import databases.
Verify with syntax checks, frontend build, lint and page render only.

Legend: `[~]` partial · `[ ]` to do
---
## Current request (2026-11-20, d) — Finance Manager full build (14 phases, user spec)
Env note (this session): a user-space MariaDB 10.11 runs from /tmp/mdb (apt download + dpkg-deb -x, LD_LIBRARY_PATH).
`bricojamal` dump imported there -> real SQL tests possible. Restart: see /tmp/mdb (not part of the repo).
Started 2026-11-20 (session e): MariaDB rebuilt in /tmp/mdb (`/tmp/mdb/start.sh`, `/tmp/mdb/sql.sh`), bricojamal imported (3286 lines, 2025-10-20 -> 2026-01-31, no unit_cost column).
Architecture: `server/app.js` createApp({config, models, sessions}) -> real `server.js` and `mock/server.js` only differ by models.
Session f (2026-11-20, evening): /tmp/mdb rebuilt again (noble arm64 debs: mariadb-server-core/client-core/common + libmariadb3,
libnuma1, liburing2, libncurses6, libtinfo6, libedit2, libbsd0, libmd0). `/tmp/mdb/start.sh`, `/tmp/mdb/sql.sh`. bricojamal re-imported.
Real dump facts: 3286 sales, 131 297.38 DH, all cash, NO `unit_cost`, NO `supplier_transactions`, `customer_payments` empty.
Already present at start of session f: env.js (config/checkConfig/buildConfig), financeSchema.js, utils/finance.js, utils/pin.js.
Session g (2026-11-20, night): user said "skip database connection" -> NO MariaDB this session. Verify with node --check,
node:test on pure helpers + in-memory models + API (mock), vite build, biome, mock API render.
- [x] P1 backend foundation (env.js config(), .env.example, setup-env script, finance pool, read-only sales pool) — present, + `setup-env` script in package.json
- [x] P2 SalesSource (cached unit_cost check, 5 min retry, monthly/yearly/daily/unknown-cost, unavailable state) — present
Session h (2026-11-20, late): user said \"continue building finance_manager\". Still no MySQL -> mock API only.
- [x] P3 Expense model (create/update/pay/remove/list, allocations, transactions) — present (models/Expense.js)
- [x] P5 categories + settings models — present (ExpenseCategory.js, Settings.js)
Session i (2026-11-21): audit found P4, P6, P7 already in the repo (Finance.js, sessions/pin/http middleware, routes, app.js, server.js).
- [x] P4 Finance model — present (models/Finance.js)
- [x] P6 sessions + PIN middleware + CORS + error handler · P7 routes/app.js/server.js/health — present
Session j (2026-11-21): user said \"continue building finance_manager\". No MySQL -> mock API (`dev:mock`) for the preview.
Session k (2026-11-21, after a fresh clone): user said \"continue building finance_manager\". No MySQL -> mock API.
- [x] P13 mock API present (`bun run dev:mock`, 13 887 generated lines, 209 expenses, MOCK_PIN / MOCK_SALES_DOWN / MOCK_EMPTY / MOCK_TODAY)
- [x] P14a server tests present: 39/39 pass. Fixed `test` script (`node --test tests/` fails on Node 22 -> `tests/*.test.js`)
Session l (2026-11-21, fresh clone): user said \"continue building finance_manager\". No MySQL -> mock API (`MOCK_PIN=1234`).
Already present: vite/tailwind/index.html/index.css (ledger theme) + src/lib (api, format, period, events, categoryIcons).
Missing at start: main.jsx, App, i18n, contexts, ui components, pages -> building P8-P12 now.
- [ ] P8 frontend scaffold (Vite :5175 + /api proxy, Tailwind tokens, fonts, i18n fr+ar RTL, theme light/dark)
- [ ] P9 API client + session context + PIN gate (setup / unlock / idle lock / 429)
- [ ] P10 overview (period switcher, profit ladder, KPIs + changes, break-even, projection, alerts, 12-month chart, donut, pending bills)
- [ ] P11 expenses (list + filters + totals, quick-add dialog, edit, pay, delete + undo, bin)
- [ ] P12 reports (year table, yearly, daily, unknown-cost lines, CSV export, print) + settings (categories, margin, PIN change)
- [ ] P14b vite build, biome, render FR/AR light/dark
- [ ] Root `dev` script + README ports + sales_manager \"Finances\" nav link
---
## Current request (2026-11-20, b) — Implement the Finances core in its own app `finance_manager` (option C)
User go: "Implement a feature from FINANCE_PLAN.md" -> the core feature (expenses + real monthly / yearly profit).
Resumed 2026-11-20 (session c). Already in the repo: `finance_manager/server/config/financeSchema.js`,
`server/utils/finance.js` (periods, allocations, computeSummary, validation), `server/utils/pin.js` (scrypt).
- [x] Chunk 1b — split schema (finance tables in finance_manager, `saleCostSchema.js` in sales_manager, old file deleted).
  Leftover: stale `ensureFinanceTables` comment in `sales_manager/server/models/Sale.js`
- [ ] Chunk 1c — scaffold `finance_manager` (Vite :5175 + `/api` proxy, API :3002, own DB, read-only `bricojamal` pool, root dev script)
- [ ] Chunk 4 — Expenses + categories API (allocations, soft delete / restore, pay, validation)
- [ ] Chunk 5 — Finance API (summary, monthly, yearly, expenses-by-category, unknown-cost-lines) + settings / PIN API
- [ ] Chunk 6 — UI: PIN gate, overview (profit ladder, charts), expenses list, quick-add dialog, categories + settings, fr + ar
- [ ] Verify: node --check, pure tests (1200/12, 1000/3, §2 example), SQL parse, biome, build, mock API render (FR/AR, light/dark)
- [ ] sales_manager "Finances" nav link, README ports, plan + todos status, remove tmp_* files
---
## Previous request (2026-11-19) — Finances: expenses + monthly / yearly profit
Spec + plan: `FINANCE_PLAN.md` (repo root). Plan only, no code yet. Module goes in `sales_manager` (§1).
- [x] Chunk 0 — all answers recorded in plan §11 / §4 #13-20 (2026-11-19). Food = business, rent + internet due on
  the 10th, past sales costed from the price history (option A). Waiting for the user's go to start Chunk 1
- [x] Chunk 1 (2026-11-19): `server/config/financeSchema.js` + call in `database.js`. node --check, fake-pool test 9/9 (idempotent),
  SQL parsed in MySQL + MariaDB mode. Not run against real MySQL (user check: start the API twice)
- [ ] Phase 1 (Chunks 2-6): cost at checkout, backfill script, expenses API, finance API, UI
- [ ] Chunk 6b (added 2026-11-20, plan only): move "Valeur du Stock", "Valeur du stock (prix d'achat)" and
  "Argent dépensé en achats" (+ monthly report) from products_manager `App.tsx` to the Finances overview.
  The data stays in products_manager (proxy `/api/finance/stock*` -> `/api/stats*`). Remove from products_manager only after Finances shows them.
  Plan: FINANCE_PLAN.md decision 21, §8.1, §11 questions 9-12 (defaults: move, drop the per-page card, drop the Inventory.jsx cards, show potential margin)
- [ ] Phase 2 (Chunks 7-10): recurring bills, daily cash closing, break-even / alerts / widget, yearly report + export
- [ ] Phase 3 (Chunks 11-13): cash view, margin by category, bill photos, budgets, PIN, final verification
---
## Previous request (2026-11-15) — VIP client: professional A4 invoice instead of the QR Sale receipt
Spec + plan: `VIP_INVOICE_PLAN.md` (repo root). Chunk 1 done + verified (2026-11-15, in-memory fake DB, 11/11).
- Note: `errorHandler.js` ignores `err.status` -> Chunk 3 controllers must send `error.status` / `errorCode` themselves.
- Note: counter does `INSERT IGNORE` then `FOR UPDATE` (S->X lock); concurrent tills can deadlock, retry (3x) covers it.
- [x] Chunk 2 — Customer API carries `is_vip` (responses send it as a boolean)
- [x] Chunk 3 — Checkout returns `document: receipt | invoice` + invoice routes + settings routes
  - Only `node --check` was run; the fake-DB runtime test was skipped on request -> covered by Chunk 8
- [x] Chunk 4 — VIP toggle + badges (Customers, CustomerDetails, CustomerPicker, QrSale notice) — 2026-11-16, biome + build OK
  - Fixed: missing VipBadge / VipSwitch import in Customers.jsx, VIP chip not sent (`?is_vip=1`), CustomerDetails `toForm` lost `is_vip`
  - Render check (list / detail / till picker with a VIP client) -> Chunk 8 mock API
- [x] Chunk 5 — `buildInvoiceHtml` (A4) + QrSale `printDocument` (receipt template untouched) — 2026-11-16, biome + build + A4 PDF render
  - Fixed: Arabic invoice reordered shop text (`12, Rue …` → `Rue … ,12`) -> `<bdi>` isolation; Arabic total label wrapped -> nowrap + fit-content box
  - Render tip (no root): `apt-get -o Dir::State::Lists=/tmp/apt/lists -o Dir::Cache=/tmp/apt/cache download <libs>` + `dpkg-deb -x` + `LD_LIBRARY_PATH`
    + `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` lets Playwright Chromium run here (useful for Chunk 8)
  - Still to check in Chunk 8: the real till flow against a mock API (button label, retry, 207 panel)
- [x] Chunk 6 — Invoice settings dialog — 2026-11-16, audit + key check fr/ar + biome + vite build (browser test skipped on request)
  - `InvoiceSettingsDialog.jsx` + Customers header button + `invoiceSettings.*` fr/ar keys (all used keys present in both)
  - Leftover `tmp_keys.mjs` / `tmp_mock_api.mjs` removed
  - Not rendered in a browser -> open the dialog manually (or in Chunk 8 if browser checks are wanted later)
- [x] Chunk 7 — i18n fr + ar — 2026-11-16, audit only (no locale change needed): fr = ar in `qrSale.invoice` (22),
  `customers.vip` (4), `invoiceSettings` (34). All used keys present in both, prefix helpers (`tr` / `label`) traced by hand
  - Not translated (on purpose): raw server `invoice_error` / retry error, shown as a technical line in the "Facture non générée" panel
  - Outside VIP scope: 5 keys only in fr (`inventory.totalPrice`, `inventory.remove`, `search.help*`) -> Arabic UI falls back to French
- [ ] Open questions answered (2026-11-17): currency on the invoice = "DH" (receipt keeps MAD), no ICE / IF / RC fields,
  no payment method on the invoice
  - [ ] New key `qrSale.invoice.currency` (fr "DH", ar "د.م.") used by the 3 `buildInvoiceHtml` callers — IN PROGRESS 2026-11-20
- [ ] Chunk 8 — Verification (receipt regression, A4 / PDF render, numbering script, mock API) — RESUMED 2026-11-20 (no MySQL, by user request)
  - Note: git history was squashed into 1 commit (no pre-VIP HEAD) -> receipt baseline = render before today's changes
  - [ ] 8.0 Code audit of every VIP file (server + UI) against the plan
  - [ ] 8.1 `node --check` touched server files + `bun run build` + biome (touched files, no --write)
  - [ ] 8.2 Receipt regression (`buildReceiptHtml` baseline vs after, fixed sample tickets, real locale labels)
  - [ ] 8.3 Invoice render: 2 lines, 60 lines, Arabic RTL, missing phone / address / logo (A4 screenshots)
  - [ ] 8.4 Invoice numbering script (in-memory counter): same ticket, consecutive, year change
  - [ ] 8.5 Mock API live check on `/qr-sale` + `/customers` (VIP picked, VIP typed, regular, anonymous, retry)
  - [ ] 8.6 Fix bugs found, remove `tmp_*`, update plan + todos, delete plan if all pass
- [x] Open question 5 — "Réimprimer la facture" on the client page (2026-11-16): overview returns `invoices`, A4 tag on the ticket,
  reprint bar in the opened ticket (`GET /api/invoices/:number` + settings -> `buildInvoiceHtml`), fr + ar keys.
  `node --check` + biome (touched files) + vite build OK; mock API render skipped on request
- Answered: logo = SOHOFIBRICO (`/sohofibrico_logo.svg` in sales_manager/public, default in `server/utils/invoice.js`)
---
## Previous request (2026-11-13) — Customers: show spent / paid / who owes whom / paid or not
Root causes: (1) `Customer.getAll` returned `rows.map(withSalesTotals)` -> `total_paid` / `balance` never computed
(card read the stale `customers.total_paid` column = 0, so Balance = everything ever bought);
(2) no screen writes `customer_payments` / `customer_products` (API existed, UI missing);
(3) real data: 3286 sales, all `customer_id = NULL` + `cash`; amounts typed in `credit_limit` + notes ("av 500dh+100").
Server, Customers card, CustomerDetails account panel, i18n fr + ar and checks done (removed 2026-11-13).
- [ ] User checks with real MySQL data (MySQL not available in this env)
- Noted, not fixed: `deletePayment` throws -> 500 instead of 404; `updateProduct` breaks on partial body (unused by UI)

---
## Previous request (2026-11-12, b) — Customers card showed 0 for Total / Paid / Balance
Cause: card read only `customer_products` + `customer_payments`, which no screen ever writes (also empty in the SQL dump).
Fix: `Customer.getAll` now returns `credit_total`, `payments_total`, `products_total`, `total_purchases`, `total_paid`, `balance`
(Total = till sales + order list; Paid = non-credit sales + payments received; Balance = Total - Paid).
`Customers.jsx` uses those values (removed 2 extra requests per customer). Biome + vite build OK.
- [ ] Render with data (needs MySQL or the temp mock API)
---
## Current request (2026-11-12) — Carnet: inventory product picker for "goods" entries
`lib/carnet.js` helpers, `ProductDescriptionField`, EntryDialog wiring, i18n `carnet.form.product` fr + ar (15 keys) done.
Biome on `CarnetShared.jsx` clean, vite build OK (2026-11-12).
- [ ] Render with data: pick by name / by ID, price fill, unlink on edit (needs products API :5000 + carnet API :3001)
---
## Current request (2026-11-10, session 3) — Carnet: "Total dépensé" (home + person page)
Spent = everything I gave that counts in the balance (money, goods, services with a value) = `summary.totalGave`.
Object loans (`to_return`) and notes excluded. All time; home page sums all people, archived included. No kind breakdown (needs server).
Code (`Carnet.jsx`, `CarnetPerson.jsx`), i18n fr + ar and build / lint checks done (removed).
- [ ] Render with data (needs MySQL or a temp mock API)
---
## Current request (2026-11-10) — QrSale: client number saved in Customers + printed on the bill
Implemented chunk by chunk. Chunks 1–5 and L1 (feature map) done (removed).
Live check WITHOUT MySQL (session 3): temp in-memory mock API, real controllers / utils where possible.
- [ ] L2 Temp mock (no MySQL): in-memory products API (:5000) + sales API (:3001); reuse real `checkoutSale` / `customerLabel` with in-memory models if feasible; all files named `tmp_*`
- [ ] L3 `/qr-sale`: add product (manual ID), enter client number, checkout -> success screen shows ticket number + client
- [ ] L4 Printed receipt (80mm HTML) shows the client number / name
- [ ] L5 `/customers` and `/customers/:id`: client created / linked by the checkout, with its ticket
- [ ] L6 Fix bugs found (small, targeted) + re-check
- [ ] L7 Cleanup: remove mock + screenshots, build + biome on touched files, update this file
---
## Current request (2026-11-16) — Phone scanner: finish Chunks 5 + 6
- [ ] Install deps (sales_manager + server)
- [ ] Temp relay E2E script (`tmp_*`): dedup, locked, PC disconnect -> uncertain, timeout + late SSE, reconnect, 2 phones isolation, revoke, nothing queued offline
- [ ] Live check: real sales API (relay) + temp fake products API + vite; headless browser drives QrSale + `/phone/` manual entry
- [ ] Fix bugs found (small, targeted)
- [ ] Build + biome (touched files), remove temp files, update plan + todos
---
## Previous request (2026-11-09) — Phone as a wireless scanner for QrSale
Plan + audit: `PHONE_SCANNER_PLAN.md` (repo root). Implemented chunk by chunk. Chunks 1–4 done (removed).
- [ ] Chunk 5 — `useRemoteScanner`, `PairPhoneDialog`, QrSale phone button, i18n fr + ar (IN PROGRESS)
  - [~] 5.1 `src/hooks/useRemoteScanner.js` — biome clean + meta shape `{phone:{id,name}}` matches server/QrSale (2026-11-10); verify against fake relay
  - [~] 5.2 `src/components/PairPhoneDialog.jsx` — reviewed; verify render against fake relay
  - [~] 5.3 QrSale header button (status dot + count) + auto-connect — reviewed; verify against fake relay
  - [~] 5.4 i18n `qrSale.remote.*` fr + ar — parity OK (46 fr / 54 ar, plurals OK); `lockedText` unused; old checker's used-key regex finds 0 keys
  - [~] 5.5 Verify: build OK + biome clean (2026-11-10); render against fake relay still to do
- [ ] Chunk 6 — End-to-end script, build, lint, render; manual device checklist for the user

---
## Current request (2026-11-06) — sales_manager: "Carnet" personal ledger (people + notes: who owes what)
Backend (DB, utils, model, controller, routes `/api/carnet/*`), `src/lib/carnet.js`, i18n fr + ar and CSS / fonts are done.
Balance sign: "gave" (+, they owe me) / "received" (-, I owe them). Notes and items "to return" do not count.
Note: `bun run lint` = `biome lint --write` on all src -> check only touched files without --write.
Note: dark class is on a wrapper div (not <html>) -> no Radix portals for menus (they lose dark styles).
Phase 1 (people list `/carnet`, `CarnetShared.jsx`, routes + nav tab) is done (verified 2026-11-08).
Render with data: API needs MySQL (temp mock data removed 2026-11-08 on user request).
### Phase 2 — person page (`/carnet/:contactId`) — IN PROGRESS (2026-11-08, implemented chunk by chunk)
Chunk 1 (header + quick actions gave / received / note) done (removed).
- [~] Chunk 2 — Timeline grouped by month, running balance, status chips, edit / delete / returned toggle, filters + search
  Logic done in `CarnetPerson.jsx` (URL `?q=&f=`, `groups`, `monthStats`, `filterCounts`, `toggleReturned`, `confirmDeleteEntry`);
  NOT rendered yet: no timeline JSX, search input, filter chips or `<ConfirmDialog>` (verified 2026-11-08)
  - [ ] 2.1 Toolbar: search input (`?q=`) + filter chips with counts (`?f=`), section title + count
  - [ ] 2.2 Month groups: localized month header, month net + closing balance
  - [ ] 2.3 Entry row: date in the margin, icon, label / description / notes, amount (or "hors solde" value), running balance, status chips, flash highlight
  - [ ] 2.4 Row actions: edit (EntryDialog), delete (ConfirmDialog), returned toggle (to_return goods)
  - [ ] 2.5 Empty states: no entries / no results + clear filters
  - [ ] 2.6 Verify: build, biome lint (file only), render with temp mock API (then remove temp files)
- [ ] Chunk 3 — Side: summary, objects lent / borrowed, WhatsApp reminder, print statement
- [ ] Chunk 4 — Settle dialog, edit / archive / restore / delete person
### Phase 3 — verify
- [ ] build + biome lint; render both pages with a temp mock API (real server utils), then remove the mock

---
## Previous request (2026-11-05, 7th) — sales_manager: supplier ledger (purchases, payments, running balance)
Backend, `src/lib/supplierLedger.js`, `SupplierLedgerShared.jsx` and `SupplierLedgerEntry.jsx` (full-page form) are done (verified 2026-11-08).
i18n fr + ar is done for the entry page only: 17 keys used by `buildStatementHtml` (`list.*`, `summary.*`, `table.*`, `statement.*`) are missing in both locales.
No `<Toaster />` mounted in sales_manager -> inline notices. Detail routes keep parent tab (`/customers/:id`).
- [ ] `SupplierLedger.jsx` overview (`/suppliers/ledger`): totals, search, status filter, sort, quick add — file missing
- [ ] `SupplierLedgerDetail.jsx` (`/suppliers/:supplierId/ledger`): summary, period/type/search filters, ledger table w/ running balance, edit/delete, print — file missing
- [~] Suppliers page: add "Comptes" header button + per-row ledger (balance) link; add App routes `/suppliers/ledger` and `/suppliers/:supplierId/ledger`
- [~] Verify: node --check, ledger logic test, build and biome lint pass on existing files (2026-11-08); render not done (needs MySQL, pages missing)

---
## Previous request (2026-11-05) — products_manager: stock cost value + purchase spending
- [~] SQL not run: no MySQL binary in this environment
- Noted, not fixed (pre-existing): 5 tsc errors on pagination type in App.tsx; product-manager local biome binary missing
- Noted, not fixed (pre-existing, 2026-11-11): `ViewProduct.tsx` biome — `noRedeclare` PriceHistory (l.67), `useExhaustiveDependencies` (l.551)

---
## QR sale customer field and profile — frontend implementation complete (verified 2026-11-08)
MySQL intentionally skipped on user request.
- [ ] Confirm live rendering and data on `/qr-sale` and `/customers/:id` with a running API. This was not verified without MySQL. Project-wide lint still has 16 errors in unrelated files.

---

## Phase 3 — Hardening (IN PROGRESS) — audited 2026-11-07
- [~] Atomic checkout: `POST /api/integration/sale/batch` (one transaction, row locks, all-or-nothing)
      - Handler already written: `products_manager/backend/integration/saleBatch.js`
      - [ ] Register route in `products_manager/backend/server.js` + `sales_manager/server.js` mirror (`saleBatch` imported nowhere)
      - [ ] `checkoutSale` calls the batch endpoint (still per-line `/api/integration/sale`, salesController.js:363)
      - [ ] Remove the 207 partial case (now `salesController.js:437`, `QrSale.jsx:566`)
- [~] Idempotency key on checkout (client-generated, persisted with the cart, cleared on success)
      - Server side already done in `saleBatch.js` (`integration_requests` table)
      - [ ] Client key in `QrSale.jsx` + forwarded by `checkoutSale` (no idempotency code in either)

## Current request (2026-11-03) — audited 2026-11-07
- [ ] QrSale.jsx: client idempotency key (persisted with cart, cleared on success / clear) -> checkoutSale accepts + forwards

## Phase 4 — Point-of-sale features — audited 2026-11-07, re-checked 2026-11-13
- [ ] Ticket-level and per-line discount (no discount in QrSale; checkout saves `discount: 0`)
- [ ] Dedicated `tickets` table; group lines by ticket in Historique Ventes (still `[TKT-...]` in notes)
- [ ] Reprint any past ticket from the sales history (nothing in SalesList)
- [~] EAN-13 / Code-128 barcode lookup (by `barcode` / `sku`, not only ID)
      - EAN-13 by exact `barcode` done (route `?by=barcode` + `parseScannedCode`); QrSale uses it in Chunk 4. Code-128 / `sku` not done
- [ ] Keyboard-only mode for USB scanners (F2 = checkout, Esc = clear) — scan queue exists, no shortcuts
- [ ] Daily cash closing report (Z report)

## Phase 5 — Platform — audited 2026-11-07
- [ ] Authentication and roles (cashier / manager) on both APIs (no auth library in any package.json)
- [ ] Restrict CORS (`origin: '*'` in sales API, open `cors()` in products API + mirror)
- [ ] Offline queue for sales when the catalogue API is down
- [ ] Capacitor Android build of the QR sale page (only products_manager has a Capacitor config)
- [ ] Automated tests: `parseScannedProductId`, `checkoutSale`, cart logic (no test files exist)

## Housekeeping
- [ ] Update the ROADMAP flow diagram once the batch checkout replaces per-line calls (still per-line, ROADMAP.md:46)
