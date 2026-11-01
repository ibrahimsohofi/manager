import {
  AlertTriangle,
  CheckCircle2,
  History,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  QrCode,
  Receipt,
  RotateCcw,
  ScanLine,
  Trash2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  PRODUCTS_MANAGER_API,
  SALES_MANAGER_API,
  buildUrl,
} from "../config/integration.js";
import { buildReceiptHtml, formatAmount, printHtml } from "../lib/print.js";
import { parseScannedProductId, playScanBeep } from "../lib/qr.js";
import QrScanner from "./QrScanner.jsx";

const CART_KEY = "salesManager.qrCart";
const PAYMENT_KEY = "salesManager.qrPayment";
const MAX_RECENT_SCANS = 8;
const LOOKUP_TIMEOUT_MS = 8000;
const CHECKOUT_TIMEOUT_MS = 45000;

const PAYMENT_METHODS = [
  { value: "cash", key: "cash" },
  { value: "credit", key: "credit" },
  { value: "check", key: "check" },
  { value: "bank_transfer", key: "transfer" },
];

class ScanError extends Error {}

// ---------- helpers ----------

const normalizeLine = (item) => ({
  product_id: Number(item.product_id),
  productName: String(item.productName || `#${item.product_id}`),
  category: item.category || "Autre",
  price: String(item.price ?? ""),
  catalogPrice: Number(item.catalogPrice ?? item.price) || 0,
  quantity: item.quantity ?? 1,
  stock: Number(item.stock) || 0,
});

const readCart = () => {
  try {
    const data = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item) =>
          item &&
          Number.isSafeInteger(Number(item.product_id)) &&
          Number(item.product_id) > 0,
      )
      .map(normalizeLine);
  } catch {
    return [];
  }
};

const readPayment = () => {
  const saved = localStorage.getItem(PAYMENT_KEY);
  return PAYMENT_METHODS.some((m) => m.value === saved) ? saved : "cash";
};

const getLineIssues = (line) => {
  const quantity = Number(line.quantity);
  const price = Number(line.price);
  return {
    badQuantity:
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > Number(line.stock),
    badPrice: !Number.isFinite(price) || price <= 0,
  };
};

const fetchJson = async (url, options = {}, timeout = LOOKUP_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
};

