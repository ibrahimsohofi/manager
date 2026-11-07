# Todos — SOHOFI BRICO (QR point of sale)

Source: `ROADMAP.md`. Status verified against the code on 2026-11-03.
**Full audit of every unchecked item against the code: 2026-11-07 (6th session).** Statuses below reflect it.
Environment note: MySQL is NOT available here -> do not set up / import databases.
Verify with syntax checks, frontend build, lint and page render only.

Legend: `[x]` done (verified in code) · `[~]` partial · `[ ]` to do
---
## Current request (2026-11-06) — sales_manager: "Carnet" personal ledger (people + notes: who owes what)
Findings: `ledger_contacts` / `ledger_entries` CREATE TABLE already in `runMigrations` (no model/route/UI).
Balance sign: "gave" (+, they owe me) / "received" (-, I owe them). Notes and items "to return" do not count.
Re-verified 2026-11-06 (2nd): DB helper, utils and model were already written. Continuing from controller.
- [x] DB: own `ensurePersonalLedgerTables()` (+ add missing columns notes / to_return / settled_date) — called in `initializeDatabase` (database.js:65)
- [x] `server/utils/personalLedger.js`: validation, summary, FIFO open debts, overdue, running balance
- [x] Model `PersonalLedger.js`
- [x] Controller + routes `/api/carnet/*` + registered in `server/server.js` (line 42)
- [x] `src/lib/carnet.js` API client + helpers (WhatsApp text, print statement)
Note: `bun run lint` = `biome lint --write` on all src -> check only touched files without --write.
Audit 2026-11-07 (6th): NO `Carnet*.jsx` file exists in `src/components`, no `/carnet` route in `App.jsx`,
no Carnet tab in `Navigation.jsx`. i18n / CSS / fonts confirmed done. Previous sessions never landed the UI.
### Phase 1 — foundations + people list (`/carnet`)
- [x] i18n fr + ar `carnet.*` (fr 246 / ar 286 incl. plural forms, 0 missing either way) + `nav.carnet`
- [x] CSS: `.carnet-display` (Fraunces / Noto Naskh Arabic), cover, ruled paper, margin line, flash/rise animations; Google Fonts link in `index.html`
- [ ] `CarnetShared.jsx`: useCarnetT, metas, Avatar, BalanceTag, ContactFormDialog, EntryDialog (live balance preview) — file missing
- [ ] `Carnet.jsx`: cover + totals, search, filters (owes me / I owe / settled / overdue / items), sort, archived toggle, cards, add person — file missing
- [ ] App routes `/carnet`, `/carnet/:contactId` + active tab + "Carnet" nav tab — none present
### Phase 2 — person page (`/carnet/:contactId`) — nothing started
- [ ] Header (avatar, relation, call / WhatsApp, notes, big balance), quick actions gave / received / note
- [ ] Timeline grouped by month, running balance, status chips, edit / delete / returned toggle, filters + search
- [ ] Side: summary, objects lent / borrowed, WhatsApp reminder, print statement
- [ ] Settle dialog, edit / archive / restore / delete person
### Phase 3 — verify
- [ ] build + biome lint; render both pages with a temp mock API (real server utils), then remove the mock

