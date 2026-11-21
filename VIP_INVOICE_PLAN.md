# VIP Client — Professional Invoice (Pro Bill): Implementation Plan (chunk by chunk)

Spec: "VIP Client – Professional Invoice (Receipt) System" (§1 below).
Scope: `sales_manager` only. That means the API in `sales_manager/server/` and the UI in `sales_manager/src/`.
`products_manager` is not touched, because the catalogue / stock flow of the checkout stays the same.
Principle: add a second document template next to the existing one. **Do not change the QR Sale receipt.**

```text
Regular client  ->  Standard QR Sale receipt  (80 mm thermal, buildReceiptHtml — unchanged)
VIP client      ->  Professional invoice      (A4, new buildInvoiceHtml + unique invoice number)
```

---

## 1. Feature spec

### 1.1 VIP client logic
- Every client profile gets a **VIP status** (on / off, default off).
- When a QR Sale is checked out for a VIP client, the system **skips the standard QR Sale receipt** and produces a
  **professional, printable invoice** instead.
- Regular clients and anonymous sales keep getting the existing QR Sale receipt, **with no change at all**.
- The server decides which template to use (§2, decision 3), based on the client attached to the ticket.

### 1.2 Invoice layout

**A. Header**
- Store logo
- Store name
- Store subtitle / business description
- Client full name
- Client contact (phone number)
- Invoice date
- Invoice number (unique, generated automatically)

**B. Items table**: every product of the sale.

| Product ID | Product Name | Unit Price | Quantity | Total |
|---|---|---:|---:|---:|
| 001 | Example Product | 50.00 DH | 2 | 100.00 DH |

**C. Invoice summary**
- Full invoice total
- The final amount must stand out and be easy to find (largest number on the page, in a highlighted band).

**D. Footer**: a horizontal divider (`<hr>`), then:
- A thank-you note / business message that the shop can edit
- Store address / location
- Store phone number

### 1.3 Requirements
- Clean, modern, professional design.
- Built for **A4 printing**.
- Lays out correctly when saved as **PDF** (browser print dialog → "Save as PDF").
- Every value comes from the client profile and the matching sale. Nothing is hard-coded.
- **Invoice numbers are unique.**
- The QR Sale flow and the receipt design for regular clients stay **unchanged**.

### 1.4 Expected behavior
| Client on the ticket | Document produced | Print button label |
|---|---|---|
| None (anonymous sale) | Standard QR Sale receipt | "Imprimer le ticket" (unchanged) |
| Regular client (`is_vip = 0`) | Standard QR Sale receipt | "Imprimer le ticket" (unchanged) |
| VIP client (`is_vip = 1`) | Professional invoice (Pro Bill) | "Imprimer la facture" |

---

## 2. Decisions

1. **The VIP flag is its own column:** `customers.is_vip TINYINT(1) NOT NULL DEFAULT 0`.
   It is **not** a new `customer_type` value. Type (retail / wholesale / commercial) and VIP are separate:
   a wholesale client can be VIP. The column is added at startup with the existing `addColumnIfMissing`
   (`server/config/database.js`), so no manual SQL is needed.
2. **The invoice number is sequential per year:** `FAC-2026-00001`, `FAC-2026-00002`, …
   - It comes from the existing transaction-safe `app_counters` table (same pattern as `takeNextAutoCode` in
     `server/models/Customer.js`). The counter is named `invoice_<year>` and its row is locked with `FOR UPDATE`, so two tills never get the same number.
   - It is guaranteed by `UNIQUE (invoice_number)` on the new `invoices` table.
   - It is issued **only after every line of the ticket succeeded**. Failed sales never use up a number, so the sequence has no gaps.
   - **One invoice per ticket:** `UNIQUE (ticket_number)`. Issuing again for the same ticket returns the existing invoice, so the call is safe to retry.
3. **The server picks the template.** `checkoutSale` already resolves the client (`resolveCheckoutCustomer`).
   When that client is VIP, it issues the invoice and adds `document: "invoice"` + `invoice: {…}` to the 201 response.
   Otherwise it returns `document: "receipt"` and the response is the same as today.
   So a VIP client found from **typed text** (client number / phone typed at the till) also gets an invoice, not only one picked from the suggestions.
4. **Client data is copied onto the invoice:** name, phone and client number are stored on the `invoices` row when it is issued.
   A reprint shows the same details even if the profile is edited later.
5. **Store details are editable settings.** No store address or phone exists anywhere in the app today.
   - New key/value table `app_settings` + `GET/PUT /api/settings/invoice`.
   - Keys: `store_name`, `store_subtitle`, `logo_url`, `store_address`, `store_phone`, `thank_you_note`.
   - Defaults: name / subtitle come from `app.title` / `app.subtitle`, the logo is `/sohofibrico_logo.svg` (copied from `products_manager/public/`), and the note is "Merci pour votre confiance.".
     An empty address or phone hides that footer line.
   - Edited in a small "Paramètres facture" dialog (button in the Customers page header).
