# Todos — SOHOFI BRICO (QR point of sale)

Source: `ROADMAP.md`. Status verified against the code on 2026-11-03.
**Full audit of every unchecked item against the code: 2026-11-07 (6th session).** Statuses below reflect it.
**2026-11-11: all completed `[x]` items removed — only partial and open work is listed below.**
**2026-11-13: re-checked against the code; newly completed items removed (see ROADMAP.md verification log).**
Environment note: MySQL is NOT available here -> do not set up / import databases.
Verify with syntax checks, frontend build, lint and page render only.

Legend: `[~]` partial · `[ ]` to do
---
## Current request (2026-11-13) — Customers: show spent / paid / who owes whom / paid or not
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
