import {
  Check,
  Info,
  Layers,
  Loader2,
  Minus,
  PackageSearch,
  Plus,
  Printer,
  QrCode,
  ScanLine,
  Search,
  Tags,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PRODUCTS_MANAGER_API, buildUrl } from "../config/integration.js";
import {
  LABEL_SIZES,
  buildLabelsHtml,
  formatAmount,
  printHtml,
} from "../lib/print.js";
import { generateProductQrDataUrl } from "../lib/qr.js";

const STORAGE_KEY = "salesManager.qrLabels";
const MAX_COPIES = 500;
const PREVIEW_LIMIT = 24;
const SEARCH_LIMIT = 12;
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_TIMEOUT_MS = 8000;
const QR_PIXELS = 300;

const SIZES = ["small", "medium", "large"];
const LAYOUTS = ["sheet", "roll"];

// ---------- helpers ----------

const toPrice = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  return Number.isFinite(price) ? price : null;
};

const toItem = (product, copies = 1) => ({
  id: Number(product.id),
  name: String(product.name || `#${product.id}`),
  price: toPrice(product.price),
  stock: Number(product.stock ?? product.stock_quantity) || 0,
  category: product.category || product.category_name || "",
  copies,
});

const parseCopies = (value) => {
  const copies = Number(value);
  return Number.isSafeInteger(copies) && copies >= 1 && copies <= MAX_COPIES
    ? copies
    : null;
};

const clampCopies = (value) =>
  Math.min(Math.max(Number.parseInt(value, 10) || 1, 1), MAX_COPIES);

const readSaved = () => {
  const defaults = {
    items: [],
    size: "medium",
    layout: "sheet",
    showName: true,
    showPrice: true,
  };
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const items = Array.isArray(data.items)
      ? data.items
          .filter(
            (item) =>
              item &&
              Number.isSafeInteger(Number(item.id)) &&
              Number(item.id) > 0,
          )
          .map((item) => toItem(item, item.copies ?? 1))
      : [];
    return {
      items,
      size: SIZES.includes(data.size) ? data.size : defaults.size,
      layout: LAYOUTS.includes(data.layout) ? data.layout : defaults.layout,
      showName: data.showName !== false,
      showPrice: data.showPrice !== false,
    };
  } catch {
    return defaults;
  }
};

const card =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800";

const segmentBase =
  "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50";
const segmentOn =
  "bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200 dark:bg-gray-700 dark:text-emerald-300 dark:ring-emerald-800";
const segmentOff =
  "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white";

// ---------- component ----------