---
## Previous request (2026-11-05, 7th) — sales_manager: supplier ledger (purchases, payments, running balance)
Findings: Suppliers = CRUD only (+ purchase_orders stats, unused by UI). No supplier payments / balance.
No `<Toaster />` mounted in sales_manager -> inline notices. Detail routes keep parent tab (`/customers/:id`).
Audit 2026-11-07 (6th): entry form was built as a full PAGE (`SupplierLedgerEntry.jsx`, routes
`/suppliers/:supplierId/notes` + `/suppliers/:supplierId/notes/:entryId/edit`) instead of a modal.
Overview + detail pages do not exist.
- [x] DB migration: `supplier_transactions` + `ensureSupplierLedgerTable()` called in `initializeDatabase` (database.js:63)
- [x] `server/utils/supplierLedger.js`: validation, running balance, FIFO allocation (paid/partial/unpaid/overdue), period filter
- [x] Model `SupplierLedger.js` + controller + routes (`/api/suppliers/ledger/balances`, `/api/suppliers/:id/ledger` CRUD)
- [x] `src/lib/supplierLedger.js` (client helpers + printable statement)
- [x] `SupplierLedgerShared.jsx`: EntryForm, ModalShell, ConfirmDialog, Notice, BalancePill, TypeChip, StatCard (779 lines)
- [x] `SupplierLedgerEntry.jsx` full-page entry form (new + edit) — added outside the original plan
- [ ] `SupplierLedger.jsx` overview (`/suppliers/ledger`): totals, search, status filter, sort, quick add — file missing
- [ ] `SupplierLedgerDetail.jsx` (`/suppliers/:supplierId/ledger`): summary, period/type/search filters, ledger table w/ running balance, edit/delete, print — file missing
- [~] Suppliers page: per-row "new entry" link (`newEntryPath`) + ledger notice done; NO "Comptes" header button,
      no per-row ledger (balance) link; App routes only for the entry page (no `/suppliers/ledger`, no `/:id/ledger`)
- [x] i18n fr + ar `supplierLedger.*` (fr 66 / ar 70, 0 missing either way)
- [ ] Verify: node --check, ledger logic test (temp), build, lint, render
---


## Current request (2026-11-05, 2nd) — edit page save, back navigation, spending drill-down
Findings (verified in code): `/edit/product/:id` onSave only logged + navigate(-1), then ProductForm
also called onClose -> navigate(-1) again (double back); Dashboard `handleProductSave` swallowed
errors so ProductForm closed + reset the form on failure; `<Toaster />` only mounted in Dashboard
(toasts on view/edit pages never shown); navigate(-1) leaves the app on a direct link / new tab.
### Phase 1 — edit/save fix (DONE, 2026-11-05 3rd)
- [x] Edit page: call `api.updateProduct` with `previous_remaining_stock`, i18n toasts, throw on error (already written)
- [x] 1a. `src/hooks/useGoBack.ts` (history idx > 0 -> back, else fallback, replace). Edit page uses it,
      fallback `/view/product/:id`. Also fixes the dangling `@/hooks/useGoBack` import in ProductNotFound.tsx
- [x] 1b. Dashboard `handleProductSave`: save errors toast + rethrow (dialog stays open with changes);
      on success close + i18n toast first, list refresh failure -> `messages.savedRefreshFailed` warning (fr + ar)
- [x] 1c. Single `<Toaster />` at App root (removed from Dashboard)
- [x] 1d. tsc: only the 5 pre-existing pagination errors; vite build OK; biome 1.9.4 (via bunx, local
      arm64 binary missing): 0 new issues (11 -> 10), useGoBack.ts clean
### Phase 2 — back navigation + spending drill-down (DONE, 2026-11-05 6th)
Re-verified in code (6th): most items were already written; only Esc handling was missing.
- [x] ViewProduct: `const goBack = useGoBack("/")` declared (already in code, line 508)
- [x] ProductNotFound full + inline use `useGoBack("/")` (already done)
- [x] Backend `GET /api/stats/spending/entries` (already in server.js)
- [x] Types + api client + `SpendingMonthDetail` component (already written)
- [x] `SpendingReportDialog`: month rows clickable -> `SpendingMonthDetail` + click hint (already in code)
- [x] Esc in a month detail = back to the 12-month table (dialog `onEscapeKeyDown`), `Esc` kbd on back button (added)
- [x] i18n fr + ar `spending.detail.*` (already present, incl. ar plural forms; 0 missing keys)
- [x] Verify: node --check OK; tsc = only the 5 pre-existing pagination errors; vite build OK;
      biome 1.9.4: 4 phase files clean (ViewProduct has 2 pre-existing issues: PriceHistory redeclare, extra dep)
