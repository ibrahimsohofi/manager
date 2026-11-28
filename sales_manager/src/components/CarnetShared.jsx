// Shared building blocks for the Carnet pages (people list `/carnet` + person page `/carnet/:id`).
// Visual language: a pocket notebook (leather cover, cream ruled paper, red margin) — see index.css.
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Coins,
  Loader2,
  Package,
  PackageCheck,
  PackageSearch,
  Search,
  StickyNote,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DIRECTIONS,
  KINDS,
  MAX_AMOUNT,
  RELATIONS,
  addDays,
  avatarTone,
  balanceState,
  carnetApi,
  entryEffect,
  formatDate,
  formatMoney,
  initials,
  localToday,
  parseAmount,
  parseProductId,
  productQuery,
  productsApi,
  round2,
} from "../lib/carnet.js";
import {
  ConfirmDialog,
  ModalShell,
  Notice,
  fieldLabel,
  ghostButton,
  inputClass,
  isValidDateString,
} from "./SupplierLedgerShared.jsx";

export { ConfirmDialog, ModalShell, Notice, fieldLabel, ghostButton, inputClass, isValidDateString };

// ==================== Style tokens ====================

export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--carnet-cover)] px-5 py-2.5 text-sm font-bold text-[color:var(--carnet-foil)] shadow-sm ring-1 ring-inset ring-black/10 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-60";

export const paperCard = "carnet-paper rounded-2xl border shadow-sm";

export const chipBase =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5";

// ==================== i18n + formatting hook ====================

export function useCarnetT() {
  const { t, i18n } = useTranslation();
  const tc = useCallback((key, options) => t(`carnet.${key}`, options), [t]);
  const lang = i18n.language === "ar" ? "ar" : "fr";
  const currency = t("currency");
  const money = useCallback(
    (value, withCurrency = true) => formatMoney(value, withCurrency ? currency : "", lang),
    [currency, lang],
  );
  const date = useCallback((value, options) => formatDate(value, lang, options), [lang]);
  return { t, tc, lang, currency, money, date };
}

/** Human message for an API error thrown by `carnetApi`. */
export const apiErrorText = (err, tc, fallback = "errors.save") => {
  if (err?.code === "network") return tc("errors.network");
  if (err?.status === 404) return tc("errors.notFound");
  if (err?.status === 409) return tc("errors.alreadySettled");
  return `${tc(fallback)}${err?.message ? ` (${err.message})` : ""}`;
};

// ==================== Visual metadata ====================

export const DIRECTION_META = {
  gave: {
    Icon: ArrowUpRight,
    icon: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
    text: "text-amber-800 dark:text-amber-300",
    active:
      "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-500/25 dark:bg-amber-950/40 dark:text-amber-100",
    button:
      "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-400 dark:bg-amber-600 dark:hover:bg-amber-500",
  },
  received: {
    Icon: ArrowDownLeft,
    icon: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
    text: "text-teal-800 dark:text-teal-300",
    active:
      "border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-600/25 dark:bg-teal-950/40 dark:text-teal-100",
    button:
      "bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-400 dark:bg-teal-600 dark:hover:bg-teal-500",
  },
  note: {
    Icon: StickyNote,
    icon: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
    text: "text-stone-600 dark:text-stone-300",
    active:
      "border-stone-500 bg-stone-100 text-stone-900 ring-2 ring-stone-500/20 dark:bg-stone-800 dark:text-stone-100",
    button:
      "bg-stone-700 text-white hover:bg-stone-800 focus-visible:ring-stone-400 dark:bg-stone-600 dark:hover:bg-stone-500",
  },
};

export const KIND_ICON = { money: Coins, goods: Package, service: Wrench, note: StickyNote };

const BALANCE_TONE = {
  owesMe: {
    text: "text-emerald-700 dark:text-emerald-300",
    ribbon: "bg-emerald-600 dark:bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-900",
  },
  iOwe: {
    text: "text-rose-700 dark:text-rose-300",
    ribbon: "bg-rose-600 dark:bg-rose-500",
    chip: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:ring-rose-900",
  },
  settled: {
    text: "text-stone-500 dark:text-stone-400",
    ribbon: "bg-stone-400 dark:bg-stone-600",
    chip: "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700",
  },
};

export const balanceTone = (balance) => BALANCE_TONE[balanceState(balance)];

/** "+ 1 200,00" / "− 300,00" / "0,00" */
export const signedMoney = (value, money) => {
  const v = round2(value);
  if (v === 0) return money(0, false);
  return `${v > 0 ? "+" : "−"} ${money(Math.abs(v), false)}`;
};

