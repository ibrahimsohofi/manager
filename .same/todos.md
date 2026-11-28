# Todos — SOHOFI BRICO (QR point of sale)

Source: `ROADMAP.md`. Status verified against the code on 2026-11-03.
**Full audit of every unchecked item against the code: 2026-11-07 (6th session).** Statuses below reflect it.
**2026-11-11: all completed `[x]` items removed — only partial and open work is listed below.**
**2026-11-13: re-checked against the code; newly completed items removed (see ROADMAP.md verification log).**
**2026-11-22: all completed `[x]` items removed again.**
**2026-11-23: every open item re-checked against the code (fresh clone); completed items and finished session logs removed.**
Environment note: MySQL is NOT available here -> do not set up / import databases.
Verify with syntax checks, frontend build, lint and page render only.
User runs real MySQL. NEVER add mock APIs / fake DBs / sample data again. `databases/*.sql` = REAL shop data (keep).
Real dump facts (`bricojamal`): 3286 sales, 131 297.38 DH, all cash, NO `unit_cost`, NO `supplier_transactions`, `customer_payments` empty.

Legend: `[~]` partial · `[ ]` to do
---
## Done 2026-11-26 — sales_manager: Estimates (Devis) wired into nav + route
`App.jsx`: route `/estimates` -> `components/Estimates.jsx` (was unreferenced). `AppShell.jsx`: `estimates` tab (FileText icon)
in the "till" group after Historique -> desktop sidebar + mobile "Plus" sheet (folios now I..XII = ROMAN array is full).
i18n `nav.estimates` fr "Devis" / ar "عروض الأسعار". vite build OK, biome on changed files clean, app renders.
- [ ] User: open Devis in FR / AR, desktop + mobile "Plus" sheet
- [ ] Still open: page body strings are hard-coded French (only the title uses `t()`); saved-list shows subtotal not total;
  product search has no debounce / stale-response guard; estimates live in localStorage only
- Pre-existing, not touched: shell header shows "key 'shell.shop (fr)' returned an object" (fr `shell.shop` is an object,
  MobileTopBar / MoreSheet call `t("shell.shop")`); `<p>` inside `<p>` warning in Sidebar brand block
---
## Done 2026-11-24 — Chunk 6b (products_manager side): money cards removed from the catalogue
`App.tsx`: removed "Valeur du Stock" (global), "Valeur du stock (prix d'achat)", "Argent dépensé en achats" + its
SpendingReportDialog. Top row = Total Produits + Stock Faible (2 cols). Per-page row (incl. "Valeur du Stock - Page N") kept.
Deleted `SpendingReportDialog.tsx`, `SpendingMonthDetail.tsx`; removed `getSpendingReport/Entries` (api.ts), Spending* types,
`DashboardStats` trimmed to totalProducts + lowStockCount; i18n fr + ar: `stats.stockValueDesc/stockCostValue*/spent*/viewDetails` + `spending.*`.
Backend `/api/stats*` UNTOUCHED (finance_manager `StockSource.js` reads it). vite build OK; tsc 5 errors + biome 10 = same as HEAD (pre-existing).
Note: App.tsx is CRLF — an edit duplicated the file tail once; fixed + verified identical to HEAD.
- [ ] User: check the products page (FR / AR) + Finances overview still shows the 3 figures
- [ ] Still open from 6b: sales_manager `Inventory.jsx` cards (not requested this time)
---
## Done 2026-11-24 — finance_manager PIN dots: extra empty circle
`PinGate.jsx` `Dots`: after 4 digits it added a "+1" empty slot (hint for up to 8) -> looked like a bug.
Now: 4 empty slots, each extra digit adds a filled dot only. Biome lint clean.
- [ ] User: confirm in the browser
---
## Done 2026-11-24 — ROADMAP_V2 B-04 + B-11: client profile edit by PATCH (sales_manager)
B-04 server side was already complete (`Customer.patch()`, `PATCH /api/customers/:id`, `utils/customerPatch.js`, CORS allows PATCH).
B-11 in `src/components/CustomerDetails.jsx`: fixed crash on "Modifier" (`formError` / `setFormError` used, only `formErrors` declared),
save now sends `changedFields()` by PATCH (no request when nothing changed), `400 errors{}` / `409 code|email` / `404` shown under
the field (focus first error), cancel asks when dirty, "unsaved" hint, maxLength = server limits. i18n `customerDetails.unsavedConfirm`,
`unsavedHint`, `errors.*` fr + ar. Biome lint clean, vite build OK, server `node --test` 35/35. Removed from ROADMAP_V2 + STATUS.
- [ ] User: check with real MySQL: edit one field -> only it changes; duplicate N° / e-mail -> message under the field; cancel / nav / reload prompt
- Noted, not changed: `Customers.jsx` list edit dialog still uses PUT with the full form (F-09 stays open there)
---
## Done 2026-11-24 — ROADMAP_V2 P-03: versioned migration runner (sales_manager/server)
All parts were already in the code; verified + removed from ROADMAP_V2 / STATUS. node --check OK, `node --test` 35/35,
`db:status` / `db:migrate` without MySQL: clear ECONNREFUSED message, exit 1. Docs (README, `sales_manager/.env.example`) already done.
Fixed: `scripts/migrate.js` destructured `pool` before connect (always null -> pool never closed) -> namespace import.
- [ ] User: first real run on MySQL (`bun run db:status`, back up, `bun run db:migrate`). `server/migrations/` is empty, so only `schema_migrations` gets created.
Stale entries found (todo / status say missing, files exist) -> re-check next:
- Finance Phase 1 Chunk 3: `server/scripts/backfillSaleCosts.js` (372 lines)
---
## Launcher (2026-11-22, v) — `launcher/` (port 5170), root `dev` starts it + the 3 apps
- [ ] Rail fix (`.rail { visibility: hidden }` under 980px, in `launcher/src/style.css`) to confirm in a real browser (user skipped)
---
## finance_manager — open work (API, UI pages, nav link, README, root dev script are done)
- [ ] Run UI against the real API, fix bugs found (PIN setup, overview, expenses, reports, settings)
- [ ] Render check FR/AR light/dark (biome + vite build + server tests 40/40 already pass)
---
## Previous request (2026-11-19) — Finances: expenses + monthly / yearly profit
Spec + plan: `FINANCE_PLAN.md` (repo root). Built as its own app `finance_manager` (not in sales_manager).
- [~] Phase 1: cost at checkout, expenses API, finance API and UI are done. Left: Chunk 3 backfill script
  `sales_manager/server/scripts/backfillSaleCosts.js` (dry run + `--apply`, FINANCE_PLAN.md §5.2 / Chunk 3) — file missing
