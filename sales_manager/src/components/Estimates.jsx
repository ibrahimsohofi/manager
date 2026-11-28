import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Loader2,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  estimateTotals,
  nextEstimateNumber,
  readEstimates,
  writeEstimateLink,
  writeEstimates,
} from "../lib/estimates.js";
import { escapeHtml, formatAmount, printHtml } from "../lib/print.js";
import inventoryService from "../services/inventoryIntegration.js";
import CustomerPicker from "./CustomerPicker.jsx";

// Same keys as QrSale.jsx: "convert to sale" fills the till cart + client, then opens /qr-sale.
const QR_CART_KEY = "salesManager.qrCart";
const QR_CUSTOMER_KEY = "salesManager.qrCustomer";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (date, days) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const toNumber = (value) => Number(value) || 0;
// "2026-11-26" -> "26/11/2026" (same day format as the invoices, in both languages)
const formatDay = (value) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value || "") : date.toLocaleDateString("fr-FR");
};
// Lowercase, no accents: "Électricité" matches "electricite"
const fold = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const emptyDraft = (estimates) => ({
  number: nextEstimateNumber(estimates),
  issueDate: today(),
  validUntil: plusDays(today(), 30),
  customer: null,
  customerText: "",
  notes: "",
  discount: "0",
  tax: "0",
  items: [],
});

const customerName = (estimate) => estimate.customer?.name || estimate.customerText || "";