// ==================== Small components ====================

const AVATAR_SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl",
};

export function Avatar({ name, size = "md", className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`carnet-display inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-inset ${avatarTone(name)} ${AVATAR_SIZES[size] || AVATAR_SIZES.md} ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function BalanceTag({ balance, size = "md", className = "" }) {
  const { tc, money } = useCarnetT();
  const state = balanceState(balance);
  const tone = BALANCE_TONE[state];
  const amountSize = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span className={`carnet-display font-semibold tabular-nums ${tone.text} ${amountSize}`}>
        {money(Math.abs(balance))}
      </span>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
        {tc(`balanceShort.${state}`)}
      </span>
    </span>
  );
}

export function DirectionIcon({ direction, kind, className = "h-9 w-9" }) {
  const meta = DIRECTION_META[direction] || DIRECTION_META.note;
  const Icon = direction === "note" ? StickyNote : KIND_ICON[kind] || meta.Icon;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl ${meta.icon} ${className}`}
    >
      <Icon className="h-4 w-4" />
      {direction !== "note" ? (
        <meta.Icon className="absolute -bottom-1 -end-1 h-4 w-4 rounded-full bg-white p-0.5 shadow-sm ring-1 ring-black/5 dark:bg-stone-900" />
      ) : null}
    </span>
  );
}

const FieldError = ({ text }) =>
  text ? <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{text}</p> : null;

const ServerError = ({ text }) =>
  text ? (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </div>
  ) : null;

/** Leather strip used as a dialog header. */
function DialogCover({ id, eyebrow, title, children }) {
  return (
    <header className="carnet-cover rounded-none px-6 pb-5 pt-6 sm:rounded-t-2xl">
      <div className="flex items-center gap-4">
        {children}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] opacity-70">
              {eyebrow}
            </p>
          ) : null}
          <h3 id={id} className="carnet-display carnet-foil mt-0.5 truncate text-2xl font-semibold">
            {title}
          </h3>
        </div>
      </div>
    </header>
  );
}

// ==================== Contact form (create / edit a person) ====================

/**
 * @param {object|null} props.contact - existing person when editing
 * @param {() => void} props.onClose
 * @param {(saved: object, isEdit: boolean) => void} props.onSaved
 */
