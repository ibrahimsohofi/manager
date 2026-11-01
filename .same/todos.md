# Todos — SOHOFI BRICO (QR point of sale)

Source: `ROADMAP.md`. Status verified against the code on 2026-11-01.
Environment note: MySQL is NOT available here -> do not set up / import databases.
Verify with syntax checks, frontend build, lint and page render only.

Legend: `[x]` done (verified in code) · `[ ]` to do

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
- [x] `/qr-labels` route + "Etiquettes QR" nav tab + i18n `qrLabels.*`
- [x] Labels encode only the product ID (`encodeProductQr`)

## Phase 3 — Hardening (NEXT)
- [ ] Stock fallback `remaining_stock || stock_quantity` -> `??`
      - `products_manager/backend/server.js` lines 928, 955, 1110, 1111
      - `sales_manager/server.js` (mirror) lines 390, 391
- [ ] Remove duplicate integration routes in `products_manager/backend/server.js`
      (`/product/:identifier`, `/availability`, `/search`, `/low-stock` registered twice; first one wins)
- [ ] Atomic checkout: `POST /api/integration/sale/batch` (one transaction, row locks, all-or-nothing)
      - `checkoutSale` calls the batch endpoint instead of per-line `/api/integration/sale`
      - Remove the 207 partial case (`salesController.js:316`, `QrSale.jsx:418`)
- [ ] Idempotency key on checkout (client-generated, persisted with the cart, cleared on success)
- [ ] products_manager QR shows ID only (`ViewProduct.tsx:1071` still encodes the long text payload)
- [ ] Remove hard-coded URLs -> `config/integration.js` / `PRODUCTS_API_URL`
      - `SalesList.jsx` lines 58, 76, 103
      - `SalesForm.jsx` lines 67, 305, 328
      - `salesController.js` line 118 (`createSale`)
- [ ] Port 5000 conflict: `sales_manager/server.js` mirror vs `products_manager/backend/server.js`

## Phase 4 — Point-of-sale features
- [ ] Attach a customer to a QR ticket (credit sales update customer balance)
- [ ] Ticket-level and per-line discount
- [ ] Dedicated `tickets` table; group lines by ticket in Historique Ventes (instead of `[TKT-...]` in notes)
- [ ] Reprint any past ticket from the sales history
- [ ] EAN-13 / Code-128 barcode lookup (by `barcode` / `sku`, not only ID)
- [ ] Keyboard-only mode for USB scanners (F2 = checkout, Esc = clear)
- [ ] Daily cash closing report (Z report)

## Phase 5 — Platform
- [ ] Authentication and roles (cashier / manager) on both APIs
- [ ] Stop committing `.env` (`products_manager/backend/.env`, `sales_manager/server/.env` are tracked)
- [ ] Restrict CORS (`origin: '*'` in sales API, open `cors()` in products API)
- [ ] Offline queue for sales when the catalogue API is down
- [ ] Capacitor Android build of the QR sale page (only products_manager has a Capacitor config)
- [ ] Automated tests: `parseScannedProductId`, `checkoutSale`, cart logic (no tests exist yet)

## Housekeeping
- [ ] Update `ROADMAP.md` checkboxes (Phases 1 and 2 are done but still unchecked)
- [ ] Update the ROADMAP flow diagram once the batch checkout replaces per-line calls