const formatTime = (date) =>
  date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatDateTime = (value) => {
  const date = new Date(value || Date.now());
  return `${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

const sumItems = (items) =>
  items.reduce(
    (acc, item) => {
      acc.units += Number(item.quantity) || 0;
      acc.amount +=
        Number(item.totalPrice) ||
        (Number(item.price) || 0) * (Number(item.quantity) || 0);
      return acc;
    },
    { units: 0, amount: 0 },
  );

const card =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800";

// ---------- component ----------

export default function QrSale() {
  const { t, i18n } = useTranslation();
  const tr = useCallback((key, options) => t(`qrSale.${key}`, options), [t]);

  const [initialCart] = useState(readCart);
  const [cart, setCart] = useState(initialCart);
  const cartRef = useRef(initialCart);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(() =>
    initialCart.length > 0
      ? {
          tone: "info",
          text: t("qrSale.restored", { count: initialCart.length }),
        }
      : null,
  );
  const [flash, setFlash] = useState({ key: 0, status: "ok" });
  const [highlight, setHighlight] = useState({ id: null, key: 0 });
  const [recentScans, setRecentScans] = useState([]);
  const [payment, setPayment] = useState(readPayment);
  const [notes, setNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState(null);
  const [partial, setPartial] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const inputRef = useRef(null);
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const lockedRef = useRef(false);
  const scanIdRef = useRef(0);
  lockedRef.current = submitting || Boolean(receipt);

  const commitCart = useCallback((updater) => {
    const next =
      typeof updater === "function" ? updater(cartRef.current) : updater;
    cartRef.current = next;
    setCart(next);
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(PAYMENT_KEY, payment);
  }, [payment]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // ---------- scanning ----------

  const pushFeedback = useCallback((ok, text, raw) => {
    setMessage({ text, tone: ok ? "ok" : "error" });
    setFlash((previous) => ({
      key: previous.key + 1,
      status: ok ? "ok" : "error",
    }));
    playScanBeep(ok ? "success" : "error");
    scanIdRef.current += 1;
    const entry = {
      id: scanIdRef.current,
      ok,
      text,
      code: String(raw ?? "")
        .split(/\r?\n/)[0]
        .slice(0, 32),
      at: new Date(),
    };
    setRecentScans((previous) =>
      [entry, ...previous].slice(0, MAX_RECENT_SCANS),
    );
  }, []);

  const processScan = useCallback(
    async (raw) => {
      const id = parseScannedProductId(raw);
      if (!Number.isSafeInteger(id) || id <= 0) {
        pushFeedback(false, tr("invalidCode"), raw);
        return;
      }

      try {
        // Fresh lookup on every scan: never trust a price or stock embedded in the QR payload.
        const { response, data } = await fetchJson(
          buildUrl(
            PRODUCTS_MANAGER_API.BASE_URL,
            PRODUCTS_MANAGER_API.INTEGRATION.PRODUCT(id),
          ),
        );
        if (response.status === 404) throw new ScanError(tr("notFound", { id }));
        if (!response.ok) throw new ScanError(tr("inventoryUnavailable"));

        const product = data?.product;
        if (!data?.success || !product || Number(product.id) !== id) {
          throw new ScanError(tr("notFound", { id }));
        }

        const name = String(product.name || `#${id}`);
        const stock = Number(product.stock_quantity ?? product.remaining_stock ?? 0);
        const inactive = product.is_active === false || product.is_active === 0;
        if (inactive || !Number.isFinite(stock) || stock <= 0) {
          throw new ScanError(tr("outOfStock", { name }));
        }

        const existing = cartRef.current.find((line) => line.product_id === id);
        const nextQuantity = (Number.parseInt(existing?.quantity, 10) || 0) + 1;
        if (nextQuantity > stock) {
          throw new ScanError(tr("insufficientStock", { name, stock }));
        }

        const catalogPrice = Number(product.selling_price ?? product.price);
        if (!Number.isFinite(catalogPrice) || catalogPrice <= 0) {
          throw new ScanError(tr("invalidPrice", { name }));
        }

        commitCart((previous) =>
          existing
            ? previous.map((line) =>
                line.product_id === id
                  ? { ...line, quantity: nextQuantity, stock, catalogPrice, productName: name }
                  : line,
              )
            : [
                ...previous,
                {
                  product_id: id,
                  productName: name,
                  category: product.category_name || product.category || "Autre",
                  price: catalogPrice.toFixed(2),
                  catalogPrice,
                  quantity: 1,
                  stock,
                },
              ],
        );
        setHighlight((previous) => ({ id, key: previous.key + 1 }));
        setCheckoutError(null);
        pushFeedback(
          true,
          existing
            ? tr("incremented", { name, quantity: nextQuantity })
            : tr("addedOne", { name }),
          raw,
        );
      } catch (error) {
        pushFeedback(
          false,
          error instanceof ScanError ? error.message : tr("inventoryUnavailable"),
          raw,
        );
      }
    },
    [commitCart, pushFeedback, tr],
  );

  // Scans are queued so fast USB scanners never lose a code while a lookup is running.
  const enqueueScan = useCallback(
    (raw) => {
      if (lockedRef.current) return;
      const value = String(raw ?? "").trim();
      if (!value) return;
      queueRef.current.push(value);
      if (processingRef.current) return;

      processingRef.current = true;
      setLoading(true);
      (async () => {
        while (queueRef.current.length > 0) {
          await processScan(queueRef.current.shift());
        }
        processingRef.current = false;
        setLoading(false);
      })();
    },
    [processScan],
  );

  const handleManualSubmit = (event) => {
    event.preventDefault();
    enqueueScan(code);
    setCode("");
    inputRef.current?.focus();
  };

  // ---------- cart editing ----------

  const updateLine = (id, patch) => {
    commitCart((previous) =>
      previous.map((line) => (line.product_id === id ? { ...line, ...patch } : line)),
    );
    setCheckoutError(null);
  };

  const stepQuantity = (line, delta) => {
    const current = Number.parseInt(line.quantity, 10) || 0;
    const max = Math.max(Number(line.stock) || 0, 1);
    updateLine(line.product_id, {
      quantity: Math.min(Math.max(current + delta, 1), max),
    });
  };

  const removeLine = (id) => {
    commitCart((previous) => previous.filter((line) => line.product_id !== id));
    setCheckoutError(null);
  };

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    commitCart([]);
    setConfirmClear(false);
    setCheckoutError(null);
    setMessage(null);
  };

  const totals = useMemo(
    () =>
      cart.reduce(
        (acc, line) => {
          const quantity = Number.parseInt(line.quantity, 10) || 0;
          acc.units += quantity;
          acc.amount += (Number(line.price) || 0) * quantity;
          return acc;
        },
        { units: 0, amount: 0 },
      ),
    [cart],
  );

  const valid =
    cart.length > 0 &&
    cart.every((line) => {
      const issues = getLineIssues(line);
      return !issues.badQuantity && !issues.badPrice;
    });

  // ---------- checkout ----------

  const checkout = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setCheckoutError(null);
    setPartial(null);
    setMessage(null);
    const snapshot = cartRef.current;
    const nameById = new Map(snapshot.map((line) => [line.product_id, line.productName]));

    try {
      const { response, data } = await fetchJson(
        buildUrl(SALES_MANAGER_API.BASE_URL, `${SALES_MANAGER_API.SALES}/checkout`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: snapshot.map((line) => ({
              product_id: line.product_id,
              productName: line.productName,
              category: line.category,
              price: Number(line.price),
              quantity: Number(line.quantity),
            })),
            payment_method: payment,
            notes: notes.trim(),
          }),
        },
        CHECKOUT_TIMEOUT_MS,
      );

      if (response.ok && data.success) {
        setReceipt({ ...data, notes: notes.trim() });
        commitCart([]);
        setNotes("");
        playScanBeep("success");
        return;
      }

      playScanBeep("error");

      if (response.status === 207) {
        // Only remove confirmed lines. Never auto-retry: the failed line may have touched stock.
        const doneIds = new Set(
          (data.processed_indexes || []).map((index) => snapshot[index]?.product_id),
        );
        commitCart((previous) => previous.filter((line) => !doneIds.has(line.product_id)));
        setPartial({
          ticket_number: data.ticket_number,
          error: data.error,
          items: data.processed_items || [],
          created_at: new Date().toISOString(),
          payment_method: payment,
        });
        return;
      }

      if (response.status === 409) {
        const details = Array.isArray(data.details) ? data.details : [];
        const byId = new Map(details.map((d) => [Number(d.product_id), d]));
        // Reflect the real stock so the affected lines turn red.
        commitCart((previous) =>
          previous.map((line) => {
            const detail = byId.get(line.product_id);
            if (!detail) return line;
            return {
              ...line,
              stock: detail.error === "Product not found" ? 0 : Number(detail.available) || 0,
            };
          }),
        );
        setCheckoutError({
          kind: "stock",
          title: tr("stockChanged"),
          lines: details.map((d) => {
            const name = nameById.get(Number(d.product_id)) || d.product_name || `#${d.product_id}`;
            return d.error === "Product not found"
              ? tr("productMissing", { name })
              : tr("stockLine", { name, requested: d.requested, available: d.available });
          }),
        });
        return;
      }

      if (response.status === 503) {
        setCheckoutError({
          kind: "offline",
          title: tr("inventoryOffline"),
          lines: data.details ? [String(data.details)] : [],
        });
        return;
      }

      if (response.status === 400) {
        setCheckoutError({
          kind: "error",
          title: tr("invalidCart"),
          lines: (Array.isArray(data.details) ? data.details : []).map(
            (d) => `${snapshot[d.index]?.productName || `#${d.index + 1}`}: ${d.error}`,
          ),
        });
        return;
      }

      setCheckoutError({
        kind: "error",
        title: tr("checkoutFailed"),
        lines: data.error ? [String(data.error)] : [],
      });
    } catch {
      // The connection may drop after the server committed the ticket: never auto-retry.
      playScanBeep("error");
      setCheckoutError({ kind: "unknown", title: tr("checkoutUnknown"), lines: [] });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- printing ----------

  const paymentLabel = (method) =>
    tr(PAYMENT_METHODS.find((m) => m.value === method)?.key || "cash");

  const printReceipt = (ticket) => {
    const items = ticket.items || [];
    const sums = sumItems(items);
    printHtml(
      buildReceiptHtml(
        {
          ...ticket,
          items,
          total_units: ticket.total_units ?? sums.units,
          total_amount: ticket.total_amount ?? sums.amount,
        },
        {
          lang: i18n.language === "ar" ? "ar" : "fr",
          storeName: t("app.title"),
          storeSubtitle: t("app.subtitle"),
          currency: t("currency"),
          labels: {
            ticket: tr("receipt.ticket"),
            date: tr("receipt.date"),
            payment: tr("receipt.payment"),
            paymentMethod: paymentLabel(ticket.payment_method),
            items: tr("receipt.items"),
            total: tr("receipt.total"),
            thanks: tr("receipt.thanks"),
            footer: tr("receipt.footer"),
          },
        },
      ),
    );
  };

  const startNewSale = () => {
    setReceipt(null);
    setPartial(null);
    setMessage(null);
    setRecentScans([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ---------- render ----------

  const messageTone = {
    ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    error: "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200",
    info: "bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  };

  return (
    <section className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            {tr("eyebrow")}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">{tr("title")}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tr("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Link
            to="/qr-labels"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-emerald-400"
          >
            <QrCode className="h-4 w-4" />
            {t("nav.qrLabels")}
          </Link>
          <Link
            to="/sales-list"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-emerald-400"
          >
            <History className="h-4 w-4" />
            {t("nav.salesHistory")}
          </Link>
        </div>
      </div>

      {receipt ? (
        /* ---------- Success screen ---------- */
        <div className={`${card} mx-auto max-w-2xl overflow-hidden animate-scale-in`}>
          <div className="border-b border-emerald-100 bg-emerald-50 px-8 py-7 text-center dark:border-emerald-900 dark:bg-emerald-950/40">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600 dark:text-emerald-400" />
            <h3 className="mt-3 text-2xl font-bold">{tr("complete")}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{tr("completeHint")}</p>
          </div>
          <div className="space-y-5 px-6 py-6 sm:px-8">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
                <dt className="text-xs uppercase tracking-wide text-gray-500">{tr("ticket")}</dt>
                <dd className="mt-1 break-all font-mono font-bold">{receipt.ticket_number}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
                <dt className="text-xs uppercase tracking-wide text-gray-500">{tr("date")}</dt>
                <dd className="mt-1 font-semibold tabular-nums">{formatDateTime(receipt.created_at)}</dd>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/50">
                <dt className="text-xs uppercase tracking-wide text-gray-500">{tr("payment")}</dt>
                <dd className="mt-1 font-semibold">{paymentLabel(receipt.payment_method)}</dd>
              </div>
            </dl>

            <ul className="divide-y divide-dashed divide-gray-200 rounded-xl border border-gray-100 dark:divide-gray-700 dark:border-gray-700">
              {(receipt.items || []).map((item) => (
                <li key={item.sale_number || item.index} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.productName}</p>
                    <p className="text-xs text-gray-500 tabular-nums">
                      {item.quantity} x {formatAmount(item.price)} · #{item.product_id}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatAmount(item.totalPrice)}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-end justify-between gap-4 border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-sm text-gray-500">
                {receipt.items?.length || 0} {tr("lines").toLowerCase()} · {receipt.total_units} {tr("units").toLowerCase()}
              </p>
              <p className="text-3xl font-bold tabular-nums">
                {formatAmount(receipt.total_amount)}{" "}
                <span className="text-base font-semibold text-gray-500">{t("currency")}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => printReceipt(receipt)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                <Printer className="h-5 w-5" />
                {tr("printReceipt")}
              </button>
              <button
                type="button"
                onClick={startNewSale}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white shadow-sm hover:bg-emerald-800"
              >
                <ScanLine className="h-5 w-5" />
                {tr("newSale")}
              </button>
            </div>
            <Link
              to="/sales-list"
              className="block text-center text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {tr("viewHistory")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.6fr)]">
          {/* ---------- Left: scanner ---------- */}
          <div className="space-y-5">
            <div className={`${card} p-5`}>
              <div className="mb-4 flex items-center gap-2 font-bold">
                <ScanLine className="h-5 w-5 text-emerald-600" />
                {tr("scanTitle")}
              </div>
              <QrScanner onScan={enqueueScan} flashKey={flash.key} flashStatus={flash.status} />

              <form className="mt-5" onSubmit={handleManualSubmit}>
                <label htmlFor="qr-code-input" className="mb-2 block text-sm font-medium">
                  {tr("manualLabel")}
                </label>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    id="qr-code-input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder={tr("manualPlaceholder")}
                    autoComplete="off"
                    autoFocus
                    disabled={submitting}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-900"
                  />
                  <button
                    type="submit"
                    disabled={!code.trim() || submitting}
                    className="inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {tr("add")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{tr("manualHint")}</p>
              </form>

              <div className="mt-4 min-h-[3rem]" aria-live="polite">
                {loading ? (
                  <p className="flex items-center gap-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    {tr("lookingUp")}
                  </p>
                ) : (
                  message && (
                    <output className={`block rounded-lg p-3 text-sm ${messageTone[message.tone] || messageTone.info}`}>
                      {message.text}
                    </output>
                  )
                )}
              </div>
            </div>

            {/* Recent scans */}
            <div className={`${card} p-5`}>
              <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                <History className="h-4 w-4 text-gray-400" />
                {tr("recentScans")}
              </div>
              {recentScans.length === 0 ? (
                <p className="py-3 text-sm text-gray-500 dark:text-gray-400">{tr("noScans")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {recentScans.map((scan) => (
                    <li key={scan.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900/50">
                      {scan.ok ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{scan.text}</p>
                        <p className="truncate font-mono text-xs text-gray-400">{scan.code}</p>
                      </div>
                      <time className="shrink-0 font-mono text-xs text-gray-400 tabular-nums">{formatTime(scan.at)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* ---------- Right: cart + checkout ---------- */}
          <div className="space-y-5">
            {partial && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-bold">{tr("partialTitle")}</p>
                    <p className="text-sm">{tr("partialBody", { ticket: partial.ticket_number })}</p>
                    {partial.items.length > 0 && (
                      <ul className="list-inside list-disc text-sm">
                        {partial.items.map((item) => (
                          <li key={item.sale_number || item.index}>
                            {item.productName} — {item.quantity} x {formatAmount(item.price)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {partial.error && (
                      <p className="rounded-lg bg-white/60 p-2 font-mono text-xs dark:bg-black/20">{partial.error}</p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {partial.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => printReceipt(partial)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                        >
                          <Printer className="h-4 w-4" />
                          {tr("printPartial")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPartial(null)}
                        className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40"
                      >
                        {tr("dismiss")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`${card} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
                <h3 className="flex items-center gap-2 text-lg font-bold">
                  <Receipt className="h-5 w-5 text-gray-400" />
                  {tr("cart")}
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                    {cart.length}
                  </span>
                </h3>
                {cart.length > 0 && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleClear}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      confirmClear
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "text-gray-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                    {confirmClear ? tr("confirmClear") : tr("clear")}
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <PackageSearch className="mx-auto mb-3 h-11 w-11 text-gray-300 dark:text-gray-600" />
                  <p className="font-medium">{tr("empty")}</p>
                  <p className="mt-1 text-sm text-gray-500">{tr("emptyHint")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[660px] text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                      <tr>
                        <th className="px-5 py-3 text-start">{tr("product")}</th>
                        <th className="px-3 py-3 text-start">{tr("price")}</th>
                        <th className="px-3 py-3 text-start">{tr("quantity")}</th>
                        <th className="px-3 py-3 text-end">{tr("subtotal")}</th>
                        <th className="px-4 py-3">
                          <span className="sr-only">{tr("remove")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {cart.map((line) => {
                        const { badQuantity, badPrice } = getLineIssues(line);
                        const quantity = Number.parseInt(line.quantity, 10) || 0;
                        const priceChanged =
                          !badPrice && line.catalogPrice > 0 && Math.abs(Number(line.price) - line.catalogPrice) >= 0.005;
                        const flashing = highlight.id === line.product_id;
                        return (
                          <tr
                            key={flashing ? `${line.product_id}-${highlight.key}` : line.product_id}
                            className={`align-top ${flashing ? "qr-row-flash" : ""}`}
                          >
                            <td className="px-5 py-4">
                              <span className="font-semibold">{line.productName}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                #{line.product_id} · {line.category}
                              </span>
                              <span
                                className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                  Number(line.stock) <= 0
                                    ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                }`}
                              >
                                {tr("available")}: {line.stock}
                              </span>
                            </td>
                            <td className="px-3 py-4">
                              <input
                                aria-label={`${tr("price")} ${line.productName}`}
                                type="number"
                                inputMode="decimal"
                                min="0.01"
                                step="0.01"
                                value={line.price}
                                disabled={submitting}
                                onChange={(e) => updateLine(line.product_id, { price: e.target.value })}
                                className={`w-28 rounded-lg border bg-transparent px-2 py-2 tabular-nums outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                  badPrice
                                    ? "border-red-500"
                                    : priceChanged
                                      ? "border-amber-400"
                                      : "border-gray-300 dark:border-gray-600"
                                }`}
                              />
                              {badPrice && <span className="mt-1 block text-xs text-red-600">{tr("invalidLinePrice")}</span>}
                              {priceChanged && (
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => updateLine(line.product_id, { price: line.catalogPrice.toFixed(2) })}
                                  title={tr("resetPrice")}
                                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  {tr("catalogPrice", { price: formatAmount(line.catalogPrice) })}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-4">
                              <div
                                className={`inline-flex items-stretch overflow-hidden rounded-lg border ${
                                  badQuantity ? "border-red-500" : "border-gray-300 dark:border-gray-600"
                                }`}
                              >
                                <button
                                  type="button"
                                  aria-label={`${tr("decrease")} ${line.productName}`}
                                  disabled={submitting || quantity <= 1}
                                  onClick={() => stepQuantity(line, -1)}
                                  className="px-2.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <input
                                  aria-label={`${tr("quantity")} ${line.productName}`}
                                  type="number"
                                  inputMode="numeric"
                                  min="1"
                                  max={line.stock}
                                  step="1"
                                  value={line.quantity}
                                  disabled={submitting}
                                  onChange={(e) => updateLine(line.product_id, { quantity: e.target.value })}
                                  className="w-14 border-x border-gray-200 bg-transparent py-2 text-center tabular-nums outline-none dark:border-gray-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  aria-label={`${tr("increase")} ${line.productName}`}
                                  disabled={submitting || quantity >= Number(line.stock)}
                                  onClick={() => stepQuantity(line, 1)}
                                  className="px-2.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              {badQuantity && (
                                <span className="mt-1 block text-xs text-red-600">
                                  {tr("invalidQuantity", { stock: line.stock })}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-4 text-end font-semibold tabular-nums">
                              {formatAmount((Number(line.price) || 0) * quantity)}
                            </td>
                            <td className="px-4 py-4 text-end">
                              <button
                                type="button"
                                disabled={submitting}
                                aria-label={`${tr("remove")} ${line.productName}`}
                                title={tr("remove")}
                                onClick={() => removeLine(line.product_id)}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Checkout */}
            <div className={`${card} p-5`}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  {tr("payment")}
                  <select
                    value={payment}
                    disabled={submitting}
                    onChange={(e) => setPayment(e.target.value)}
                    className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2.5 dark:border-gray-600 dark:bg-gray-900"
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {tr(method.key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  {tr("notes")}
                  <input
                    value={notes}
                    maxLength={200}
                    disabled={submitting}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={tr("notesPlaceholder")}
                    className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-2.5 dark:border-gray-600 dark:bg-gray-900"
                  />
                </label>
              </div>

              <div className="mt-6 grid gap-4 border-t border-gray-100 pt-5 dark:border-gray-700 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{tr("lines")}</p>
                  <p className="text-xl font-bold tabular-nums">{cart.length}</p>
                </div>
                <div className="sm:ps-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{tr("units")}</p>
                  <p className="text-xl font-bold tabular-nums">{totals.units}</p>
                </div>
                <div className="sm:text-end">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">{tr("total")}</p>
                  <p className="text-3xl font-bold tabular-nums">
                    {formatAmount(totals.amount)}{" "}
                    <span className="text-base font-semibold text-gray-500">{t("currency")}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={checkout}
                  disabled={!valid || submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3.5 font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {submitting ? tr("saving") : tr("checkout")}
                </button>
              </div>

              {!valid && cart.length > 0 && !checkoutError && (
                <p className="mt-3 text-sm text-red-600">{tr("fixLines")}</p>
              )}

              {checkoutError && (
                <div
                  role="alert"
                  className={`mt-4 flex items-start gap-3 rounded-xl border p-4 text-sm ${
                    checkoutError.kind === "offline" || checkoutError.kind === "unknown"
                      ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                  }`}
                >
                  {checkoutError.kind === "offline" ? (
                    <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  )}
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{checkoutError.title}</p>
                    {checkoutError.lines.length > 0 && (
                      <ul className="list-inside list-disc space-y-0.5">
                        {checkoutError.lines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