export function ContactFormDialog({ contact = null, onClose, onSaved }) {
  const { t, tc } = useCarnetT();
  const isEdit = Boolean(contact);
  const [form, setForm] = useState(() => ({
    name: contact?.name || "",
    phone: contact?.phone || "",
    relation: contact?.relation || "",
    notes: contact?.notes || "",
  }));
  const [nameError, setNameError] = useState("");
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name") setNameError("");
    setServerError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) {
      setNameError(tc("form.errors.name"));
      nameRef.current?.focus();
      return;
    }
    const payload = {
      name,
      phone: form.phone.trim() || null,
      relation: form.relation.trim() || null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    setServerError("");
    try {
      const saved = isEdit
        ? await carnetApi.updateContact(contact.id, payload)
        : await carnetApi.createContact(payload);
      onSaved(saved || { ...contact, ...payload }, isEdit);
    } catch (err) {
      setServerError(apiErrorText(err, tc));
      setSaving(false);
    }
  };

  const customRelation =
    form.relation && !RELATIONS.includes(form.relation) ? form.relation : null;
  const relationOptions = customRelation ? [...RELATIONS, customRelation] : RELATIONS;

  return (
    <ModalShell onClose={onClose} locked={saving} labelledBy="carnet-contact-title" wide>
      <form onSubmit={handleSubmit} noValidate className="carnet">
        <DialogCover
          id="carnet-contact-title"
          eyebrow={tc("title")}
          title={isEdit ? tc("form.editContact") : tc("form.newContact")}
        >
          <Avatar name={form.name || "?"} size="lg" />
        </DialogCover>

        <div className="space-y-5 px-6 py-6">
          <div>
            <label htmlFor="carnet-name" className={fieldLabel}>
              {tc("form.name")} *
            </label>
            <input
              id="carnet-name"
              ref={nameRef}
              value={form.name}
              maxLength={255}
              autoComplete="off"
              onChange={(e) => setField("name", e.target.value)}
              placeholder={tc("form.namePlaceholder")}
              aria-invalid={Boolean(nameError)}
              className={`${inputClass} text-base font-semibold ${nameError ? "border-red-400" : ""}`}
            />
            <FieldError text={nameError} />
          </div>

          <div>
            <label htmlFor="carnet-phone" className={fieldLabel}>
              {tc("form.phone")}
            </label>
            <input
              id="carnet-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              maxLength={50}
              autoComplete="off"
              onChange={(e) => setField("phone", e.target.value)}
              placeholder={tc("form.phonePlaceholder")}
              dir="ltr"
              className={`${inputClass} font-mono tracking-wide rtl:text-right`}
            />
          </div>

          <fieldset>
            <legend className={fieldLabel}>{tc("form.relation")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {relationOptions.map((relation) => {
                const active = form.relation === relation;
                return (
                  <button
                    type="button"
                    key={relation}
                    aria-pressed={active}
                    onClick={() => setField("relation", active ? "" : relation)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                      active
                        ? "bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)] ring-transparent"
                        : "text-stone-700 ring-stone-200 hover:bg-stone-50 dark:text-stone-200 dark:ring-stone-600 dark:hover:bg-stone-700/50"
                    }`}
                  >
                    {RELATIONS.includes(relation) ? tc(`relations.${relation}`) : relation}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="carnet-contact-notes" className={fieldLabel}>
              {tc("form.contactNotes")}
            </label>
            <textarea
              id="carnet-contact-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder={tc("form.contactNotesPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </div>

          <ServerError text={serverError} />
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-stone-200 bg-stone-50/70 px-6 py-4 dark:border-stone-700 dark:bg-stone-900/40 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className={ghostButton}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving
              ? tc("form.saving")
              : isEdit
                ? tc("form.saveContact")
                : tc("form.createContact")}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

// ==================== Inventory product picker (kind "goods") ====================

const SUGGEST_DEBOUNCE_MS = 250;
const LIST_ID = "carnet-product-list";
const optionId = (productId) => `carnet-product-${productId}`;

/** Product name with the typed text in bold (case-insensitive). */
function Highlight({ text, query }) {
  const q = productQuery(query);
  const index = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

function StockText({ stock, tc }) {
  if (stock === null) return null;
  return (
    <span className={stock > 0 ? "" : "font-semibold text-rose-600 dark:text-rose-400"}>
      {stock > 0 ? tc("form.product.stock", { qty: stock }) : tc("form.product.outOfStock")}
    </span>
  );
}

/**
 * Description input with inventory suggestions while typing + a "pick by ID" box.
 * The description stays free text: picking a product only fills it in.
 * @param {object|null} props.product - product currently picked (from this dialog session)
 * @param {(text: string) => void} props.onType - user typed in the description
 * @param {(product: object) => void} props.onPick
 * @param {() => void} props.onUnlink
 */
function ProductDescriptionField({
  inputRef,
  value,
  invalid,
  placeholder,
  product,
  onType,
  onPick,
  onUnlink,
}) {
  const { tc, lang, money } = useCarnetT();
  const [query, setQuery] = useState(""); // last text typed by the user (drives the search)
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | done | offline
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [idText, setIdText] = useState("");
  const [idStatus, setIdStatus] = useState("idle"); // idle | loading | invalid | notFound | offline
  const idSeq = useRef(0);

  // Debounced, cancellable search on every keystroke
  useEffect(() => {
    if (!productQuery(query)) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const found = await productsApi.search(query, { lang, signal: controller.signal });
        setResults(found);
        setActive(0);
        setStatus("done");
      } catch (err) {
        if (err?.name === "AbortError") return;
        setResults([]);
        setStatus("offline");
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, lang]);

  const pick = (picked) => {
    idSeq.current += 1;
    onPick(picked);
    setQuery("");
    setResults([]);
    setStatus("idle");
    setOpen(false);
    setIdText("");
    setIdStatus("idle");
  };

  const showList = open && status !== "idle";
  const activeProduct = status === "done" ? results[active] : undefined;

  const handleChange = (event) => {
    const text = event.target.value;
    onType(text);
    setQuery(text);
    setOpen(true);
  };

  const handleKeyDown = (event) => {
    if (!showList) {
      if (event.key === "ArrowDown" && results.length) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    const count = results.length;
    if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    } else if (event.key === "Enter") {
      // List open: Enter never submits the form. Pick, wait while loading, or close the list.
      event.preventDefault();
      if (activeProduct) pick(activeProduct);
      else if (status !== "loading") setOpen(false);
    } else if (event.key === "Escape") {
      // Close the list only, not the whole dialog
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const lookupId = async () => {
    const id = parseProductId(idText);
    if (!id) {
      setIdStatus("invalid");
      return;
    }
    const seq = idSeq.current + 1;
    idSeq.current = seq;
    setIdStatus("loading");
    try {
      const found = await productsApi.byId(id, { lang });
      if (idSeq.current !== seq) return;
      if (found) pick(found);
      else setIdStatus("notFound");
    } catch {
      if (idSeq.current === seq) setIdStatus("offline");
    }
  };

  const idMessage =
    idStatus === "invalid"
      ? tc("form.product.idInvalid")
      : idStatus === "notFound"
        ? tc("form.product.idNotFound", { id: parseProductId(idText) })
        : idStatus === "offline"
          ? tc("form.product.offline")
          : "";

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10.5rem]">
        {/* Name search (combobox) */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            id="carnet-desc"
            ref={inputRef}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length || status === "offline") setOpen(true);
            }}
            onBlur={() => setOpen(false)}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={LIST_ID}
            aria-activedescendant={showList && activeProduct ? optionId(activeProduct.id) : undefined}
            aria-invalid={invalid}
            className={`${inputClass} ps-9 pe-9 ${invalid ? "border-red-400" : ""}`}
          />
          {status === "loading" ? (
            <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone-400" />
          ) : null}

          {showList ? (
            <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-stone-700 dark:bg-stone-900">
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:border-stone-800 dark:bg-stone-800/60 dark:text-stone-400">
                <span className="inline-flex items-center gap-1.5">
                  <PackageSearch className="h-3.5 w-3.5" />
                  {tc("form.product.inventory")}
                </span>
                {status === "done" && results.length ? (
                  <span className="tabular-nums">{results.length}</span>
                ) : null}
              </div>

              {status === "offline" ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-stone-600 dark:text-stone-300">
                  <WifiOff className="h-4 w-4 shrink-0 text-rose-500" />
                  {tc("form.product.offline")}
                </p>
              ) : status === "loading" && !results.length ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tc("form.product.searching")}
                </p>
              ) : status === "done" && !results.length ? (
                <p className="px-3 py-3 text-sm text-stone-500 dark:text-stone-400">
                  {tc("form.product.noResults")}
                </p>
              ) : (
                <ul
                  id={LIST_ID}
                  // biome-ignore lint/a11y/useSemanticElements: combobox popup with rich rows; a native <select> cannot render them
                  role="listbox"
                  tabIndex={-1}
                  aria-label={tc("form.product.inventory")}
                  className={`max-h-64 overflow-y-auto py-1 ${status === "loading" ? "opacity-60" : ""}`}
                >
                  {results.map((p, index) => {
                    const isActive = index === active;
                    return (
                      <li
                        key={p.id}
                        id={optionId(p.id)}
                        // biome-ignore lint/a11y/useSemanticElements: option of the custom combobox listbox above
                        role="option"
                        tabIndex={-1}
                        aria-selected={isActive}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => pick(p)}
                        onKeyDown={() => {}}
                        className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                          isActive ? "bg-amber-50 dark:bg-stone-800" : ""
                        }`}
                      >
                        <span
                          dir="ltr"
                          className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ring-1 ring-inset ${
                            isActive
                              ? "bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)] ring-transparent"
                              : "bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700"
                          }`}
                        >
                          #{p.id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                            <Highlight text={p.name} query={query} />
                          </span>
                          <span className="flex gap-1.5 truncate text-xs text-stone-500 dark:text-stone-400">
                            {p.category ? <span className="truncate">{p.category}</span> : null}
                            {p.category && p.stock !== null ? <span aria-hidden="true">·</span> : null}
                            <StockText stock={p.stock} tc={tc} />
                          </span>
                        </span>
                        {p.price !== null ? (
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                            {money(p.price)}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {/* Pick by product ID */}
        <div>
          <div
            className={`flex h-full min-h-[42px] items-stretch overflow-hidden rounded-lg border bg-white transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:bg-gray-900 ${
              idMessage ? "border-red-400" : "border-gray-300 dark:border-gray-600"
            }`}
            dir="ltr"
          >
            <span className="flex items-center border-e border-stone-200 bg-stone-50 px-2.5 font-mono text-sm font-bold text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
              #
            </span>
            <input
              id="carnet-product-id"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={idText}
              onChange={(e) => {
                setIdText(e.target.value.replace(/[^\d#@]/g, ""));
                setIdStatus("idle");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookupId();
                }
              }}
              placeholder={tc("form.product.idPlaceholder")}
              aria-label={tc("form.product.idLabel")}
              aria-invalid={Boolean(idMessage)}
              className="w-full min-w-0 bg-transparent px-2.5 font-mono text-sm tabular-nums text-gray-900 outline-none placeholder:font-sans placeholder:text-stone-400 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={lookupId}
              disabled={idStatus === "loading" || !idText.trim()}
              title={tc("form.product.idPick")}
              aria-label={tc("form.product.idPick")}
              className="flex w-10 shrink-0 items-center justify-center bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)] transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {idStatus === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {idMessage ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {idMessage}
        </p>
      ) : null}

      {product ? (
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white/70 px-3 py-2 dark:border-stone-600 dark:bg-stone-900/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)]">
            <PackageCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
              {tc("form.product.linked")}{" "}
              <span dir="ltr" className="font-mono tracking-normal">
                #{product.id}
              </span>
            </p>
            <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {product.name}
            </p>
          </div>
          <div className="shrink-0 text-end text-xs leading-5 text-stone-500 dark:text-stone-400">
            {product.price !== null ? (
              <p className="text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                {money(product.price)}
              </p>
            ) : null}
            <StockText stock={product.stock} tc={tc} />
          </div>
          <button
            type="button"
            onClick={onUnlink}
            title={tc("form.product.unlink")}
            aria-label={tc("form.product.unlink")}
            className="shrink-0 rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-stone-500 dark:text-stone-400">{tc("form.product.hint")}</p>
      )}
    </div>
  );
}

// ==================== Entry form (gave / received / note) ====================

const DUE_PRESETS = [7, 15, 30];

const initialEntryForm = (entry, direction) => {
  const today = localToday();
  if (entry) {
    return {
      direction: entry.direction,
      kind: entry.kind === "note" || !KINDS.includes(entry.kind) ? "money" : entry.kind,
      amount: entry.amount > 0 ? String(entry.amount) : "",
      description: entry.description || "",
      notes: entry.notes || "",
      entry_date: entry.entry_date || today,
      due_date: entry.due_date || "",
      to_return: Boolean(entry.to_return),
      settled: Boolean(entry.settled),
      settled_date: entry.settled_date || today,
    };
  }
  return {
    direction: DIRECTIONS.includes(direction) ? direction : "gave",
    kind: "money",
    amount: "",
    description: "",
    notes: "",
    entry_date: today,
    due_date: "",
    to_return: false,
    settled: false,
    settled_date: today,
  };
};

/**
 * Create or edit one entry with a live balance preview.
 * @param {object} props.contact - { id, name }
 * @param {object|null} props.entry - existing entry (from the account timeline) when editing
 * @param {string} props.initialDirection - "gave" | "received" | "note" (create only)
 * @param {number} props.currentBalance - full-history balance of the person
 * @param {() => void} props.onClose
 * @param {(saved: object, isEdit: boolean) => void} props.onSaved
 */
export function EntryDialog({
  contact,
  entry = null,
  initialDirection = "gave",
  currentBalance = 0,
  onClose,
  onSaved,
}) {
  const { t, tc, money, currency } = useCarnetT();
  const isEdit = Boolean(entry);
  const [form, setForm] = useState(() => initialEntryForm(entry, initialDirection));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  // Inventory product picked for a "goods" entry (fills description + value, not saved as a link)
  const [product, setProduct] = useState(null);
  const [priceFilled, setPriceFilled] = useState(false);
  const firstFieldRef = useRef(null);

  const isNote = form.direction === "note";
  const isLoan = !isNote && form.kind === "goods" && form.to_return;
  const isGoods = !isNote && form.kind === "goods";

  useEffect(() => {
    const id = setTimeout(() => firstFieldRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "kind" && value !== "goods") {
        next.to_return = false;
        next.settled = false;
      }
      if (key === "to_return" && !value) next.settled = false;
      return next;
    });
    clearError(key);
    if (key === "kind" || key === "to_return") clearError("amount");
    if (key === "kind" && value !== "goods") {
      // The description is kept, only the inventory link is dropped
      setProduct(null);
      setPriceFilled(false);
    }
    if (key === "amount") setPriceFilled(false);
    setServerError("");
  };

  // ----- Inventory product (kind "goods") -----
  const pickProduct = (picked) => {
    // Only overwrite an amount the user has not typed themselves
    const fillPrice = picked.price !== null && (!form.amount.trim() || priceFilled);
    setProduct(picked);
    setForm((prev) => ({
      ...prev,
      description: picked.name.slice(0, 500),
      amount: fillPrice ? picked.price.toFixed(2).replace(".", ",") : prev.amount,
    }));
    setPriceFilled(fillPrice);
    clearError("description");
    if (fillPrice) clearError("amount");
    setServerError("");
  };

  const typeDescription = (text) => {
    setField("description", text);
    if (product && text.trim() !== product.name) {
      setProduct(null);
      setPriceFilled(false);
    }
  };

  const unlinkProduct = () => {
    setProduct(null);
    setPriceFilled(false);
  };

  const setDirection = (direction) => {
    if (direction === "note") unlinkProduct();
    setForm((prev) => ({ ...prev, direction }));
    setErrors({});
    setServerError("");
  };

  // ----- Balance preview -----
  const amountValue = parseAmount(form.amount);
  const hasAmount = form.amount.trim() !== "";
  const amountOk = Number.isFinite(amountValue) && amountValue >= 0;
  const baseBalance = round2(
    (Number(currentBalance) || 0) - (isEdit ? Number(entry.signed ?? entryEffect(entry)) || 0 : 0),
  );
  const effect = entryEffect({
    direction: form.direction,
    kind: form.kind,
    amount: amountOk ? amountValue : 0,
    to_return: isLoan,
  });
  const balanceAfter = round2(baseBalance + effect);

  // ----- Validation (mirrors server/utils/personalLedger.js) -----
  const validate = () => {
    const next = {};
    if (isNote) {
      if (!form.description.trim() && !form.notes.trim()) next.description = tc("form.errors.noteEmpty");
    } else {
      if (form.kind === "money" && (!amountOk || !(amountValue > 0))) {
        next.amount = hasAmount && !amountOk ? tc("form.errors.amountInvalid") : tc("form.errors.amount");
      } else if (hasAmount && !amountOk) {
        next.amount = tc("form.errors.amountInvalid");
      } else if (amountOk && amountValue > MAX_AMOUNT) {
        next.amount = tc("form.errors.amountTooLarge");
      }
      if (form.kind === "goods" && !form.description.trim()) next.description = tc("form.errors.description");
      if (form.due_date) {
        if (!isValidDateString(form.due_date)) next.due_date = tc("form.errors.date");
        else if (form.due_date < form.entry_date) next.due_date = tc("form.errors.dueBeforeDate");
      }
      if (isLoan && form.settled && !isValidDateString(form.settled_date)) {
        next.settled_date = tc("form.errors.date");
      }
    }
    if (!isValidDateString(form.entry_date)) next.entry_date = tc("form.errors.date");
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload = isNote
      ? {
          direction: "note",
          amount: 0,
          description: form.description.trim() || null,
          notes: form.notes.trim() || null,
          entry_date: form.entry_date,
          due_date: null,
          to_return: false,
          settled: false,
          settled_date: null,
        }
      : {
          direction: form.direction,
          kind: form.kind,
          amount: hasAmount && amountOk ? round2(amountValue) : 0,
          description: form.description.trim() || null,
          notes: form.notes.trim() || null,
          entry_date: form.entry_date,
          due_date: form.due_date || null,
          to_return: isLoan,
          settled: isLoan && form.settled,
          settled_date: isLoan && form.settled ? form.settled_date : null,
        };

    setSaving(true);
    setServerError("");
    try {
      const saved = isEdit
        ? await carnetApi.updateEntry(contact.id, entry.id, payload)
        : await carnetApi.createEntry(contact.id, payload);
      onSaved(saved || { ...payload, id: entry?.id }, isEdit);
    } catch (err) {
      setServerError(apiErrorText(err, tc));
      setSaving(false);
    }
  };

  const meta = DIRECTION_META[form.direction] || DIRECTION_META.gave;
  const amountLabel = isLoan ? tc("form.value") : tc("form.amount");
  const amountRequired = form.kind === "money";

  return (
    <ModalShell onClose={onClose} locked={saving} labelledBy="carnet-entry-title" wide>
      <form onSubmit={handleSubmit} noValidate className="carnet">
        <DialogCover
          id="carnet-entry-title"
          eyebrow={contact?.name}
          title={isEdit ? tc("form.editEntry") : tc(`form.newEntry.${form.direction}`)}
        >
          <DirectionIcon direction={form.direction} kind={form.kind} className="h-12 w-12" />
        </DialogCover>

        <div className="space-y-5 px-6 py-6">
          {/* Direction */}
          <fieldset disabled={saving}>
            <legend className={fieldLabel}>{tc("form.direction")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {DIRECTIONS.map((direction) => {
                const m = DIRECTION_META[direction];
                const active = form.direction === direction;
                return (
                  <button
                    type="button"
                    key={direction}
                    onClick={() => setDirection(direction)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-sm font-semibold transition sm:flex-row sm:justify-center sm:gap-2 ${
                      active
                        ? m.active
                        : "border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-700/40"
                    }`}
                  >
                    <m.Icon className="h-4 w-4" />
                    {tc(`directions.${direction}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              {tc(`directionHints.${form.direction}`)}
            </p>
          </fieldset>

          {/* Kind */}
          {!isNote ? (
            <fieldset disabled={saving}>
              <legend className={fieldLabel}>{tc("form.kind")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {KINDS.map((kind) => {
                  const Icon = KIND_ICON[kind];
                  const active = form.kind === kind;
                  return (
                    <button
                      type="button"
                      key={kind}
                      onClick={() => setField("kind", kind)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                        active
                          ? "bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)] ring-transparent"
                          : "text-stone-700 ring-stone-200 hover:bg-stone-50 dark:text-stone-200 dark:ring-stone-600 dark:hover:bg-stone-700/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {tc(`kinds.${kind}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* Description (or note text) */}
          <div>
            <label htmlFor="carnet-desc" className={fieldLabel}>
              {isNote ? tc("form.noteText") : tc("form.description")}
              {isNote || form.kind === "goods" ? " *" : ""}
            </label>
            {isNote ? (
              <textarea
                id="carnet-desc"
                ref={firstFieldRef}
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder={tc("form.descriptionPlaceholder.note")}
                aria-invalid={Boolean(errors.description)}
                className={`${inputClass} resize-y ${errors.description ? "border-red-400" : ""}`}
              />
            ) : (
              <input
                id="carnet-desc"
                ref={form.kind === "money" ? undefined : firstFieldRef}
                maxLength={500}
                autoComplete="off"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                placeholder={tc(`form.descriptionPlaceholder.${form.kind}`)}
                aria-invalid={Boolean(errors.description)}
                className={`${inputClass} ${errors.description ? "border-red-400" : ""}`}
              />
            )}
            <FieldError text={errors.description} />
          </div>

          {/* Object loan */}
          {!isNote && form.kind === "goods" ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.to_return}
                  onChange={(e) => setField("to_return", e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 accent-amber-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {tc("form.toReturn")}
                  </span>
                  <span className="block text-xs text-stone-600 dark:text-stone-400">
                    {tc("form.toReturnHint")}
                  </span>
                </span>
              </label>
              {form.to_return ? (
                <div className="mt-3 flex flex-col gap-2 ps-7 sm:flex-row sm:items-center">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-800 dark:text-stone-200">
                    <input
                      type="checkbox"
                      checked={form.settled}
                      onChange={(e) => setField("settled", e.target.checked)}
                      className="h-4 w-4 rounded border-stone-300 accent-emerald-600"
                    />
                    {tc("form.returned")}
                  </label>
                  {form.settled ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-stone-500">{tc("form.returnedDate")}</span>
                      <input
                        type="date"
                        value={form.settled_date}
                        onChange={(e) => setField("settled_date", e.target.value)}
                        aria-label={tc("form.returnedDate")}
                        className={`${inputClass} w-auto py-1.5`}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <FieldError text={errors.settled_date} />
            </div>
          ) : null}

          {/* Amount + date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isNote ? (
              <div>
                <label htmlFor="carnet-amount" className={fieldLabel}>
                  {amountLabel}
                  {amountRequired ? " *" : ""}
                </label>
                <div className="relative">
                  <input
                    id="carnet-amount"
                    ref={form.kind === "money" ? firstFieldRef : undefined}
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.amount}
                    onChange={(e) => setField("amount", e.target.value)}
                    placeholder="0,00"
                    aria-invalid={Boolean(errors.amount)}
                    className={`${inputClass} carnet-display pe-14 text-xl font-semibold tabular-nums ${errors.amount ? "border-red-400" : ""}`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-stone-400">
                    {currency}
                  </span>
                </div>
                {isGoods && product && priceFilled && !errors.amount ? (
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    {tc("form.product.priceFilled")}
                  </p>
                ) : null}
                <FieldError text={errors.amount} />
              </div>
            ) : null}
            <div className={isNote ? "sm:col-span-2 sm:max-w-[12rem]" : ""}>
              <label htmlFor="carnet-date" className={fieldLabel}>
                {tc("form.date")} *
              </label>
              <input
                id="carnet-date"
                type="date"
                value={form.entry_date}
                onChange={(e) => setField("entry_date", e.target.value)}
                aria-invalid={Boolean(errors.entry_date)}
                className={`${inputClass} py-3 ${errors.entry_date ? "border-red-400" : ""}`}
              />
              <FieldError text={errors.entry_date} />
            </div>
          </div>

          {/* Due date */}
          {!isNote ? (
            <div>
              <label htmlFor="carnet-due" className={fieldLabel}>
                {tc("form.dueDate")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="carnet-due"
                  type="date"
                  value={form.due_date}
                  min={form.entry_date || undefined}
                  onChange={(e) => setField("due_date", e.target.value)}
                  aria-invalid={Boolean(errors.due_date)}
                  className={`${inputClass} sm:max-w-[11rem] ${errors.due_date ? "border-red-400" : ""}`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {DUE_PRESETS.map((days) => {
                    const value = isValidDateString(form.entry_date) ? addDays(form.entry_date, days) : "";
                    const active = Boolean(value) && form.due_date === value;
                    return (
                      <button
                        type="button"
                        key={days}
                        onClick={() => setField("due_date", value)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          active
                            ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700"
                            : "text-stone-600 ring-stone-200 hover:bg-stone-50 dark:text-stone-300 dark:ring-stone-600 dark:hover:bg-stone-700/50"
                        }`}
                      >
                        {tc("form.plusDays", { count: days })}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setField("due_date", "")}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                      !form.due_date
                        ? "bg-stone-200 text-stone-800 ring-stone-300 dark:bg-stone-700 dark:text-stone-100 dark:ring-stone-500"
                        : "text-stone-600 ring-stone-200 hover:bg-stone-50 dark:text-stone-300 dark:ring-stone-600 dark:hover:bg-stone-700/50"
                    }`}
                  >
                    {tc("form.noDue")}
                  </button>
                </div>
              </div>
              <FieldError text={errors.due_date} />
            </div>
          ) : null}

          {/* Details */}
          {!isNote || form.notes ? (
            <div>
              <label htmlFor="carnet-notes" className={fieldLabel}>
                {tc("form.notes")}
              </label>
              <textarea
                id="carnet-notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder={tc("form.notesPlaceholder")}
                className={`${inputClass} resize-y`}
              />
            </div>
          ) : null}

          <ServerError text={serverError} />
        </div>

        {/* Live balance preview + actions */}
        <footer className="border-t border-stone-200 bg-stone-50/80 px-6 py-4 dark:border-stone-700 dark:bg-stone-900/40">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
            {tc("form.preview")}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div className="min-w-0">
              <dt className="truncate text-xs text-stone-500 dark:text-stone-400">
                {isEdit ? tc("form.balanceWithout") : tc("form.balanceNow")}
              </dt>
              <dd className={`font-semibold tabular-nums ${balanceTone(baseBalance).text}`}>
                {signedMoney(baseBalance, money)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-xs text-stone-500 dark:text-stone-400">{tc("form.thisEntry")}</dt>
              <dd className={`font-semibold tabular-nums ${effect === 0 ? "text-stone-400" : meta.text}`}>
                {effect === 0 ? tc("form.noEffect") : signedMoney(effect, money)}
              </dd>
            </div>
            <div className="min-w-0 border-s border-dashed border-stone-300 ps-3 dark:border-stone-600">
              <dt className="truncate text-xs text-stone-500 dark:text-stone-400">{tc("form.balanceAfter")}</dt>
              <dd className={`carnet-display text-lg font-semibold tabular-nums ${balanceTone(balanceAfter).text}`}>
                {signedMoney(balanceAfter, money)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} disabled={saving} className={ghostButton}>
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 ${meta.button}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.Icon className="h-4 w-4" />}
              {saving ? tc("form.saving") : isEdit ? tc("form.saveChanges") : tc("form.save")}
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
  );
}

// ==================== Formatting helpers for lists ====================

/** Accent-insensitive lowercase text for client-side search. */
export const searchable = (...parts) =>
  parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    // Drop combining marks: French accents (é -> e) and Arabic harakat
    .replace(/\p{Mn}/gu, "")
    .toLowerCase();

export const formatDayMonth = (value, lang) =>
  formatDate(value, lang, { day: "2-digit", month: "short", year: undefined });
