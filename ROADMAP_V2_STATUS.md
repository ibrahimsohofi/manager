# SOHOFI BRICO — Roadmap v2 status check

Status of the [Roadmap v2](ROADMAP_V2.md) work items, checked by reading the code.

> **Checked: 2026-11-11.** Code reading only: no sale or API call was run (MySQL is not set up in
> this environment). Items marked `[?]` were not settled yet and need a second look.
> **2026-11-13:** re-checked; done items removed from the tables (P-04, A-US6, F-06, B-02, B-03, C-01, C-04).
> Only partial, open and to-verify items are listed.

Legend: `[~]` partial · `[ ]` not done · `[?]` to verify

---

## Summary

| Milestone | Checked | Done (removed) | Partial | Not done | To verify |
| --- | --- | --- | --- | --- | --- |
| M0 — Foundations | 2 / 8 | 1 | 0 | 1 | 0 |
| M1 — Client on the QR sale | 8 / 13 + A-US6 | 1 | 5 | 3 | 0 |
| M2 — Client profile | 11 / 15 + F-06 | 3 | 7 | 2 | 0 |
| M3 — Le Carnet | 17 / 18 | 2 | 2 | 2 | 11 |
| M4 — Phone scanner | not checked | | | | |
| M5 — Migration, QA, release | not checked | | | | |

**Key takeaway:** M1 is mostly built already, with a different numbering scheme: plain customer
labels and auto codes like `009` instead of `C-0042`. The main gaps are the `CLIENT:` QR, the deep
link and reuse in the manual sale form. M2 has a working profile page, but it has no tabs, and the
`PATCH` route (F-09) is still missing. M3 exists under its own names (`PersonalLedger`, `Carnet.jsx`,
`CarnetPerson`) and needs a full pass.

---

## M0 — Foundations

| ID | Item | Status | Findings |
| --- | --- | --- | --- |
| P-03 | Versioned migration runner (`schema_migrations`) | `[ ]` | There is an ad-hoc `runMigrations()`, but no versioned `server/migrations/NNNN_*.sql` files and no `schema_migrations(version, applied_at)` tracking table. No `db:migrate` / `db:status` scripts. |

Not checked: P-01, P-02, P-05, P-06, P-07, P-08.

---

## M1 — Epic A: Client on the QR sale

| ID | Item | Status | Findings |
| --- | --- | --- | --- |
| A-02 | `normalizeName()` / `normalizePhone()` (FR + AR) | `[ ]` | No Arabic-aware name or phone normalization found. Only the customer label parsing exists (`src/lib/customerLabel.js`: `9` = `009` = `N° 9`). |
| A-05 | `checkoutSale` finds or creates the client | `[~]` | `resolveCheckoutCustomer` in `salesController.js` links a picked client, finds or creates a typed one, creates an auto-numbered client (`customer_auto`) and assigns a code when it's missing, and rejects a credit sale without a client. **To verify:** whether `last_purchase_at` is stored or only computed. |
| A-06 | `useCustomerLookup` hook (debounce, abort, cache of 20) | `[~]` | No dedicated hook. The lookup logic is inline in `CustomerPicker.jsx`: 180 ms debounce (roadmap: 150 ms), `AbortController`, calls `GET /customers/search?q=`. **Missing:** the cache of the last 20 queries. |
| A-07 | `CustomerPicker` combobox (ARIA 1.2, RTL, dark mode) | `[~]` | **Present:** combobox and listbox roles, arrow keys, Enter, Escape, client number and ID chips, a "will create" row for new names, the `N° auto` button, dark mode. **Missing:** `aria-activedescendant`, Backspace to clear the selected chip, the `F4` shortcut, the balance badge, an "Ouvrir la fiche" link, and the duplicate guard. |
| A-08 | QrSale integration (client card, `F4`, persistence, payload, credit check) | `[~]` | **Present:** client card, persistence in `localStorage`, `customer_id` / `customer_label` / `customer_auto` in the checkout payload, credit check (warning + blocked checkout without a client). **Missing:** `F4`. |
| A-09 | Success screen, receipt rows, optional client QR | `[~]` | **Present:** client rows on the receipt (`print.js`, including the `N° CLIENT` code) and on the success screen. **Missing:** the optional client QR on the receipt. |
| A-10 | `parseScannedPayload()` with the `CLIENT:` prefix | `[ ]` | No `CLIENT:` QR handling. Scanning a client QR doesn't select the client. |
| A-11 | Reuse `CustomerPicker` in `SalesForm.jsx` | `[ ]` | The manual sale form doesn't use `CustomerPicker`. |

Not checked: A-01, A-03, A-04, A-12, A-13.

**Changes from the roadmap**

- Client numbers are zero-padded codes (`009`, shown as `N° 009`) instead of `C-0042`. Auto-created
  clients are named "Client N° 009".