6. **Partial checkout (HTTP 207) never issues an invoice.** The partial ticket keeps printing the standard receipt, as it does today.
   It is an incident document, and the Phase 3 batch checkout will remove the 207 case anyway.
7. **If invoice creation fails, the sale is not blocked.** The sale is already saved, so the server still answers 201 with
   `document: "invoice"`, `invoice: null`, `invoice_error`. The till shows "Facture non générée", a **Réessayer** button calls
   `POST /api/invoices/issue { ticket_number }` (rebuilds the lines from the `sales` rows of that ticket), and a VIP never falls back to the thermal receipt silently.
8. **The receipt template is not touched.** `buildReceiptHtml` in `src/lib/print.js` stays byte-for-byte the same.
   The invoice is a **new** function, `buildInvoiceHtml`, in the same file. It reuses `escapeHtml`, `formatAmount` and `printHtml`.
9. **Language:** the invoice prints in the current UI language (French LTR / Arabic RTL), like the receipt.
   New keys go under `qrSale.invoice.*` and `customers.vip.*` in **both** `fr.json` and `ar.json`.
10. **Money format:** reuse `formatAmount` (fr-FR, `50,00`) + the app currency label (`t("currency")`), so the receipt and invoice match.
    See open question 1 about "DH".
11. **No VAT breakdown.** QR sales are saved with `tax_amount = 0`, so the invoice shows a single total (no HT / TVA / TTC).

---

## 3. Data model

```sql
-- customers (startup migration via addColumnIfMissing)
ALTER TABLE customers ADD COLUMN is_vip TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoices (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number  VARCHAR(30)  NOT NULL,
  ticket_number   VARCHAR(40)  NOT NULL,
  customer_id     INT          NULL,
  customer_name   VARCHAR(255) NOT NULL,
  customer_phone  VARCHAR(50)  NULL,
  customer_code   VARCHAR(50)  NULL,
  items_count     INT          NOT NULL DEFAULT 0,
  total_units     INT          NOT NULL DEFAULT 0,
  total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method  VARCHAR(20)  NULL,
  issued_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoices_number (invoice_number),
  UNIQUE KEY uq_invoices_ticket (ticket_number),
  INDEX idx_invoices_customer (customer_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  name       VARCHAR(80) PRIMARY KEY,
  value      TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

Invoice lines are **not** copied into a separate table. They are the `sales` rows whose `sale_number` starts with the
ticket number (`TKT-…-01`, `-02`, …), which is the grouping `TICKET_KEY_SQL` already uses in `Customer.js`.

### API contract

```text
POST /api/sales/checkout   (existing, response extended)
  201 { success, ticket_number, created_at, payment_method, items, total_units, total_amount, customer,
        document: "receipt" | "invoice",
        invoice?: { invoice_number, issued_at, customer_name, customer_phone, customer_code },   // VIP only
        invoice_error?: string }                                                                 // VIP, issuance failed
  customer now also carries: is_vip (boolean)