---
## Previous request (2026-11-05) — products_manager: stock cost value + purchase spending
Stat 1 = SUM(purchase_price * remaining_stock) (live). Stat 2 = money spent on stock, frozen
at purchase time (sales must not reduce it), by month / year, click -> monthly table + totals.
Status 2026-11-05: all items below were already in the code; re-verified, no code changes needed.
- [x] Backend: `stock_purchases` table (no FK, frozen total_cost) + one-time opening backfill
- [x] Backend: record purchase on POST (initial stock) and PUT (stock increase vs form baseline)
- [x] Backend: `/api/stats` -> stockCostValue, spentThisMonth/Year/AllTime; `/api/stats/spending?year=`
- [x] Frontend: types + api client, 2 new cards in App.tsx, `SpendingReportDialog.tsx`
- [x] i18n fr + ar: `stats.*` new keys + `spending.*` (32 keys, none missing)
- [x] Verify: node --check OK, build OK (needs root `bun install` for framer-motion), biome clean on feature files
- [~] SQL not run: no MySQL binary in this environment
- Noted, not fixed (pre-existing): 5 tsc errors on pagination type in App.tsx; product-manager local biome binary missing

---

## Current request (2026-11-04, 5th session) — QR sale client field, verified in code first
Verified gaps (then): `resolveCheckoutCustomer` undefined (checkout 500), "9" did not find code "009",
CustomerDetails still old (shows "-"), no `code` in Customers form, i18n keys missing.
MySQL skipped on user request -> verify with node --check, parser test, build, lint, render.
Audit 2026-11-07 (6th): backend is DONE; the frontend is only partly done.
- [x] Server: `resolveCheckoutCustomer` defined (salesController.js:207, called at :341): id -> existing by code/phone/name -> create; `customer_auto` -> `Customer.createAutoNumbered()` (locked counter, 3-digit, skips used numbers)
- [x] Server: numeric code match in `findByLabel` + `search` (`NUMERIC_CODE_SQL`, `numericCodeValue`: "9" / "N° 9" finds "009")
- [~] QrSale: sends `customer_id` + `customer_label` + `customer_auto` (done); 207 partial still uses the till's
      `fallbackDisplay` (QrSale.jsx:506) instead of `data.customer` returned by the server
- [~] CustomerPicker: keyboard nav + "will create" row done; exact-match check is a strict string compare
      (`c.code === query`, so "9" vs "009" still shows "will create"); NO "N° auto" button — `setCustomerAuto`
      is defined in QrSale.jsx:234 but never used, so `customer_auto` is never sent as true
- [ ] CustomerDetails rewrite on `/overview`: still the old page (fetches `/api/customers/:id` + payments/products
      totals, uses `customers.*` keys). Server route `GET /api/customers/:id/overview` exists, unused by the UI
- [ ] Customers list: no `code` anywhere in `Customers.jsx` (no field, no badge, no till totals, no 409 message).
      Server side is ready (`normalizeCustomerCode`, 409 `duplicateCodeResponse` in customerController)
- [~] i18n: `qrSale.customer.*` (fr 11 / ar 15) + `qrSale.receipt.customer` done; `customerDetails.*` and
      `customers.code*` MISSING (0 keys); no keys yet for the "N° auto" button
- [ ] Verify: node --check, parser test, build, lint, render /qr-sale + /customers/:id

## Previous request (2026-11-04, 4th session) — [superseded by 5th session, statuses synced 2026-11-07]
- [~] Empty client field -> auto client "Client N° 009": server done (`createAutoNumbered`), no till button to trigger it
- [x] Define `resolveCheckoutCustomer` (id -> existing by number/phone/name -> create)
- [x] Typed number "9" / "009" / "N° 9" finds "Client N° 009" (numeric match in findByLabel + search)
- [~] Receipt / success screen show the server customer (done); partial (207) still uses the till text
- [~] i18n fr + ar: `qrSale.customer.*` + `qrSale.receipt.customer` done; `customerDetails.*`, customers code missing
- [ ] CustomerDetails rewrite on `/overview`: inline edit (incl. client number), purchases by ticket, totals, top products
- [ ] Customers list: client number field in form + badge on rows
- [ ] Verify: node --check, parser test, build, lint

