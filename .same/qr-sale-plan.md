# QR Sale Integration Plan (sales_manager)

Goal: scan a product QR code (camera or USB scanner), build a cart, and record the
whole cart as sales (one ticket) so every line shows up in the Sales History list,
with stock decremented in products_manager.

## Current state (before this work)
- DONE: `src/components/QrScanner.jsx` (camera scanner, html5-qrcode)
- DONE: `src/lib/qr.js` (parse scanned ID, generate QR image, beep)
- DONE: `src/lib/print.js` (80mm receipt + QR label sheets/rolls)
- DONE: `server/controllers/salesController.js` -> `checkoutSale` (multi-line ticket)
- DONE: `server/routes/sales.js` -> `POST /api/sales/checkout`
- BROKEN: `checkoutSale` is used in `server/routes/sales.js` but not imported (API crashes on start)
- MISSING: no page uses the scanner (no component, no route, no nav tab)
- MISSING: `qrSale.*` translation keys in `fr.json` and `ar.json`
- MISSING: CSS for `.qr-scan-line` animation and `.qr-reader video` sizing in `index.css`
- UNUSED: receipt printing and QR label printing helpers

## Tasks
1. [ ] Backend: import `checkoutSale` in `server/routes/sales.js`
2. [ ] Backend: verify `Sale.create` accepts every field sent by `checkoutSale` (e.g. `sale_number`)
3. [ ] Frontend: new `src/components/QrSale.jsx` page ("Vente QR")
   - Camera scanner (`QrScanner`) + manual ID / USB-scanner input (Enter to add)
   - Scan -> parse ID -> fetch product from products_manager -> add to cart
   - Scanning the same product again increments its quantity
   - Live stock check per line (blocks quantities above available stock)
   - Edit quantity / price, remove line, clear cart
   - Beep + green/red flash feedback on each scan, recent-scan log
   - Payment method + optional note, totals (lines, units, amount in MAD)
   - Checkout via `POST /api/sales/checkout` -> lines appear in Sales History
   - Handle errors: insufficient stock (409), inventory offline (503), partial save (207)
   - Success screen with ticket number + "Print receipt" (80mm) + "New sale"
   - Cart saved in localStorage so a page refresh does not lose it
4. [ ] Frontend: new `src/components/QrLabels.jsx` page ("Etiquettes QR")
   - Search products, add with number of copies
   - Size (small / medium / large), layout (A4 sheet / label roll), show name / price
   - Print using `buildLabelsHtml` + `generateProductQrDataUrl`
5. [ ] Routing: add `/qr-sale` and `/qr-labels` routes in `App.jsx`
6. [ ] Navigation: add "Vente QR" and "Etiquettes QR" tabs in `Navigation.jsx`
7. [ ] i18n: add all `qrSale.*`, `qrLabels.*` and nav keys in `fr.json` and `ar.json` (RTL friendly)
8. [ ] CSS: add `.qr-scan-line` keyframes and `.qr-reader video` styles in `index.css`
9. [ ] Verify: install deps, build/lint the frontend, start the servers and check the pages render

## Notes
- Camera needs HTTPS or localhost; the scanner already shows a message otherwise.
- QR codes contain only the product ID (e.g. "125"), see `src/lib/qr.js`.
- Existing UI style: Tailwind, gray/white cards, dark mode, French first + Arabic RTL.