POST /api/invoices/issue        { ticket_number }  -> 200 { invoice, items, totals }   (idempotent; retry / reprint)
GET  /api/invoices/:number                         -> 200 { invoice, items, totals }   (future reprint from history)
GET  /api/settings/invoice                         -> 200 { store_name, store_subtitle, logo_url, store_address, store_phone, thank_you_note }
PUT  /api/settings/invoice      { ...same keys }   -> 200 { ...saved values }
```

---

## 4. Invoice design (A4)

```text
┌──────────────────────────────────────────────────────────────┐
│ [LOGO]  SOHOFIBRICO                          FACTURE          │
│         Quincaillerie & Droguerie - Maroc    N° FAC-2026-00001│
│                                              Date 15/11/2026  │
│──────────────────────────────────────────────────────────────│
│ FACTURÉ À                                                     │
│ Ahmed Benali            Tél. 06 61 23 45 67     Client N° 011 │
│                                                               │
│ Réf.  │ Désignation          │ Prix unit. │ Qté │ Total        │
│ 001   │ Example Product      │   50,00 DH │  2  │  100,00 DH   │
│ …     │ …                    │        …   │  …  │        …     │
│                                     ┌─────────────────────────┐│
│                                     │ Articles            5   ││
│                                     │ TOTAL       1 250,00 DH ││
│                                     └─────────────────────────┘│
│ ──────────────────────────────────────────────────────────── │
│            Merci pour votre confiance.                        │
│        Adresse du magasin · Tél. 05 xx xx xx xx               │
└──────────────────────────────────────────────────────────────┘
```

- `@page { size: A4; margin: 14mm 14mm 16mm; }`, body width set by the page (no fixed 80 mm).
- Ink-friendly: near-black text, light grey table rules and zebra rows, **one** accent colour (the shop's brand red/orange) on the
  title and the total band, plus `print-color-adjust: exact`. It must still read clearly on a black-and-white laser printer.
- System fonts only, because web fonts may not load inside the print iframe in time:
  `"Segoe UI", Roboto, Helvetica, Arial` for French, `Tahoma, "Segoe UI", Arial` for Arabic.
- Numbers right-aligned with `font-variant-numeric: tabular-nums`. In RTL, the table and the summary box mirror.
- Product ID shown at least 3 digits long (`001`). Lines without a product ID show `—`.
- Long invoices: `thead { display: table-header-group }` repeats the column titles on every page, and
  `tr { break-inside: avoid }` keeps a row from splitting. The summary + footer block uses `break-inside: avoid`.
- The footer **follows** the summary (not `position: fixed`), so it never covers the table on a multi-page invoice.
- `<title>` = invoice number, so "Save as PDF" suggests `FAC-2026-00001.pdf`.
- The logo uses an absolute URL (`window.location.origin + logo_url`). `printHtml` already waits for images before printing.

---

## 5. Chunks

Chunks 1–7 are done. Their details are in the git history.

### Chunk 8: Verification
Environment note: MySQL is **not** available here, so check with syntax checks, frontend build, lint, and rendering only.
- [ ] `node --check` on every touched server file. `bun run build` in `sales_manager`. Biome lint on **touched files only**, without `--write`.
- [ ] **Receipt regression:** render `buildReceiptHtml` with a fixed sample ticket before and after the change. The output must be identical.
- [ ] Invoice render (temporary `tmp_invoice_preview.html` from `buildInvoiceHtml`): short invoice (2 lines), long invoice (60 lines →
      multi-page, header row repeated), Arabic RTL, missing phone / address / logo. Screenshot at A4 size.
- [ ] Invoice number logic: temporary script with an in-memory counter. Same ticket twice → same number. Two tickets → consecutive
      numbers. Year change → restarts at `00001`.
- [ ] Temporary mock API (no MySQL) for `/qr-sale`: VIP picked client → invoice. VIP found by typed client number → invoice.
      Regular / anonymous → receipt, exactly as before.
- [ ] Remove every `tmp_*` file. Update this file and `.same/todos.md`.

---

## 6. Acceptance checklist
- [ ] A client can be marked / unmarked VIP from the Customers form and the client page. The VIP badge appears on the list, the detail page and the till picker.
- [ ] Checkout for a VIP client prints an A4 invoice with logo, store name / subtitle, client name + phone, date and a unique `FAC-YYYY-NNNNN` number.
- [ ] Items table columns: Product ID · Product Name · Unit Price · Quantity · Total. The final total is the most prominent number.
- [ ] Footer: divider, then the editable thank-you note, store address, store phone.
- [ ] Prints cleanly on A4 and saves as a clean PDF (no clipped columns, header repeated on extra pages, nothing overlapping).
- [ ] Two invoices never share a number. Retrying for the same ticket returns the same number.
- [ ] Regular and anonymous clients get the exact same 80 mm receipt as before (receipt regression test passes).

---

## 7. Open questions (defaults used until answered)
1. **Currency label:** the spec example shows `50.00 DH`. The app currently prints `MAD` with French formatting (`50,00`).
   Default: keep the app label so the receipt and invoice match. Switch to "DH" on request.
2. **Legal details:** Moroccan B2B invoices often show **ICE / IF / RC / Patente**. Should the settings dialog have optional fields for them (printed in the footer)?
3. **Logo:** ANSWERED (2026-11-15): **SOHOFIBRICO**. `products_manager/public/sohofibrico_logo.svg` copied to
   `sales_manager/public/`. The default `logo_url` in `server/utils/invoice.js` is now `/sohofibrico_logo.svg`.
   (The old default `/jamalbrico-logo.png` was an empty 0-byte file.) Still editable in the settings.
4. **Payment method on the invoice:** the spec does not ask for it. Should "Paiement : Espèces / Crédit …" be shown under the date?
5. **Reprint:** ANSWERED (2026-11-16): **in scope**. Done on the client page (`CustomerDetails.jsx`), static checks only
   (`node --check`, biome on touched files, vite build; mock API render skipped on request).
   - `Customer.getOverview` also returns `invoices` (`invoice_number`, `ticket_number`, `issued_at`, `total_amount`), matched by
     `customer_id` or by the client's tickets. If the `invoices` table is missing, the list is empty and the page still loads.
   - A ticket with an invoice shows an "A4 · FAC-…" tag. Opening it shows the invoice number, its date and a **Réimprimer la facture** button.
   - The reprint calls `GET /api/invoices/:number` (client details copied at issue time + the ticket's current lines) plus
     `GET /api/settings/invoice` (cached per visit, defaults when unreachable). It prints through the same `buildInvoiceHtml` / `qrSale.invoice.*` labels as the till.
   - New `SALES_MANAGER_API.INVOICE_BY_NUMBER` and `customerDetails.invoice.*` keys (6, fr + ar).
   - Not done (outside the question): issuing an invoice from the client page for a VIP ticket that has none.
     Reprinting regular 80 mm receipts is still ROADMAP Phase 4.