const matchesQuery = (estimate, query) => {
  if (!query) return true;
  const haystack = [
    estimate.number,
    estimate.customer?.name,
    estimate.customer?.phone,
    estimate.customer?.code,
    estimate.customerText,
    estimate.ticketNumber,
    ...(estimate.items || []).map((item) => item.name),
  ]
    .map(fold)
    .join(" ");
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

const readTillCartCount = () => {
  try {
    const data = JSON.parse(localStorage.getItem(QR_CART_KEY) || "[]");
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
};

// One till line per product (the till keys its lines by product_id).
const tillLinesFrom = (estimate) => {
  const lines = new Map();
  for (const item of estimate.items || []) {
    const id = Number(item.productId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const quantity = toNumber(item.quantity) || 1;
    const existing = lines.get(id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      lines.set(id, {
        product_id: id,
        productName: String(item.name || `#${id}`),
        price: toNumber(item.unitPrice).toFixed(2),
        quantity,
      });
    }
  }
  return [...lines.values()];
};

// Client stored the way QrSale.readCustomer expects it.
const tillCustomerFrom = (estimate) => {
  const text = String(estimate.customerText || "");
  const picked = estimate.customer;
  if (picked && Number.isSafeInteger(Number(picked.id))) {
    return {
      text,
      selected: {
        id: Number(picked.id),
        name: String(picked.name || ""),
        code: picked.code ?? null,
        phone: picked.phone ?? null,
        is_vip: picked.is_vip === true || Number(picked.is_vip) === 1,
      },
      autoOff: true,
    };
  }
  if (text.trim()) return { text: text.trim(), selected: null, autoOff: true };
  // No client on the estimate -> the till keeps its default ("N° auto")
  return { text: "", selected: null, autoOff: false };
};

const buildEstimateHtml = (estimate, { lang, currency, storeName, storeSubtitle, labels }) => {
  const rtl = lang === "ar";
  const totals = estimateTotals(estimate);
  // <bdi> keeps "1 250,00" in one piece inside Arabic text
  const money = (value, sign = "") =>
    `<bdi dir="ltr">${sign}${formatAmount(value)}</bdi> <span class="cur">${escapeHtml(currency)}</span>`;
  const rows = (estimate.items || [])
    .map(
      (item) => `<tr>
    <td>${escapeHtml(item.name)}</td><td class="num"><bdi dir="ltr">${escapeHtml(item.quantity)}</bdi></td>
    <td class="num">${money(item.unitPrice)}</td><td class="num">${money(toNumber(item.quantity) * toNumber(item.unitPrice))}</td>
  </tr>`,
    )
    .join("");
  const customer = estimate.customer || {};
  const name = customerName(estimate) || labels.noCustomer;
  return `<!doctype html><html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"/><title>${escapeHtml(estimate.number)}</title>
  <style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}
    body{font-family:${rtl ? "Tahoma,'Segoe UI',Arial,sans-serif" : "'Segoe UI',Arial,sans-serif"};color:#172235;margin:0;font-size:12px}
    .top{border-top:3px solid #f76b03;padding-top:16px;display:flex;justify-content:space-between;gap:30px}
    .brand{font-size:25px;font-weight:800;color:#07294d}.muted{color:#5f6b7a}.end{text-align:end}
    .title{margin:30px 0 18px;color:#172235;font-size:25px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
    .box{background:#f6f8fa;border:1px solid #e3e8ef;border-inline-start:3px solid #07294d;padding:12px}
    .label{font-size:10px;color:#5f6b7a;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:5px}.value{font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th{background:#f1f4f8;color:#3b4859;text-align:start;padding:9px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;border-top:1px solid #07294d;border-bottom:1px solid #c9d2de}
    td{border-bottom:1px solid #e3e8ef;padding:10px}.num{text-align:end;white-space:nowrap}
    .summary{margin:22px 0 0;margin-inline-start:auto;width:280px}.sum{display:flex;justify-content:space-between;gap:12px;padding:6px 0}
    .total{display:flex;justify-content:space-between;gap:12px;margin-top:6px;border-top:2px solid #07294d;border-bottom:1px solid #07294d;color:#07294d;padding:10px 2px;font-size:16px;font-weight:800}
    .notes{margin-top:22px;padding:12px;background:#f6f8fa;border:1px solid #e3e8ef;border-inline-start:3px solid #f76b03}
    .footer{margin-top:60px;border-top:1px solid #d8dee7;padding-top:12px;color:#667085;display:flex;justify-content:space-between}
    [dir="rtl"] .title,[dir="rtl"] .label,[dir="rtl"] th{letter-spacing:0}
  </style></head><body>
  <div class="top"><div><div class="brand">${escapeHtml(storeName)}</div><div class="muted">${escapeHtml(storeSubtitle)}</div></div>
  <div class="end"><b><bdi dir="ltr">${escapeHtml(estimate.number)}</bdi></b><br/><span class="muted">${escapeHtml(labels.issued).replace("{date}", `<bdi dir="ltr">${escapeHtml(formatDay(estimate.issueDate))}</bdi>`)}</span></div></div>
  <div class="title">${escapeHtml(labels.title)}</div>
  <div class="meta"><div class="box"><div class="label">${escapeHtml(labels.customer)}</div><div class="value">${escapeHtml(name)}</div>${customer.phone ? `<div><bdi dir="ltr">${escapeHtml(customer.phone)}</bdi></div>` : ""}${customer.address ? `<div>${escapeHtml(customer.address)}</div>` : ""}</div>
  <div class="box"><div class="label">${escapeHtml(labels.validity)}</div><div class="value">${escapeHtml(labels.validUntil).replace("{date}", `<bdi dir="ltr">${escapeHtml(formatDay(estimate.validUntil))}</bdi>`)}</div><div class="muted">${escapeHtml(labels.validityNote)}</div></div></div>
  <table><thead><tr><th>${escapeHtml(labels.item)}</th><th class="num">${escapeHtml(labels.qty)}</th><th class="num">${escapeHtml(labels.unitPrice)}</th><th class="num">${escapeHtml(labels.total)}</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="summary"><div class="sum"><span>${escapeHtml(labels.subtotal)}</span><b>${money(totals.subtotal)}</b></div>
  <div class="sum"><span>${escapeHtml(labels.discount)}</span><b>${money(totals.discount, "-")}</b></div>
  <div class="sum"><span>${escapeHtml(labels.vat)}</span><b>${money(totals.tax)}</b></div>
  <div class="total"><span>${escapeHtml(labels.total)}</span><span>${money(totals.total)}</span></div></div>
  ${estimate.notes ? `<div class="notes"><b>${escapeHtml(labels.notes)}</b><br/>${escapeHtml(estimate.notes).replace(/\n/g, "<br/>")}</div>` : ""}
  <div class="footer"><span>${escapeHtml(labels.thanks)}</span><span>${escapeHtml(labels.signature)}</span></div></body></html>`;
};

// Amount + currency. <bdi dir="ltr"> keeps the digits (and the minus sign) together in Arabic.
const Money = ({ value, currency, sign = "" }) => (
  <span className="whitespace-nowrap">
    <bdi dir="ltr" className="tabular-nums">
      {sign}
      {formatAmount(value)}
    </bdi>{" "}
    {currency}
  </span>
);

const inputBase =
  "rounded-md border border-input bg-background px-2 py-1.5 font-normal outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/25";

export default function Estimates() {
  const { t, i18n } = useTranslation();
  const tr = (key, options) => t(`estimates.${key}`, options);
  const navigate = useNavigate();
  const lang = i18n.language === "ar" ? "ar" : "fr";
  const currency = t("currency");

  const [saved, setSaved] = useState(readEstimates);
  const [draft, setDraft] = useState(() => emptyDraft(readEstimates()));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState("");
  const [listQuery, setListQuery] = useState("");
  // Inline confirmation on one saved row: { number, kind: "delete" | "convert" }
  const [pending, setPending] = useState(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState("");

  const totals = useMemo(() => estimateTotals(draft), [draft]);
  const isSaved = saved.some((item) => item.number === draft.number);
  const filtered = useMemo(() => saved.filter((item) => matchesQuery(item, listQuery.trim())), [saved, listQuery]);
  const todayIso = today();

  const update = (key, value) => {
    setNotice("");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const searchProducts = async (value) => {
    setQuery(value);
    if (value.trim().length < 2) return setResults([]);
    setSearching(true);
    setResults(await inventoryService.searchProducts(value, 8));
    setSearching(false);
  };
  const addProduct = (product) => {
    setNotice("");
    setDraft((current) => {
      const existing = current.items.find((item) => String(item.productId) === String(product.id));
      if (existing) {
        return {
          ...current,
          items: current.items.map((item) =>
            item === existing ? { ...item, quantity: toNumber(item.quantity) + 1 } : item,
          ),
        };
      }
      return {
        ...current,
        items: [
          ...current.items,
          {
            productId: product.id,
            name: product.displayName || product.name,
            quantity: 1,
            unitPrice: toNumber(product.price),
          },
        ],
      };
    });
    setQuery("");
    setResults([]);
  };
  const updateItem = (index, key, value) => {
    setNotice("");
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  };
  const removeItem = (index) => {
    setNotice("");
    setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  };

  const persist = (next) => {
    setSaved(next);
    writeEstimates(next);
  };
  const save = () => {
    if (!draft.items.length) return;
    const entry = { ...draft, savedAt: new Date().toISOString() };
    persist([entry, ...saved.filter((item) => item.number !== draft.number)]);
    setNotice(tr("savedNotice", { number: draft.number }));
  };
  const newEstimate = () => {
    setNotice("");
    setDraft(emptyDraft(saved));
  };
  const loadEstimate = (estimate) => {
    setNotice("");
    setPending(null);
    setDraft({ ...estimate, customerText: estimate.customerText || estimate.customer?.name || "" });
  };

  const askFor = (number, kind) => {
    setConvertError("");
    setPending((current) => (current?.number === number && current.kind === kind ? null : { number, kind }));
  };
  const deleteEstimate = (number) => {
    const next = saved.filter((item) => item.number !== number);
    persist(next);
    setPending(null);
    // The estimate open in the editor is gone -> start a fresh one (keeps numbers unique)
    if (draft.number === number) newEstimate();
  };

  const sendToTill = async (estimate) => {
    const lines = tillLinesFrom(estimate);
    if (!lines.length) {
      setConvertError(tr("convert.noLines"));
      return;
    }
    setConverting(true);
    setConvertError("");
    // Fresh stock / catalogue price, so the till flags lines that can't be sold right away.
    const lookups = await Promise.allSettled(lines.map((line) => inventoryService.getProduct(line.product_id, false)));
    setConverting(false);
    const isMissing = (result) => result.status === "rejected" && /HTTP 404/.test(String(result.reason?.message));
    if (lookups.every((result) => result.status === "rejected" && !isMissing(result))) {
      setConvertError(tr("convert.offline"));
      return;
    }
    const cart = lines.map((line, index) => {
      const product = lookups[index].status === "fulfilled" ? lookups[index].value : null;
      const inactive = product && (product.is_active === false || product.is_active === 0);
      const catalogPrice = Number(product?.selling_price ?? product?.price);
      return {
        ...line,
        productName: String(product?.name || line.productName),
        category: product?.category_name || product?.category || "Autre",
        catalogPrice: Number.isFinite(catalogPrice) && catalogPrice > 0 ? catalogPrice : toNumber(line.price),
        stock: !product || inactive ? 0 : toNumber(product.stock_quantity),
      };
    });
    try {
      localStorage.setItem(QR_CART_KEY, JSON.stringify(cart));
      localStorage.setItem(QR_CUSTOMER_KEY, JSON.stringify(tillCustomerFrom(estimate)));
    } catch {
      setConvertError(tr("convert.offline"));
      return;
    }
    writeEstimateLink(estimate.number);
    navigate("/qr-sale");
  };

  const print = (estimate = draft) => {
    const rate = estimateTotals(estimate).taxRate;
    printHtml(
      buildEstimateHtml(estimate, {
        lang,
        currency,
        storeName: t("app.title"),
        storeSubtitle: t("app.subtitle"),
        labels: {
          title: tr("doc.title"),
          issued: tr("doc.issued", { date: "{date}" }),
          customer: tr("doc.customer"),
          validity: tr("doc.validity"),
          validUntil: tr("doc.validUntil", { date: "{date}" }),
          validityNote: tr("doc.validityNote"),
          noCustomer: tr("doc.noCustomer"),
          notes: tr("doc.notes"),
          thanks: tr("doc.thanks"),
          signature: tr("doc.signature"),
          item: tr("table.item"),
          qty: tr("table.qty"),
          unitPrice: tr("table.unitPrice"),
          total: tr("table.total"),
          subtotal: tr("subtotal"),
          discount: tr("discount"),
          vat: tr("vat", { rate: formatAmount(rate) }),
        },
      }),
    );
  };

  // Secondary actions: paper button, orange only as a hover hint (same as Customers).
  const quietButton =
    "inline-flex items-center justify-center gap-2 rounded-md border border-border bg-paper font-semibold text-foreground transition-colors hover:border-brand/50 hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule/70 pb-6">
        <div>
          <p className="eyebrow flex items-center gap-2 text-brand">
            <span className="h-px w-5 bg-brand/60" aria-hidden="true" />
            {tr("eyebrow")}
          </p>
          <h2 className="mt-2 font-display text-[2.4rem] italic leading-none text-foreground sm:text-5xl">
            {t("nav.estimates")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{tr("subtitle")}</p>
        </div>
        <button type="button" onClick={newEstimate} className={`h-11 px-4 text-sm ${quietButton}`}>
          <Plus className="h-4 w-4 text-brand" strokeWidth={2.6} />
          {tr("new")}
        </button>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------ editor */}
        <section className="paper-card min-w-0 p-5">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">{tr("document")}</p>
              <h3 className="figure mt-1 text-xl font-semibold text-foreground">
                <bdi dir="ltr">{draft.number}</bdi>
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="font-medium">
                {tr("issueDate")}
                <input
                  type="date"
                  value={draft.issueDate}
                  onChange={(e) => update("issueDate", e.target.value)}
                  className={`mt-1 block w-full ${inputBase}`}
                />
              </label>
              <label className="font-medium">
                {tr("validUntil")}
                <input
                  type="date"
                  value={draft.validUntil}
                  onChange={(e) => update("validUntil", e.target.value)}
                  className={`mt-1 block w-full ${inputBase}`}
                />
              </label>
            </div>
          </div>

          <div className="mb-5">
            <span className="mb-2 block text-sm font-semibold">{tr("customer")}</span>
            <CustomerPicker
              text={draft.customerText}
              selected={draft.customer}
              onTextChange={(value) => update("customerText", value)}
              onSelect={(customer) => update("customer", customer)}
            />
          </div>

          <div className="relative mb-5">
            <label htmlFor="estimate-product-search" className="mb-2 block text-sm font-semibold">
              {tr("addProduct")}
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                id="estimate-product-search"
                value={query}
                onChange={(e) => searchProducts(e.target.value)}
                placeholder={tr("searchPlaceholder")}
                autoComplete="off"
                className="w-full bg-transparent outline-none"
              />
            </div>
            {query.length > 1 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl">
                {searching ? (
                  <p className="p-3 text-sm text-muted-foreground">{tr("searching")}</p>
                ) : results.length ? (
                  results.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-start text-sm last:border-0 hover:bg-secondary"
                    >
                      <span className="min-w-0">
                        <b>{product.displayName || product.name}</b>
                        <bdi dir="ltr" className="ms-2 text-muted-foreground">
                          #{product.id}
                        </bdi>
                      </span>
                      <span className="shrink-0 font-semibold">
                        <Money value={product.price} currency={currency} />
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">{tr("noProduct")}</p>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/70 text-[0.7rem] uppercase tracking-wider text-muted-foreground rtl:text-xs rtl:tracking-normal">
                <tr>
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("table.item")}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{tr("table.qty")}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{tr("table.unitPrice")}</th>
                  <th className="px-3 py-2.5 text-end font-semibold">{tr("table.total")}</th>
                  <th className="px-3 py-2.5">
                    <span className="sr-only">{tr("table.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((item, index) => (
                  <tr
                    key={`${item.productId}-${index}`}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        min="1"
                        dir="ltr"
                        aria-label={`${tr("table.qty")} — ${item.name}`}
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", e.target.value)}
                        className={`w-20 text-end ${inputBase} py-1`}
                      />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        dir="ltr"
                        aria-label={`${tr("table.unitPrice")} — ${item.name}`}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                        className={`w-28 text-end ${inputBase} py-1`}
                      />
                    </td>
                    <td className="px-3 py-2 text-end font-semibold text-foreground">
                      <Money value={toNumber(item.quantity) * toNumber(item.unitPrice)} currency={currency} />
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-loss-soft hover:text-destructive"
                        aria-label={tr("removeLine")}
                        title={tr("removeLine")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!draft.items.length && <p className="p-8 text-center text-sm text-muted-foreground">{tr("empty")}</p>}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_180px_180px]">
            <label className="text-sm font-semibold">
              {tr("notes")}
              <textarea
                value={draft.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows="4"
                placeholder={tr("notesPlaceholder")}
                className={`mt-1 w-full p-2 ${inputBase}`}
              />
            </label>
            <label className="text-sm font-semibold">
              {tr("discountField", { currency })}
              <input
                type="number"
                min="0"
                dir="ltr"
                value={draft.discount}
                onChange={(e) => update("discount", e.target.value)}
                className={`mt-1 w-full p-2 text-end ${inputBase}`}
              />
            </label>
            <label className="text-sm font-semibold">
              {tr("vatField")}
              <input
                type="number"
                min="0"
                dir="ltr"
                value={draft.tax}
                onChange={(e) => update("tax", e.target.value)}
                className={`mt-1 w-full p-2 text-end ${inputBase}`}
              />
            </label>
          </div>
        </section>

        {/* ------------------------------------------------ side */}
        <aside className="min-w-0 space-y-4">
          <div className="paper-card p-5">
            <p className="eyebrow">{tr("summary")}</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{tr("subtotal")}</span>
                <b className="text-foreground">
                  <Money value={totals.subtotal} currency={currency} />
                </b>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{tr("discount")}</span>
                <b className="text-foreground">
                  <Money value={totals.discount} currency={currency} sign="-" />
                </b>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{tr("vat", { rate: formatAmount(totals.taxRate) })}</span>
                <b className="text-foreground">
                  <Money value={totals.tax} currency={currency} />
                </b>
              </div>
              {/* Ledger-style total: double rule instead of a solid block */}
              <div className="flex items-baseline justify-between gap-3 border-y-[3px] border-double border-foreground/70 px-0.5 py-3 text-foreground">
                <span className="text-base font-semibold">{tr("total")}</span>
                <span className="figure text-xl font-semibold">
                  <Money value={totals.total} currency={currency} />
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!draft.items.length}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 font-semibold text-brand-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.18)] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {isSaved ? tr("update") : tr("save")}
              </button>
              <button
                type="button"
                onClick={() => print()}
                disabled={!draft.items.length}
                className={`px-4 py-2.5 ${quietButton}`}
              >
                <Printer className="h-4 w-4 text-muted-foreground" />
                {tr("print")}
              </button>
              {notice && (
                <p role="status" className="text-center text-xs font-medium text-gain">
                  {notice}
                </p>
              )}
            </div>
          </div>

          <div className="paper-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">{tr("list.title")}</p>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                {saved.length > 0 && (
                  <bdi dir="ltr" className="tabular-nums">
                    {listQuery.trim()
                      ? tr("list.results", { count: filtered.length, total: saved.length })
                      : saved.length}
                  </bdi>
                )}
                <CalendarDays className="h-4 w-4" />
              </span>
            </div>

            {saved.length > 0 && (
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={listQuery}
                  onChange={(e) => {
                    setListQuery(e.target.value);
                    setPending(null);
                  }}
                  placeholder={tr("list.search")}
                  aria-label={tr("list.searchLabel")}
                  className={`w-full py-2 pe-8 ps-9 text-sm ${inputBase} [&::-webkit-search-cancel-button]:hidden`}
                />
                {listQuery && (
                  <button
                    type="button"
                    onClick={() => setListQuery("")}
                    aria-label={tr("list.clearSearch")}
                    className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <ul className="-me-2 mt-3 max-h-[32rem] space-y-2 overflow-y-auto pe-2">
              {!saved.length && <li className="text-sm text-muted-foreground">{tr("list.empty")}</li>}
              {saved.length > 0 && !filtered.length && (
                <li className="text-sm text-muted-foreground">{tr("list.noMatch", { query: listQuery.trim() })}</li>
              )}
              {filtered.map((estimate) => {
                const sums = estimateTotals(estimate);
                const sold = Boolean(estimate.convertedAt);
                const expired = !sold && estimate.validUntil && estimate.validUntil < todayIso;
                const editing = estimate.number === draft.number;
                const confirming = pending?.number === estimate.number ? pending.kind : null;
                const tillCount = confirming === "convert" ? readTillCartCount() : 0;
                return (
                  <li
                    key={estimate.number}
                    className={`rounded-lg border p-2.5 text-sm transition-colors ${
                      editing ? "border-foreground/30 bg-secondary/70" : "border-border hover:border-rule hover:bg-muted/30"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadEstimate(estimate)}
                      aria-label={tr("list.open", { number: estimate.number })}
                      className="block w-full min-w-0 text-start"
                    >
                      <span className="flex flex-wrap items-center gap-1.5">
                        <b className="figure truncate text-foreground">
                          <bdi dir="ltr">{estimate.number}</bdi>
                        </b>
                        {editing && (
                          <span className="rounded-full bg-foreground px-1.5 py-px text-[0.65rem] font-semibold text-background">
                            {tr("list.editing")}
                          </span>
                        )}
                        {sold && (
                          <span className="rounded-full bg-gain-soft px-1.5 py-px text-[0.65rem] font-semibold text-gain">
                            {estimate.ticketNumber ? (
                              <>
                                {tr("list.soldNoTicket")} · <bdi dir="ltr">{estimate.ticketNumber}</bdi>
                              </>
                            ) : (
                              tr("list.soldNoTicket")
                            )}
                          </span>
                        )}
                        {expired && (
                          <span className="rounded-full bg-due-soft px-1.5 py-px text-[0.65rem] font-semibold text-due">
                            {tr("list.expired")}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {customerName(estimate) || tr("list.noCustomer")}
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-xs">
                        <bdi dir="ltr" className="text-muted-foreground">
                          {formatDay(estimate.issueDate)}
                        </bdi>
                        <b className="text-foreground">
                          <Money value={sums.total} currency={currency} />
                        </b>
                      </span>
                    </button>

                    {!confirming && (
                      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
                        <button
                          type="button"
                          onClick={() => askFor(estimate.number, "convert")}
                          className={`flex-1 px-2 py-1.5 text-xs ${quietButton}`}
                        >
                          <ShoppingCart className="h-3.5 w-3.5 text-brand" />
                          {tr("list.convert")}
                        </button>
                        <button
                          type="button"
                          onClick={() => print(estimate)}
                          aria-label={tr("list.print")}
                          title={tr("list.print")}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => askFor(estimate.number, "delete")}
                          aria-label={tr("list.delete")}
                          title={tr("list.delete")}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-loss-soft hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}

                    {confirming === "delete" && (
                      <div role="alert" className="mt-2 rounded-md border border-destructive/30 bg-loss-soft p-2.5">
                        <p className="font-semibold text-destructive">
                          {tr("confirmDelete.title", { number: estimate.number })}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{tr("confirmDelete.text")}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => deleteEstimate(estimate.number)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-destructive px-2 py-1.5 text-xs font-semibold text-destructive-foreground hover:brightness-110"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {tr("confirmDelete.confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPending(null)}
                            className="flex-1 rounded-md border border-border bg-paper px-2 py-1.5 text-xs font-semibold hover:bg-secondary"
                          >
                            {tr("confirmDelete.cancel")}
                          </button>
                        </div>
                      </div>
                    )}

                    {confirming === "convert" && (
                      <div className="mt-2 rounded-md border border-rule bg-secondary/60 p-2.5">
                        <p className="font-semibold text-foreground">{tr("convert.title", { number: estimate.number })}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{tr("convert.text")}</p>
                        <ul className="mt-2 space-y-1 text-xs">
                          {sold && (
                            <li className="flex gap-1.5 text-due">
                              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                              {estimate.ticketNumber
                                ? tr("convert.alreadySold", { ticket: estimate.ticketNumber })
                                : tr("convert.alreadySoldNoTicket")}
                            </li>
                          )}
                          {tillCount > 0 && (
                            <li className="flex gap-1.5 text-due">
                              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                              {tr("convert.replaceCart", { count: tillCount })}
                            </li>
                          )}
                          {(sums.discount > 0 || sums.tax > 0) && (
                            <li className="flex gap-1.5 text-muted-foreground">
                              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                              {tr("convert.noDiscount")}
                            </li>
                          )}
                        </ul>
                        {convertError && (
                          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
                            {convertError}
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => sendToTill(estimate)}
                            disabled={converting}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand px-2 py-1.5 text-xs font-semibold text-brand-foreground hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                          >
                            {converting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShoppingCart className="h-3.5 w-3.5" />
                            )}
                            {converting ? tr("convert.checking") : tr("convert.confirm")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPending(null)}
                            disabled={converting}
                            className="flex-1 rounded-md border border-border bg-paper px-2 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                          >
                            {tr("convert.cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