- **Uncommitted change (2026-11-11):** `N° auto` is now **on by default** at the till and stays on
  after each sale. An empty field now creates a numbered client unless the cashier clicks ✕. This
  differs from A-US5 ("leave the field empty → a walk-in sale works exactly as it does today").

---

## M2 — Epic B: Client profile (Fiche client)

### Work items

| ID | Item | Status | Findings |
| --- | --- | --- | --- |
| B-04 | `Customer.patch()` + `PATCH` route (F-09) | `[~]` | No `PATCH` route yet. `PUT` still requires `name`, so a partial update through `PUT` doesn't work. |
| B-07 | Profile page with header and KPI cards | `[~]` | **Present:** header, KPI cards (spending, tickets, credit), links to a new sale and to the wishlist. **Missing:** tabs and charts. |
| B-08 | Purchases with expandable tickets and receipt reprint | `[~]` | Expandable ticket list present. **Missing:** receipt reprint. |
| B-09 | Products with sorting and CSV export | `[~]` | Top products present. **Missing:** CSV export. |
| B-10 | Payments and credit: statement, add payment, print / WhatsApp | `[~]` | Credit KPI present. **Missing:** statement (print and WhatsApp). |
| B-11 | Edit with PATCH, inline errors, unsaved-changes guard | `[~]` | Edit form present, but it saves through `PUT` (see B-04). |
| B-12 | Merge dialog | `[ ]` | No merge. |
| B-13 | Client list upgrades | `[~]` | **Missing:** filters, sorting and server-side pagination. |
| B-14 | Deep link `/qr-sale?customer=8` | `[ ]` | The `customer` query parameter isn't read by `QrSale.jsx`. |

Not checked: B-01, B-05, B-06, B-15.

---

## M3 — Epic C: Le Carnet (الكناش)

Built under different names: tables from `ensurePersonalLedgerTables`, model `PersonalLedger`,
helpers in `server/utils` and `src/lib/carnet.js`, screens `Carnet.jsx` and `CarnetPerson`.

| ID | Item | Status | Findings |
| --- | --- | --- | --- |
| C-02 | Models (balances, running balance, overdue) | `[~]` | Models in `PersonalLedger`, helpers in `utils`. **To verify:** overdue handling in `summarizeEntries`. |
| C-03 | Controllers and routes, with validation | `[?]` | Validation not reviewed yet. |
| C-05 | Nav tab + `/carnet` and `/carnet/:id` routes | `[?]` | |
| C-06 | Carnet home: summary cards, filters, search, sorting | `[?]` | |
| C-07 | Person page header: balance, call / WhatsApp, actions | `[?]` | |
| C-08 | Chat-style timeline with running balance | `[?]` | |
| C-09 | Quick entry sheet | `[?]` | |
| C-10 | Person form (create, edit, link to client or supplier) | `[~]` | The person ↔ client / supplier link doesn't exist in the schema. Create and edit not reviewed yet. |
| C-11 | Settle confirmation, undo toasts, soft delete | `[ ]` | No settle confirmation and no soft delete. |
| C-12 | Statement print (80 mm / A4) and WhatsApp share | `[?]` | Check whether `CarnetPerson` exposes print and WhatsApp share. |
| C-13 | Discreet mode | `[?]` | |
| C-14 | Dashboard widget "À relancer" + nav badge | `[?]` | |
| C-15 | Carnet card on the client profile | `[ ]` | Blocked: there's no person ↔ client link (see C-10). |
| C-17 | Tests | `[?]` | Only a printing script seen so far. Check for real tests. |
| C-18 | Empty states and onboarding | `[?]` | Check in `Carnet.jsx`. |

Not checked: C-16.

---

## Open work found so far

1. Add a versioned migration runner with `schema_migrations` (P-03).
2. Add `Customer.patch()` and a `PATCH` route, and switch the profile edit to it (B-04, B-11).
3. Add the `CLIENT:` QR (A-10), the client QR on the receipt (A-09), the `/qr-sale?customer=` deep
   link (B-14), and `CustomerPicker` in `SalesForm.jsx` (A-11).
4. Finish the `CustomerPicker` gaps: `F4`, `aria-activedescendant`, Backspace, balance badge, profile
   link, duplicate guard, and the cache of 20 queries (A-06, A-07, A-08).
5. Carnet: settle confirmation and soft delete (C-11), person ↔ client / supplier link (C-10, C-15).

## Still to verify

- `last_purchase_at`: stored on checkout or computed?
- Overdue handling in `summarizeEntries` (C-02) and route validation (C-03).
- Carnet UI items C-05 to C-09, C-12 to C-14, C-17, C-18.
- Profile details: product sorting (B-09), add payment (B-10), inline errors and the unsaved-changes
  guard (B-11).