export default function QrLabels() {
  const { t, i18n } = useTranslation();
  const tr = useCallback((key, options) => t(`qrLabels.${key}`, options), [t]);

  const [saved] = useState(readSaved);
  const [items, setItems] = useState(saved.items);
  const [size, setSize] = useState(saved.size);
  const [layout, setLayout] = useState(saved.layout);
  const [showName, setShowName] = useState(saved.showName);
  const [showPrice, setShowPrice] = useState(saved.showPrice);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState("idle"); // idle | loading | done | error
  const [qrMap, setQrMap] = useState({});
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [highlight, setHighlight] = useState({ id: null, key: 0 });

  const searchRef = useRef(null);
  const pendingAddRef = useRef(false);

  // ---------- persistence ----------

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, size, layout, showName, showPrice }),
    );
  }, [items, size, layout, showName, showPrice]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // ---------- selection ----------

  const addProduct = useCallback((product) => {
    setItems((previous) => {
      const existing = previous.find((item) => item.id === product.id);
      if (!existing) return [...previous, { ...product, copies: 1 }];
      return previous.map((item) =>
        item.id === product.id
          ? {
              ...item,
              name: product.name,
              price: product.price,
              stock: product.stock,
              category: product.category,
              copies: clampCopies((parseCopies(item.copies) || 0) + 1),
            }
          : item,
      );
    });
    setHighlight((previous) => ({ id: product.id, key: previous.key + 1 }));
  }, []);

  const updateCopies = (id, copies) => {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, copies } : item)),
    );
  };

  const stepCopies = (item, delta) =>
    updateCopies(item.id, clampCopies((parseCopies(item.copies) || 0) + delta));

  const removeItem = (id) =>
    setItems((previous) => previous.filter((item) => item.id !== id));

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setItems([]);
    setConfirmClear(false);
  };

  // ---------- search ----------

  useEffect(() => {
    const value = query.trim().replace(/^@/, "").trim();
    if (!value || (value.length < 2 && !/^\d+$/.test(value))) {
      setResults([]);
      setSearchState("idle");
      pendingAddRef.current = false;
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    setSearchState("loading");

    const debounce = setTimeout(async () => {
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, SEARCH_TIMEOUT_MS);
      try {
        const url = buildUrl(
          PRODUCTS_MANAGER_API.BASE_URL,
          `${PRODUCTS_MANAGER_API.INTEGRATION.SEARCH}?q=${encodeURIComponent(value)}&limit=${SEARCH_LIMIT}`,
        );
        const response = await fetch(url, { signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error("search failed");

        const products = (data.products || [])
          .filter((product) => Number(product.id) > 0)
          .map((product) => toItem(product));
        setResults(products);
        setSearchState("done");

        // Enter was pressed before the results arrived (fast USB scanners)
        if (pendingAddRef.current && products.length > 0) {
          pendingAddRef.current = false;
          addProduct(products[0]);
          setQuery("");
        }
      } catch (error) {
        if (error?.name === "AbortError" && !timedOut) return;
        pendingAddRef.current = false;
        setResults([]);
        setSearchState("error");
      } finally {
        clearTimeout(timeout);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      controller.abort();
    };
  }, [query, addProduct]);

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (searchState === "done" && results.length > 0) {
      addProduct(results[0]);
      setQuery("");
    } else if (searchState === "loading") {
      pendingAddRef.current = true;
    }
  };

  // ---------- QR images ----------

  const idsKey = items.map((item) => item.id).join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: only regenerate when the set of product IDs changes
  useEffect(() => {
    const missing = idsKey
      .split(",")
      .filter(Boolean)
      .map(Number)
      .filter((id) => !qrMap[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        generateProductQrDataUrl(id, QR_PIXELS)
          .then((url) => [id, url])
          .catch(() => null),
      ),
    ).then((entries) => {
      const generated = entries.filter(Boolean);
      if (cancelled || generated.length === 0) return;
      setQrMap((previous) => {
        const next = { ...previous };
        for (const [id, url] of generated) next[id] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  // ---------- totals + preview ----------

  const totalLabels = useMemo(
    () => items.reduce((sum, item) => sum + (parseCopies(item.copies) || 0), 0),
    [items],
  );

  const valid =
    items.length > 0 && items.every((item) => parseCopies(item.copies));

  const previewLabels = useMemo(() => {
    const labels = [];
    for (const item of items) {
      const copies = parseCopies(item.copies) || 0;
      for (let index = 0; index < copies; index += 1) {
        if (labels.length >= PREVIEW_LIMIT) return labels;
        labels.push({ ...item, key: `${item.id}-${index}` });
      }
    }
    return labels;
  }, [items]);

  const selectedIds = useMemo(
    () => new Set(items.map((item) => item.id)),
    [items],
  );

  const dims = LABEL_SIZES[size] || LABEL_SIZES.medium;

  // ---------- print ----------

  const handlePrint = async () => {
    if (!valid || printing) return;
    setPrinting(true);
    setPrintError("");
    try {
      const urls = { ...qrMap };
      await Promise.all(
        items
          .filter((item) => !urls[item.id])
          .map(async (item) => {
            urls[item.id] = await generateProductQrDataUrl(item.id, QR_PIXELS);
          }),
      );

      const labels = items.flatMap((item) =>
        Array.from({ length: parseCopies(item.copies) || 0 }, () => ({
          id: item.id,
          name: item.name,
          price: item.price,
          qrDataUrl: urls[item.id],
        })),
      );

      printHtml(
        buildLabelsHtml(labels, {
          size,
          layout,
          showName,
          showPrice,
          currency: t("currency"),
          lang: i18n.language === "ar" ? "ar" : "fr",
        }),
      );
    } catch (error) {
      console.error("QR labels print error:", error);
      setPrintError(tr("printError"));
    } finally {
      setTimeout(() => setPrinting(false), 600);
    }
  };

  // ---------- render ----------

  const searchValue = query.trim();

  return (
    <section className="space-y-6 text-gray-900 dark:text-gray-100">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            {tr("eyebrow")}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">
            {tr("title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            {tr("subtitle")}
          </p>
        </div>
        <Link
          to="/qr-sale"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-emerald-400"
        >
          <ScanLine className="h-4 w-4" />
          {tr("backToSale")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.5fr)]">
        {/* ---------- Left: search + options ---------- */}
        <div className="space-y-5">
          <div className={`${card} p-5`}>
            <label
              htmlFor="qr-labels-search"
              className="mb-3 flex items-center gap-2 font-bold"
            >
              <Search className="h-5 w-5 text-emerald-600" />
              {tr("searchLabel")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                id="qr-labels-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={tr("searchPlaceholder")}
                autoComplete="off"
                autoFocus
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pe-9 ps-9 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-900"
              />
              {searchState === "loading" && (
                <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-600" />
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {tr("searchHint")}
            </p>

            <div className="mt-4" aria-live="polite">
              {searchState === "error" && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                  {tr("searchError")}
                </p>
              )}
              {searchState === "loading" && results.length === 0 && (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                  {tr("searching")}
                </p>
              )}
              {searchState === "done" && results.length === 0 && (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/60 dark:text-gray-300">
                  {tr("noResults")}
                </p>
              )}
              {results.length > 0 && searchValue && (
                <ul className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100 dark:divide-gray-700 dark:border-gray-700">
                  {results.map((product, index) => {
                    const selected = selectedIds.has(product.id);
                    return (
                      <li
                        key={product.id}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                          index === 0
                            ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                            : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">
                            {product.name}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono">#{product.id}</span>
                            {product.category ? ` · ${product.category}` : ""}
                            {product.price !== null
                              ? ` · ${formatAmount(product.price)} ${t("currency")}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
                            product.stock <= 0
                              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {tr("stock")}: {product.stock}
                        </span>
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          title={selected ? `${tr("added")} (+1)` : tr("add")}
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                            selected
                              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800"
                              : "bg-emerald-700 text-white hover:bg-emerald-800"
                          }`}
                        >
                          {selected ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          {selected ? tr("added") : tr("add")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Print options */}
          <div className={`${card} space-y-5 p-5`}>
            <div className="flex items-center gap-2 font-bold">
              <Tags className="h-5 w-5 text-emerald-600" />
              {tr("options")}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{tr("size")}</p>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900/60">
                {SIZES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={size === value}
                    onClick={() => setSize(value)}
                    className={`${segmentBase} ${size === value ? segmentOn : segmentOff}`}
                  >
                    <span className="block">{tr(`sizes.${value}`)}</span>
                    <span className="block text-[11px] font-normal tabular-nums opacity-70">
                      {LABEL_SIZES[value].width} x {LABEL_SIZES[value].height}{" "}
                      mm
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{tr("layout")}</p>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-900/60">
                {LAYOUTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={layout === value}
                    onClick={() => setLayout(value)}
                    className={`${segmentBase} ${layout === value ? segmentOn : segmentOff}`}
                  >
                    {tr(`layouts.${value}`)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {tr(`layoutHints.${layout}`)}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { key: "showName", value: showName, set: setShowName },
                { key: "showPrice", value: showPrice, set: setShowPrice },
              ].map((option) => (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    option.value
                      ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={option.value}
                    onChange={(event) => option.set(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 accent-emerald-600"
                  />
                  {tr(option.key)}
                </label>
              ))}
            </div>
          </div>

          <p className="flex items-start gap-2 px-1 text-xs text-gray-500 dark:text-gray-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {tr("idOnlyNote")}
          </p>
        </div>

        {/* ---------- Right: selection + preview ---------- */}
        <div className="space-y-5">
          <div className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <QrCode className="h-5 w-5 text-gray-400" />
                {tr("selection")}
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                  {items.length}
                </span>
              </h3>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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

            {items.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <PackageSearch className="mx-auto mb-3 h-11 w-11 text-gray-300 dark:text-gray-600" />
                <p className="font-medium">{tr("selectionEmpty")}</p>
                <p className="mt-1 text-sm text-gray-500">
                  {tr("selectionEmptyHint")}
                </p>
                <button
                  type="button"
                  onClick={() => searchRef.current?.focus()}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:text-gray-200"
                >
                  <Search className="h-4 w-4" />
                  {tr("searchLabel")}
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((item) => {
                  const copies = parseCopies(item.copies);
                  const flashing = highlight.id === item.id;
                  const canMatchStock =
                    item.stock > 0 &&
                    copies !== Math.min(item.stock, MAX_COPIES);
                  return (
                    <li
                      key={
                        flashing ? `${item.id}-${highlight.key}` : item.id
                      }
                      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${
                        flashing ? "qr-row-flash" : ""
                      }`}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white p-0.5 ring-1 ring-gray-200 dark:ring-gray-600">
                        {qrMap[item.id] ? (
                          <img
                            src={qrMap[item.id]}
                            alt=""
                            className="h-full w-full [image-rendering:pixelated]"
                          />
                        ) : (
                          <span className="block h-full w-full animate-pulse rounded bg-gray-200" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate font-semibold">{item.name}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-mono">#{item.id}</span>
                          {item.price !== null
                            ? ` · ${formatAmount(item.price)} ${t("currency")}`
                            : ""}
                          {` · ${tr("stock")}: ${item.stock}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-end">
                          <div
                            className={`inline-flex items-stretch overflow-hidden rounded-lg border ${
                              copies
                                ? "border-gray-300 dark:border-gray-600"
                                : "border-red-500"
                            }`}
                          >
                            <button
                              type="button"
                              aria-label={`${tr("decrease")} ${item.name}`}
                              disabled={!copies || copies <= 1}
                              onClick={() => stepCopies(item, -1)}
                              className="px-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <input
                              aria-label={`${tr("copies")} ${item.name}`}
                              type="number"
                              inputMode="numeric"
                              min="1"
                              max={MAX_COPIES}
                              step="1"
                              value={item.copies}
                              onChange={(event) =>
                                updateCopies(item.id, event.target.value)
                              }
                              onBlur={() =>
                                updateCopies(item.id, clampCopies(item.copies))
                              }
                              className="w-14 border-x border-gray-200 bg-transparent py-1.5 text-center tabular-nums outline-none dark:border-gray-600 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              aria-label={`${tr("increase")} ${item.name}`}
                              disabled={copies >= MAX_COPIES}
                              onClick={() => stepCopies(item, 1)}
                              className="px-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          {!copies && (
                            <span className="mt-1 block text-xs text-red-600">
                              {tr("invalidCopies", { max: MAX_COPIES })}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!canMatchStock}
                          onClick={() =>
                            updateCopies(item.id, clampCopies(item.stock))
                          }
                          title={tr("matchStock")}
                          aria-label={`${tr("matchStock")} ${item.name}`}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-emerald-950/40"
                        >
                          <Layers className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          title={tr("remove")}
                          aria-label={`${tr("remove")} ${item.name}`}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Print bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/60 px-5 py-4 dark:border-gray-700 dark:bg-gray-900/30">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                  {tr("totalLabels")}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {totalLabels}
                  <span className="ms-2 text-sm font-medium text-gray-500">
                    {tr(`sizes.${size}`)} · {tr(`layouts.${layout}`)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!valid || printing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 font-bold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {printing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Printer className="h-5 w-5" />
                )}
                {printing ? tr("printing") : tr("print")}
              </button>
            </div>
            {printError && (
              <p
                role="alert"
                className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
              >
                {printError}
              </p>
            )}
          </div>

          {/* Preview */}
          <div className={`${card} p-5`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold">{tr("preview")}</h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {tr("previewHint")} · {dims.width} x {dims.height} mm
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl bg-gray-100 p-4 dark:bg-gray-900/70">
              {previewLabels.length === 0 ? (
                <div className="flex min-h-[10rem] items-center justify-center text-sm text-gray-400">
                  <QrCode className="me-2 h-5 w-5" />
                  {tr("selectionEmpty")}
                </div>
              ) : (
                <div
                  className={`mx-auto w-fit bg-white text-black shadow-md ${
                    layout === "roll"
                      ? "flex flex-col items-center gap-3 bg-transparent shadow-none"
                      : "flex max-w-full flex-wrap content-start p-[4mm]"
                  }`}
                  style={layout === "roll" ? undefined : { gap: "2mm" }}
                  dir={i18n.language === "ar" ? "rtl" : "ltr"}
                >
                  {previewLabels.map((label) => (
                    <div
                      key={label.key}
                      className={`flex items-center overflow-hidden bg-white ${
                        layout === "roll"
                          ? "rounded-sm shadow-md ring-1 ring-gray-200"
                          : "border border-dashed border-gray-400"
                      }`}
                      style={{
                        width: `${dims.width}mm`,
                        height: `${dims.height}mm`,
                        padding: "1.5mm",
                        gap: "1.5mm",
                      }}
                    >
                      {qrMap[label.id] ? (
                        <img
                          src={qrMap[label.id]}
                          alt={`QR ${label.id}`}
                          className="shrink-0 [image-rendering:pixelated]"
                          style={{ width: `${dims.qr}mm`, height: `${dims.qr}mm` }}
                        />
                      ) : (
                        <span
                          className="shrink-0 animate-pulse bg-gray-200"
                          style={{ width: `${dims.qr}mm`, height: `${dims.qr}mm` }}
                        />
                      )}
                      <div
                        className="flex min-w-0 flex-1 flex-col"
                        style={{ gap: "0.6mm" }}
                      >
                        {showName && (
                          <div
                            className="line-clamp-3 break-words font-semibold"
                            style={{
                              fontSize: `${dims.name}pt`,
                              lineHeight: 1.15,
                            }}
                          >
                            {label.name}
                          </div>
                        )}
                        <div
                          className="font-mono font-extrabold"
                          style={{ fontSize: `${dims.id}pt` }}
                        >
                          #{label.id}
                        </div>
                        {showPrice && label.price !== null && (
                          <div
                            className="font-bold"
                            style={{ fontSize: `${dims.price}pt` }}
                          >
                            {formatAmount(label.price)} {t("currency")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {totalLabels > previewLabels.length && (
                <p className="mt-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                  {tr("previewMore", {
                    count: totalLabels - previewLabels.length,
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
