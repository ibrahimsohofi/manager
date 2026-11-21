// Printing helpers for the QR checkout (receipts) and QR labels.
// Printing uses an off-screen iframe so the app page itself is never affected.

import { amountInWords } from "./amountInWords.js";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const formatAmount = (value) =>
  new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const waitForImages = (doc) =>
  Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          }),
    ),
  );

export const printHtml = (html) =>
  new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText =
      "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;";
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win.document;
    doc.open();
    doc.write(html);
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => iframe.remove(), 300);
      resolve();
    };

    win.addEventListener("afterprint", cleanup);

    waitForImages(doc).then(() => {
      setTimeout(() => {
        win.focus();
        win.print();
        // Fallback for browsers that don't fire afterprint on iframes
        setTimeout(cleanup, 60000);
      }, 80);
    });
  });

// ==================== Receipt (80mm thermal ticket) ====================

/**
 * @param {object} ticket - { ticket_number, created_at, payment_method, items[], total_units, total_amount,
 *                            customer_display?, customer_code?, customer_name? }
 * @param {object} opts - { lang, storeName, storeSubtitle, currency,
 *                          labels: { ..., customerNumber? } }
 */
export const buildReceiptHtml = (ticket, opts) => {
  const { lang = "fr", storeName, storeSubtitle, currency, labels } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const date = new Date(ticket.created_at || Date.now());
  const dateStr = `${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

  // Keep the client number in the same compact metadata layout as the ticket.
  const customerCode = String(ticket.customer_code ?? "").trim();
  const customerRow = customerCode
    ? `<div class="row"><span>${escapeHtml(labels.customerNumber || "Client N°")}</span><strong dir="ltr">${escapeHtml(customerCode)}</strong></div>`
    : ticket.customer_display
      ? `<div class="row"><span>${escapeHtml(labels.customer || "Client")}</span><span>${escapeHtml(ticket.customer_display)}</span></div>`
      : "";

  const itemsHtml = ticket.items
    .map(
      (item) => `
      <div class="item">
        <div class="name">${escapeHtml(item.productName)}</div>
        <div class="row">
          <span>${item.quantity} x ${formatAmount(item.price)}${item.product_id ? ` <span class="ref">#${item.product_id}</span>` : ""}</span>
          <span class="amount">${formatAmount(item.totalPrice)}</span>
        </div>
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(ticket.ticket_number)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    width: 80mm;
    padding: 5mm 4mm 8mm;
    font-family: ${lang === "ar" ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Courier New', ui-monospace, monospace"};
    font-size: 12px;
    line-height: 1.35;
    color: #000;
  }
  .center { text-align: center; }
  .store { font-size: 19px; font-weight: 800; letter-spacing: 1.5px; }
  .sub { font-size: 11px; margin-top: 2px; }
  .sep { border: 0; border-top: 1px dashed #000; margin: 7px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .meta .row { font-size: 11px; }
  .item { padding: 3px 0; }
  .name { font-weight: 700; word-break: break-word; }
  .ref { font-size: 10px; }
  .amount { white-space: nowrap; font-weight: 700; }
  .total { font-size: 17px; font-weight: 800; margin-top: 3px; }
  .thanks { margin-top: 4px; font-size: 12px; font-weight: 700; }
  .small { font-size: 10px; margin-top: 3px; }
</style>
</head>
<body>
  <div class="center">
    <div class="store">${escapeHtml(storeName)}</div>
    ${storeSubtitle ? `<div class="sub">${escapeHtml(storeSubtitle)}</div>` : ""}
  </div>
  <hr class="sep" />
  <div class="meta">
    <div class="row"><span>${escapeHtml(labels.ticket)}</span><span>${escapeHtml(ticket.ticket_number)}</span></div>
    <div class="row"><span>${escapeHtml(labels.date)}</span><span>${escapeHtml(dateStr)}</span></div>
    <div class="row"><span>${escapeHtml(labels.payment)}</span><span>${escapeHtml(labels.paymentMethod)}</span></div>
    ${customerRow}
  </div>
  <hr class="sep" />
  ${itemsHtml}
  <hr class="sep" />
  <div class="row"><span>${escapeHtml(labels.items)}</span><span>${ticket.total_units}</span></div>
  <div class="row total"><span>${escapeHtml(labels.total)}</span><span>${formatAmount(ticket.total_amount)} ${escapeHtml(currency)}</span></div>
  <hr class="sep" />
  <div class="center thanks">${escapeHtml(labels.thanks)}</div>
  ${labels.footer ? `<div class="center small">${escapeHtml(labels.footer)}</div>` : ""}
</body>
</html>`;
};

// ==================== Invoice (A4, VIP clients) ====================
// Printed instead of the receipt when the ticket's client is VIP (VIP_INVOICE_PLAN.md §4).
// No document title and no "billed to" heading on purpose: the number / date card, the client
// card and the "Total net à payer" band identify the document on their own.
// Closing block, as on Moroccan trade documents: the total also written out in words
// ("Arrêté à la somme de"), next to the totals, and a "Cachet et signature" box under them.

// SOHOFIBRICO logo colours. Navy carries the structure (table head, total band) and prints as a
// dark grey on black-and-white lasers; orange is only a thin accent (rule, client edge, band edge).
const INVOICE_NAVY = "#082447";
const INVOICE_ACCENT = "#ea580c";

// Product ID shown at least 3 digits long ("001"); lines without one show a dash.
const formatProductRef = (id) => {
  const n = Number.parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? String(n).padStart(3, "0") : "—";
};

// Free text typed by the shop (names, address, note) can be French or Arabic whatever the
// invoice language: <bdi> gives each piece its own direction, so "12, Rue …" never turns
// into "Rue … ,12" on an Arabic invoice. The cell / line alignment still follows the page.
const isolate = (value) => `<bdi>${escapeHtml(value)}</bdi>`;

// Multi-line setting (address, thank-you note) -> escaped HTML with line breaks kept,
// each line isolated on its own.
const escapeMultiline = (value) =>
  String(value ?? "")
    .trim()
    .split(/\r?\n/)
    .map(isolate)
    .join("<br />");

// Built-in thank-you note (same default as server/utils/invoice.js). It is saved in French, so while
// the shop keeps it unchanged the invoice prints the translated note (qrSale.invoice.thanks) for the
// invoice language. A note typed by the shop prints as typed; an empty note stays hidden.
export const DEFAULT_INVOICE_NOTE = "Merci pour votre confiance.";
export const localizeInvoiceNote = (note, translated) =>
  translated && String(note ?? "").trim() === DEFAULT_INVOICE_NOTE ? translated : (note ?? "");

// "/logo.svg" -> absolute URL: the print iframe has no base URL of its own.
const absoluteUrl = (url, origin) => {
  const value = String(url ?? "").trim();
  if (/^\/(?!\/)/.test(value)) return `${origin}${value}`;
  return /^https?:\/\/\S+$/i.test(value) ? value : "";
};

/**
 * @param {object} invoice - { invoice_number, issued_at, customer_name, customer_phone?, customer_code?,
 *                             items: [{ product_id, productName, price, quantity, totalPrice }],
 *                             total_units, total_amount }
 * @param {object} opts - { lang, currency, origin?,
 *                          settings: { store_name, store_subtitle, logo_url, store_address, store_phone, thank_you_note },
 *                          labels: { number, date, phone, customerNumber,
 *                                    colRef, colName, colUnitPrice, colQty, colTotal, items, total,
 *                                    amountInWords?, stamp? } }
 *   A missing amountInWords / stamp label hides that part.
 */
export const buildInvoiceHtml = (invoice, opts) => {
  const { lang = "fr", currency = "", settings = {}, labels = {} } = opts;
  const origin = opts.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const rtl = lang === "ar";
  const items = Array.isArray(invoice.items) ? invoice.items : [];

  const issued = new Date(invoice.issued_at || Date.now());
  const dateStr = Number.isNaN(issued.getTime()) ? "" : issued.toLocaleDateString("fr-FR");
  const totalAmount =
    invoice.total_amount ?? items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  const totalUnits =
    invoice.total_units ?? items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  // "Mille deux cent cinquante dirhams" — empty (line hidden) without a label or past the speller's range
  const totalInWords = labels.amountInWords ? amountInWords(totalAmount, rtl ? "ar" : "fr") : "";

  // Amount + currency label; <bdi> keeps "1 250,00" in one piece inside Arabic text.
  const money = (value) =>
    `<bdi>${formatAmount(value)}</bdi>${currency ? ` <span class="cur">${escapeHtml(currency)}</span>` : ""}`;

  const logoUrl = absoluteUrl(settings.logo_url, origin);
  const storeName = String(settings.store_name ?? "").trim();
  const storeSubtitle = String(settings.store_subtitle ?? "").trim();
  const note = String(settings.thank_you_note ?? "").trim();
  const address = String(settings.store_address ?? "").trim();
  const storePhone = String(settings.store_phone ?? "").trim();

  const customerName = String(invoice.customer_name ?? "").trim();
  const customerPhone = String(invoice.customer_phone ?? "").trim();
  const customerCode = String(invoice.customer_code ?? "").trim();

  // Client card: the name speaks for itself (no heading); phone / client number on the side.
  const clientMeta = [
    customerPhone
      ? `<div class="meta-line"><span class="k">${escapeHtml(labels.phone)}</span><bdi dir="ltr">${escapeHtml(customerPhone)}</bdi></div>`
      : "",
    customerCode
      ? `<div class="meta-line"><span class="k">${escapeHtml(labels.customerNumber)}</span><bdi dir="ltr" class="strong">${escapeHtml(customerCode)}</bdi></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  // Empty address / phone -> that part of the footer is hidden.
  const contact = [
    address ? `<span>${escapeMultiline(address)}</span>` : "",
    storePhone
      ? `<span>${escapeHtml(labels.phone)} <bdi dir="ltr">${escapeHtml(storePhone)}</bdi></span>`
      : "",
  ]
    .filter(Boolean)
    .join('<span class="dot" aria-hidden="true">•</span>');

  const rowsHtml =
    items.length > 0
      ? items
          .map(
            (item) => `
        <tr>
          <td class="ref"><bdi dir="ltr">${formatProductRef(item.product_id)}</bdi></td>
          <td class="name">${isolate(item.productName)}</td>
          <td class="num">${money(item.price)}</td>
          <td class="qty">${Number(item.quantity) || 0}</td>
          <td class="num line-total">${money(item.totalPrice ?? (Number(item.price) || 0) * (Number(item.quantity) || 0))}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td class="empty" colspan="5">—</td></tr>`;

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.invoice_number)}</title>
<style>
  @page { size: A4; margin: 13mm 14mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    font-family: ${rtl ? "Tahoma, 'Segoe UI', Arial, sans-serif" : "'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"};
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a2232;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media screen { body { max-width: 210mm; margin: 0 auto; padding: 14mm; } }
  bdi, .num, .qty { font-variant-numeric: tabular-nums; }
  .k { color: #626b7a; }
  .strong { font-weight: 700; color: ${INVOICE_NAVY}; }
  .cur { font-size: 0.8em; color: #626b7a; }

  /* A. Header: brand on one side, number + date card on the other */
  .head { display: flex; align-items: center; justify-content: space-between; gap: 10mm; }
  .brand { display: flex; align-items: center; gap: 4.5mm; min-width: 0; }
  .logo { width: 24mm; height: 24mm; object-fit: contain; flex-shrink: 0; }
  .store {
    font-size: 20pt; font-weight: 800; letter-spacing: 0.035em; line-height: 1.08;
    color: ${INVOICE_NAVY}; word-break: break-word;
  }
  .sub { margin-top: 1.4mm; font-size: 9.5pt; color: #626b7a; }
  .ref {
    display: flex; flex-shrink: 0; overflow: hidden;
    border: 0.3mm solid #d3d8e0; border-radius: 1.8mm;
  }
  .ref-cell { padding: 2.8mm 4.6mm 3mm; }
  .ref-cell + .ref-cell { border-inline-start: 0.3mm solid #d3d8e0; }
  .ref-number { background: #f3f5f8; }
  .ref dt {
    font-size: 7pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #626b7a;
  }
  .ref dd {
    margin-top: 0.8mm; font-size: 12pt; font-weight: 800; line-height: 1.15;
    color: ${INVOICE_NAVY}; white-space: nowrap;
  }
  /* Two-tone rule: short orange lead-in, then navy across the page (mirrored in RTL) */
  .rule {
    margin-top: 6mm; height: 0.8mm;
    background: linear-gradient(to ${rtl ? "left" : "right"}, ${INVOICE_ACCENT} 0, ${INVOICE_ACCENT} 30mm, ${INVOICE_NAVY} 30mm, ${INVOICE_NAVY} 100%);
  }

  /* Client card */
  .client {
    margin-top: 6mm; padding: 4.2mm 5.5mm;
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2mm 10mm;
    background: #f3f5f8; border-inline-start: 1.3mm solid ${INVOICE_ACCENT};
  }
  .client-name {
    font-size: 15pt; font-weight: 800; line-height: 1.2; color: ${INVOICE_NAVY}; word-break: break-word;
  }
  .client-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.6mm; font-size: 10pt; }
  .meta-line { display: flex; align-items: baseline; gap: 2.5mm; white-space: nowrap; }

  /* B. Items */
  .lines { width: 100%; margin-top: 7mm; border-collapse: collapse; table-layout: fixed; }
  .c-ref { width: 11%; }
  .c-price { width: 19%; }
  .c-qty { width: 9%; }
  .c-total { width: 20%; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .lines th {
    padding: 2.6mm 3mm; background: ${INVOICE_NAVY}; color: #fff;
    font-size: 7.8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; text-align: start;
  }
  .lines td { padding: 2.7mm 3mm; vertical-align: top; border-bottom: 0.2mm solid #e3e7ec; }
  .lines tbody tr:nth-child(even) td { background: #f7f8fa; }
  .lines tbody tr:last-child td { border-bottom: 0.5mm solid ${INVOICE_NAVY}; }
  .lines .num { text-align: end; white-space: nowrap; }
  .lines .qty { text-align: center; white-space: nowrap; font-weight: 600; }
  .lines .ref { font-family: 'Courier New', ui-monospace, monospace; color: #626b7a; }
  .lines .name { overflow-wrap: anywhere; }
  .lines .line-total { font-weight: 700; color: ${INVOICE_NAVY}; }
  .lines .empty { text-align: center; color: #626b7a; }

  /* C. Summary + D. Footer: kept together, and they follow the table (never fixed) */
  .closing { margin-top: 5mm; break-inside: avoid; page-break-inside: avoid; }
  /* At least 95 mm, wider when a long label / big total needs it (never wraps the total) */
  .summary { width: fit-content; min-width: 95mm; max-width: 100%; margin-inline-start: auto; }
  .sum-row {
    display: flex; align-items: baseline; justify-content: space-between; gap: 6mm;
    padding: 2.4mm 5mm; font-size: 10pt; border-bottom: 0.2mm solid #e3e7ec;
  }
  .sum-row strong { font-size: 11.5pt; color: ${INVOICE_NAVY}; }
  .sum-total {
    position: relative; overflow: hidden; margin-top: 3mm;
    display: flex; align-items: center; justify-content: space-between; gap: 8mm;
    padding: 4.2mm 5mm; padding-inline-start: 6.5mm;
    background: ${INVOICE_NAVY}; color: #fff; border-radius: 1.8mm;
  }
  .sum-total::before {
    content: ""; position: absolute; top: 0; bottom: 0; inset-inline-start: 0; width: 1.6mm;
    background: ${INVOICE_ACCENT};
  }
  .sum-total .label {
    font-size: 9.5pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap;
  }
  .sum-total .amount { font-size: 21pt; font-weight: 800; line-height: 1.1; white-space: nowrap; }
  .sum-total .cur { color: #fff; font-size: 0.55em; font-weight: 700; opacity: 0.85; }
  .foot { margin-top: 14mm; text-align: center; }
  .foot hr { border: 0; border-top: 0.3mm solid #d3d8e0; margin-bottom: 4.5mm; }
  .thanks { font-size: 11.5pt; font-weight: 700; color: ${INVOICE_NAVY}; }
  .contact { margin-top: 1.6mm; font-size: 9pt; color: #626b7a; }
  .dot { margin: 0 2.5mm; color: ${INVOICE_ACCENT}; }

  /* Letter spacing breaks Arabic letter joining */
  [dir="rtl"] .store, [dir="rtl"] .ref dt, [dir="rtl"] .lines th,
  [dir="rtl"] .sum-total .label { letter-spacing: 0; }
</style>
</head>
<body>
  <header class="head">
    <div class="brand">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="" onerror="this.style.display='none'" />` : ""}
      <div>
        ${storeName ? `<div class="store">${isolate(storeName)}</div>` : ""}
        ${storeSubtitle ? `<div class="sub">${isolate(storeSubtitle)}</div>` : ""}
      </div>
    </div>
    <dl class="ref">
      <div class="ref-cell ref-number">
        <dt>${escapeHtml(labels.number)}</dt>
        <dd><bdi dir="ltr">${escapeHtml(invoice.invoice_number)}</bdi></dd>
      </div>
      ${
        dateStr
          ? `<div class="ref-cell">
        <dt>${escapeHtml(labels.date)}</dt>
        <dd><bdi dir="ltr">${escapeHtml(dateStr)}</bdi></dd>
      </div>`
          : ""
      }
    </dl>
  </header>
  <div class="rule" aria-hidden="true"></div>

  ${
    customerName || clientMeta
      ? `<section class="client">
    ${customerName ? `<div class="client-name">${isolate(customerName)}</div>` : "<div></div>"}
    ${clientMeta ? `<div class="client-meta">${clientMeta}</div>` : ""}
  </section>`
      : ""
  }

  <table class="lines">
    <colgroup><col class="c-ref" /><col /><col class="c-price" /><col class="c-qty" /><col class="c-total" /></colgroup>
    <thead>
      <tr>
        <th>${escapeHtml(labels.colRef)}</th>
        <th>${escapeHtml(labels.colName)}</th>
        <th class="num">${escapeHtml(labels.colUnitPrice)}</th>
        <th class="qty">${escapeHtml(labels.colQty)}</th>
        <th class="num">${escapeHtml(labels.colTotal)}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}
    </tbody>
  </table>

  <div class="closing">
    <div class="summary">
      <div class="sum-row"><span>${escapeHtml(labels.items)}</span><strong class="num">${totalUnits}</strong></div>
      <div class="sum-total"><span class="label">${escapeHtml(labels.total)}</span><span class="amount">${money(totalAmount)}</span></div>
    </div>
    <footer class="foot">
      <hr />
      ${note ? `<p class="thanks">${escapeMultiline(note)}</p>` : ""}
      ${contact ? `<p class="contact">${contact}</p>` : ""}
    </footer>
  </div>
</body>
</html>`;
};
// ==================== QR labels ====================

export const LABEL_SIZES = {
  small: { width: 40, height: 25, qr: 19, name: 7, id: 9, price: 8 },
  medium: { width: 50, height: 30, qr: 24, name: 8, id: 11, price: 10 },
  large: { width: 70, height: 38, qr: 31, name: 10, id: 13, price: 12 },
};

/**
 * @param {Array} labels - [{ id, name, price, qrDataUrl }] (already expanded by copies)
 * @param {object} opts - { size, layout: 'sheet' | 'roll', showName, showPrice, currency, lang }
 */
export const buildLabelsHtml = (labels, opts) => {
  const {
    size = "medium",
    layout = "sheet",
    showName = true,
    showPrice = true,
    currency = "MAD",
    lang = "fr",
  } = opts;
  const s = LABEL_SIZES[size] || LABEL_SIZES.medium;
  const dir = lang === "ar" ? "rtl" : "ltr";

  // Roll: one label per page, page size = label size (thermal label printers).
  // The last label must not force a page break, otherwise an empty label is fed.
  const pageCss =
    layout === "roll"
      ? `@page { size: ${s.width}mm ${s.height}mm; margin: 0; }
         html, body { width: ${s.width}mm; margin: 0; }
         .sheet { display: block; }
         .label { page-break-after: always; break-after: page; border: 0; }
         .label:last-child { page-break-after: auto; break-after: auto; }`
      : `@page { size: A4; margin: 8mm; }
         .sheet { display: flex; flex-wrap: wrap; gap: 2mm; align-content: flex-start; }
         .label { border: 0.2mm dashed #9ca3af; }`;

  const labelsHtml = labels
    .map(
      (l) => `
    <div class="label">
      <img class="qr" src="${l.qrDataUrl}" alt="QR ${l.id}" />
      <div class="info">
        ${showName ? `<div class="name">${escapeHtml(l.name)}</div>` : ""}
        <div class="id">#${l.id}</div>
        ${showPrice && l.price !== undefined && l.price !== null ? `<div class="price">${formatAmount(l.price)} ${escapeHtml(currency)}</div>` : ""}
      </div>
    </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<title>QR labels</title>
<style>
  ${pageCss}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, Tahoma, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: ${s.width}mm;
    height: ${s.height}mm;
    padding: 1.5mm;
    display: flex;
    align-items: center;
    gap: 1.5mm;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .qr { width: ${s.qr}mm; height: ${s.qr}mm; flex-shrink: 0; image-rendering: pixelated; }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.6mm; }
  .name {
    font-size: ${s.name}pt; font-weight: 600; line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
    word-break: break-word;
  }
  .id { font-size: ${s.id}pt; font-weight: 800; font-family: 'Courier New', monospace; }
  .price { font-size: ${s.price}pt; font-weight: 700; }
</style>
</head>
<body><div class="sheet">${labelsHtml}</div></body>
</html>`;
};