## Previous request (2026-11-04) — QR sale customers (phase by phase) [some [x] below were WRONG, fixed 2026-11-07]
### Phase 1 — Client field on QR sale (name OR id / receipt client number)
- [x] Remove broken `RemoteScanPanel` import in `QrSale.jsx` (already gone)
- [x] Render `CustomerPicker` in the checkout card (text + selected persisted in localStorage)
- [x] Send `customer_id` / `customer_label` with the checkout request
- [x] i18n `qrSale.customer.*` + `qrSale.receipt.customer` (fr + ar)
### Phase 2 — Confirm sale adds the client to the clients list
- [x] `checkoutSale`: resolve customer (id -> exact name/code/phone -> create); `customerId` defined (line 353)
- [x] `parseCustomerLabel` helper: numbers / "N°1234" -> code + "Client 1234"
- [x] `getCustomerOverview` import in `routes/customers.js`
- [x] Success screen + receipt show the client, "new client" badge + link to client page (QrSale.jsx:696)
### Phase 3 — Client page (edit info + purchases + totals) [was marked done; audit 2026-11-07: NOT done]
- [ ] `CustomerDetails.jsx` rewrite on `/api/customers/:id/overview` (still the old page)
- [~] Inline edit form incl. client number (`code`): controllers accept `code` + 409 (done); no UI
- [ ] Purchases grouped by ticket + top products (UI)
- [ ] Clients list: code badge, code field in form, POS totals (server search by code / ID done)
### Phase 4 — Live client suggestions while typing
- [x] Search accepts 1-digit IDs, ranks exact id/code/name first
- [x] Picker: keyboard nav, "will be created" row
### Verify
- [ ] `node --check` server files, label parser test, frontend build + lint, render /qr-sale + /customers/:id

---

## Phase 0 — Foundations
- [x] `QrScanner.jsx` camera scanner (html5-qrcode)
- [x] `lib/qr.js` (`parseScannedProductId`, `generateProductQrDataUrl`, `playScanBeep`)
- [x] `lib/print.js` (80mm receipt + QR label sheets / rolls)
- [x] `checkoutSale` controller + `POST /api/sales/checkout` (import fixed)
- [x] `Sale.create` accepts `sale_number`
- [x] `/qr-sale` route in `App.jsx`

## Phase 1 — QR sale MVP
- [x] `QrSale.jsx`: scanner, manual / USB input, cart, payment, checkout
- [x] Scanner reads the products_manager text payload ("Id de Produit: 125\n...")
- [x] i18n fr/ar: `qrSale.*`, `qrSale.scanner.*`, `qrSale.receipt.*`, `nav.qrSale`
- [x] CSS: `.qr-scan-line` keyframes + `.qr-reader video` (`index.css`)
- [x] Navigation: "Vente QR" tab
- [x] Cart UX: -/+ steppers, editable price + reset to catalogue price, totals, recent scans
- [x] Checkout result: 409 details, success screen, print receipt, new sale
- [x] Cart + payment method persisted in `localStorage`

## Phase 2 — QR labels
- [x] `QrLabels.jsx`: search, copies, size, layout (A4 / roll), name / price, preview, print
- [x] `/qr-labels` route + "Etiquettes QR" nav tab + i18n `qrLabels.*` (46 keys fr / ar)
- [x] Labels encode only the product ID (`encodeProductQr`)

