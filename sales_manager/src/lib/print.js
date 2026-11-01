// Printing helpers for the QR checkout (receipts) and QR labels.
// Printing uses an off-screen iframe so the app page itself is never affected.

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
 * @param {object} ticket - { ticket_number, created_at, payment_method, items[], total_units, total_amount }
 * @param {object} opts - { lang, storeName, storeSubtitle, currency, labels: {...} }
 */
export const buildReceiptHtml = (ticket, opts) => {
  const { lang = "fr", storeName, storeSubtitle, currency, labels } = opts;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const date = new Date(ticket.created_at || Date.now());
  const dateStr = `${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;

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

  const pageCss =
    layout === "roll"
      ? `@page { size: ${s.width}mm ${s.height}mm; margin: 0; }
         body { margin: 0; }
         .sheet { display: block; }
         .label { page-break-after: always; break-after: page; border: 0; }`
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