- [~] Chunk 6b: move "Valeur du Stock", "Valeur du stock (prix d'achat)" and "Argent dépensé en achats" (+ monthly report)
  from products_manager `App.tsx` to the Finances overview. Finance side done (`StockValueCards.jsx`, `StockSpendingReport.jsx`,
  `StockSpendingMonth.jsx`, `server/models/StockSource.js` + `/api/finance/stock*` routes).
  - [x] Removed from products_manager `App.tsx` (+ SpendingReportDialog / SpendingMonthDetail) — 2026-11-24
  - [ ] Render check against a running products_manager API (FR / AR, light / dark); sales_manager `Inventory.jsx` (still there)
- [ ] Phase 2 (Chunks 7-10): recurring bills, daily cash closing, break-even / alerts / widget, yearly report + export
  (`recurring_expenses` + `cash_closings` tables exist in `financeSchema.js`; no API / UI yet)
- [~] Phase 3 (Chunks 11-13): PIN and category monthly budgets are in. Left: cash view, margin by category,
  bill photos (only an `attachment_url` column), final verification
---
## Previous request (2026-11-15) — VIP client: professional A4 invoice instead of the QR Sale receipt
Spec + plan: `VIP_INVOICE_PLAN.md` (repo root). Chunk 1 done + verified (2026-11-15, in-memory fake DB, 11/11).
Answered (2026-11-17): invoice currency "DH" (key `qrSale.invoice.currency`, used by the 3 `buildInvoiceHtml` callers),
receipt keeps MAD, no ICE / IF / RC fields, no payment method on the invoice.
- Note: `errorHandler.js` ignores `err.status` -> Chunk 3 controllers must send `error.status` / `errorCode` themselves.
- Note: counter does `INSERT IGNORE` then `FOR UPDATE` (S->X lock); concurrent tills can deadlock, retry (3x) covers it.
- Render tip (no root): `apt-get -o Dir::State::Lists=/tmp/apt/lists -o Dir::Cache=/tmp/apt/cache download <libs>` + `dpkg-deb -x` + `LD_LIBRARY_PATH`
  + `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` lets Playwright Chromium run here (useful for Chunk 8)
- [ ] Chunk 8 — Verification (receipt regression, A4 / PDF render, numbering script, mock API) — RESUMED 2026-11-20 (no MySQL, by user request)
  - Note: git history was squashed into 1 commit (no pre-VIP HEAD) -> receipt baseline = render before today's changes
  - [ ] 8.0 Code audit of every VIP file (server + UI) against the plan
  - [ ] 8.1 `node --check` touched server files + `bun run build` + biome (touched files, no --write)
  - [ ] 8.2 Receipt regression (`buildReceiptHtml` baseline vs after, fixed sample tickets, real locale labels)
  - [ ] 8.3 Invoice render: 2 lines, 60 lines, Arabic RTL, missing phone / address / logo (A4 screenshots)
  - [ ] 8.4 Invoice numbering script (in-memory counter): same ticket, consecutive, year change
  - [ ] 8.5 Mock API live check on `/qr-sale` + `/customers` (VIP picked, VIP typed, regular, anonymous, retry)
  - [ ] 8.6 Fix bugs found, remove `tmp_*`, update plan + todos, delete plan if all pass
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
Chunk 2 2.1–2.5 (toolbar, month groups, entry rows, row actions, empty states) rendered in `CarnetPerson.jsx` (verified 2026-11-23).
- [~] Chunk 2 — Timeline grouped by month, running balance, status chips, edit / delete / returned toggle, filters + search
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
      - [ ] `checkoutSale` calls the batch endpoint (still per-line `/api/integration/sale`)
      - [ ] Remove the 207 partial case (now `salesController.js:484`, `QrSale.jsx:611`)
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