## Phase 3 — Hardening (IN PROGRESS) — audited 2026-11-07
- [x] Stock fallback `remaining_stock || stock_quantity` -> `??` (both products APIs)
- [x] Remove duplicate integration routes in `products_manager/backend/server.js`
- [~] Atomic checkout: `POST /api/integration/sale/batch` (one transaction, row locks, all-or-nothing)
      - [x] Handler written: `products_manager/backend/integration/saleBatch.js`
      - [ ] Register route in `products_manager/backend/server.js` + `sales_manager/server.js` mirror (`saleBatch` imported nowhere)
      - [ ] `checkoutSale` calls the batch endpoint (still per-line `/api/integration/sale`, salesController.js:363)
      - [ ] Remove the 207 partial case (now `salesController.js:400`, `QrSale.jsx:494`)
- [~] Idempotency key on checkout (client-generated, persisted with the cart, cleared on success)
      - [x] Server side in `saleBatch.js` (`integration_requests` table)
      - [ ] Client key in `QrSale.jsx` + forwarded by `checkoutSale` (no idempotency code in either)
- [ ] products_manager QR shows ID only (`ViewProduct.tsx:1074` still encodes the long text payload)
- [~] Remove hard-coded URLs -> `config/integration.js` / `PRODUCTS_API_URL`
      - [x] Frontend: no hard-coded host left in `sales_manager/src` (only `config/integration.js`)
      - [x] `checkoutSale` uses `PRODUCTS_API_URL` (salesController.js:168)
      - [ ] `salesController.createSale` still calls `http://localhost:5000/api/integration/sale` (line 120)
- [ ] Port 5000 conflict: `sales_manager/server.js` mirror (`PORT || 5000`) vs `products_manager/backend/server.js` (`PORT || 5000`)
- [ ] `/api/health` registered twice in `products_manager/backend/server.js` (now lines 1496, 1552)

## Current request (2026-11-03) — audited 2026-11-07
- [ ] QrSale.jsx: client idempotency key (persisted with cart, cleared on success / clear) -> checkoutSale accepts + forwards
- [~] Hard-coded localhost URLs -> config/integration.js (frontend done) / PRODUCTS_API_URL (only `createSale` line 120 left)
- [ ] products_manager ViewProduct QR = product ID only; remove 2nd /api/health
- [ ] sales_manager/server.js mirror -> own port (PRODUCTS_MIRROR_PORT, default 5002)

## Phase 4 — Point-of-sale features — audited 2026-11-07
- [~] Attach a customer to a QR ticket: done (`customer_id` saved on every line, `credit` payment allowed);
      credit sales do NOT update a customer balance yet
- [ ] Ticket-level and per-line discount (no discount in QrSale; checkout saves `discount: 0`)
- [ ] Dedicated `tickets` table; group lines by ticket in Historique Ventes (still `[TKT-...]` in notes)
- [ ] Reprint any past ticket from the sales history (nothing in SalesList)
- [ ] EAN-13 / Code-128 barcode lookup (by `barcode` / `sku`, not only ID)
- [ ] Keyboard-only mode for USB scanners (F2 = checkout, Esc = clear) — scan queue exists, no shortcuts
- [ ] Daily cash closing report (Z report)

## Phase 5 — Platform — audited 2026-11-07
- [ ] Authentication and roles (cashier / manager) on both APIs (no auth library in any package.json)
- [ ] Stop committing `.env` (`products_manager/backend/.env`, `sales_manager/server/.env` still tracked)
- [ ] Restrict CORS (`origin: '*'` in sales API, open `cors()` in products API + mirror)
- [ ] Offline queue for sales when the catalogue API is down
- [ ] Capacitor Android build of the QR sale page (only products_manager has a Capacitor config)
- [ ] Automated tests: `parseScannedProductId`, `checkoutSale`, cart logic (no test files exist)

## Housekeeping
- [x] Update `ROADMAP.md` checkboxes (verified 2026-11-03, progress table + verification log added)
- [ ] Update the ROADMAP flow diagram once the batch checkout replaces per-line calls (still per-line, ROADMAP.md:46)
- [ ] Clean `.same/` temp files (`tmp_i18n.py`, `tmp_keys.py`, `tmp_i18n_check.js`, `tmp_entry_form.jsx`)
