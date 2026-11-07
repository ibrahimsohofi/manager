// Shared building blocks for the supplier ledger pages (overview + detail).
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Info,
  Loader2,
  PackagePlus,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LEDGER_TYPES,
  PAYMENT_METHODS,
  addDays,
  balanceState,
  formatDate,
  formatMoney,
  ledgerApi,
  localToday,
  parseAmount,
  parseLocalDate,
  paymentTermsDays,
  round2,
} from "../lib/supplierLedger.js";

const MAX_AMOUNT = 9999999999.99;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const card =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800";

export const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100";

export const ghostButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:text-emerald-400";

export const isValidDateString = (value) =>
  typeof value === "string" && DATE_RE.test(value) && Boolean(parseLocalDate(value));

/** Signed effect on the balance: purchases add, payments / returns subtract. */
export const signedAmount = (type, amount) =>
  type === "purchase" ? round2(amount) : -round2(amount);

// ==================== i18n + formatting hook ====================

export function useLedgerT() {
  const { t, i18n } = useTranslation();
  const tr = useCallback(
    (key, options) => t(`supplierLedger.${key}`, options),
    [t],
  );
  const lang = i18n.language === "ar" ? "ar" : "fr";
  const currency = t("currency");
  const money = useCallback(
    (value, withCurrency = true) =>
      formatMoney(value, withCurrency ? currency : "", lang),
    [currency, lang],
  );
  const date = useCallback(
    (value, options) => formatDate(value, lang, options),
    [lang],
  );
  return { t, tr, lang, currency, money, date };
}

// ==================== Visual metadata ====================

export const TYPE_META = {
  purchase: {
    Icon: PackagePlus,
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    rail: "border-s-amber-400 dark:border-s-amber-500",
    button: "bg-amber-600 text-white hover:bg-amber-700",
    active:
      "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-500/20 dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100",
  },
  payment: {
    Icon: Banknote,
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    rail: "border-s-emerald-500",
    button: "bg-emerald-700 text-white hover:bg-emerald-800",
    active:
      "border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-100",
  },
  return: {
    Icon: Undo2,
    chip: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
    icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
    rail: "border-s-cyan-500",
    button: "bg-cyan-700 text-white hover:bg-cyan-800",
    active:
      "border-cyan-500 bg-cyan-50 text-cyan-900 ring-2 ring-cyan-500/20 dark:border-cyan-500 dark:bg-cyan-950/40 dark:text-cyan-100",
  },
};

const BALANCE_TONE = {
  owed: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900",
  credit:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900",
  settled:
    "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700/60 dark:text-gray-300 dark:ring-gray-600",
};

export const balanceTextTone = (balance) => {
  const state = balanceState(balance);
  if (state === "owed") return "text-rose-700 dark:text-rose-300";
  if (state === "credit") return "text-emerald-700 dark:text-emerald-300";
  return "text-gray-500 dark:text-gray-400";
};

// ==================== Small components ====================

export function BalancePill({ balance, className = "" }) {
  const { tr, money } = useLedgerT();
  const state = balanceState(balance);
  return (
    <span
      className={`inline-flex flex-col items-end rounded-lg px-2.5 py-1 leading-tight ring-1 ring-inset ${BALANCE_TONE[state]} ${className}`}
    >
      <span className="font-bold tabular-nums">
        {money(Math.abs(balance), false)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
        {tr(`balance.${state}`)}
      </span>
    </span>
  );
}

export function TypeChip({ type }) {
  const { tr } = useLedgerT();
  const meta = TYPE_META[type] || TYPE_META.purchase;
  const { Icon } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.chip}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {tr(`types.${type}`)}
    </span>
  );
}

const STAT_TONES = {
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  emerald:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300",
};

export function StatCard({ icon: Icon, label, value, sub, tone = "gray", valueClass = "" }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </p>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${STAT_TONES[tone]}`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white ${valueClass}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      ) : null}
    </div>
  );
}

const NOTICE_TONE = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100",
  error:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-100",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-100",
};

const NOTICE_ICON = { ok: CheckCircle2, error: AlertTriangle, info: Info };

/** Inline notice (sales_manager has no global toaster). Success / info auto-hide. */
export function Notice({ notice, onDismiss }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!notice || notice.tone === "error") return undefined;
    const id = setTimeout(onDismiss, 4500);
    return () => clearTimeout(id);
  }, [notice, onDismiss]);

  if (!notice) return null;
  const Icon = NOTICE_ICON[notice.tone] || Info;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in ${NOTICE_TONE[notice.tone] || NOTICE_TONE.info}`}
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 font-medium">{notice.text}</p>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label={t("common.close")}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Closes on Escape unless `locked`. */
const useEscape = (onEscape, locked) => {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === "Escape" && !locked) onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onEscape, locked]);
};

export function ModalShell({ children, onClose, locked, labelledBy, wide }) {
  useEscape(onClose, locked);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 backdrop-blur-[2px] sm:items-center sm:p-4 animate-fade-in">
      <button
        className="absolute inset-0 cursor-default"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => !locked && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white text-gray-900 shadow-2xl animate-scale-in dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:rounded-2xl ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }) {
  const { t } = useTranslation();
  return (
    <ModalShell onClose={onCancel} locked={busy} labelledBy="ledger-confirm-title">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 id="ledger-confirm-title" className="text-lg font-bold">
              {title}
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} disabled={busy} className={ghostButton}>
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ==================== Entry form page (create / edit) ====================
// Rendered as a full page (not a modal) by `SupplierLedgerEntry.jsx`
// (routes `/suppliers/:supplierId/notes` and `/suppliers/:supplierId/notes/:entryId/edit`).

const initialForm = (entry, type, termsDays) => {
  if (entry) {
    return {
      type: entry.type,
      amount: String(entry.amount ?? ""),
      transaction_date: entry.transaction_date || localToday(),
      due_date: entry.due_date || "",
      reference: entry.reference || "",
      payment_method: entry.payment_method || "cash",
      description: entry.description || "",
      notes: entry.notes || "",
    };
  }
  const today = localToday();
  return {
    type,
    amount: "",
    transaction_date: today,
    due_date: type === "purchase" && termsDays > 0 ? addDays(today, termsDays) : "",
    reference: "",
    payment_method: "cash",
    description: "",
    notes: "",
  };
};

export const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";

/**
 * Create or edit a ledger entry (page layout: fields card + sticky balance / actions panel).
 * @param {object} props.supplier - { id, name, payment_terms }
 * @param {object|null} props.entry - existing entry when editing
 * @param {string} props.initialType - "purchase" | "payment" | "return" (create only)
 * @param {number} props.currentBalance - full-history balance of the supplier
 * @param {() => void} props.onCancel
 * @param {(saved: object, isEdit: boolean) => void} props.onSaved
 */
export function EntryForm({
  supplier,
  entry = null,
  initialType = "purchase",
  currentBalance = 0,
  onCancel,
  onSaved,
}) {
  const { t, tr, money, currency } = useLedgerT();
  const isEdit = Boolean(entry);
  const termsDays = paymentTermsDays(supplier?.payment_terms);
  const [form, setForm] = useState(() => initialForm(entry, initialType, termsDays));
  const [dueAuto, setDueAuto] = useState(!entry);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (
        key === "transaction_date" &&
        dueAuto &&
        next.type === "purchase" &&
        termsDays > 0 &&
        isValidDateString(value)
      ) {
        next.due_date = addDays(value, termsDays);
      }
      return next;
    });
    clearError(key);
    setServerError("");
  };

  const setType = (type) => {
    setForm((prev) => {
      const next = { ...prev, type };
      if (type === "purchase" && dueAuto && !prev.due_date && termsDays > 0) {
        next.due_date = addDays(prev.transaction_date, termsDays);
      }
      return next;
    });
    setErrors({});
    setServerError("");
  };

  const setDue = (value) => {
    setDueAuto(false);
    setField("due_date", value);
  };

  const amountValue = parseAmount(form.amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  // Balance without this entry (when editing, its old effect is removed first)
  const baseBalance = round2(
    (Number(currentBalance) || 0) - (isEdit ? signedAmount(entry.type, entry.amount) : 0),
  );
  const effect = validAmount ? signedAmount(form.type, amountValue) : null;
  const balanceAfter = effect === null ? null : round2(baseBalance + effect);

  const dueChips = [];
  if (termsDays > 0) {
    dueChips.push({ key: "terms", days: termsDays, label: tr("form.dueTerms", { days: termsDays }) });
  }
  for (const days of [30, 60, 90]) {
    if (days !== termsDays) {
      dueChips.push({ key: `d${days}`, days, label: tr("form.plusDays", { count: days }) });
    }
  }

  const validate = () => {
    const next = {};
    if (!validAmount) next.amount = tr("form.errors.amount");
    else if (amountValue > MAX_AMOUNT) next.amount = tr("form.errors.amountTooLarge");
    if (!isValidDateString(form.transaction_date)) next.transaction_date = tr("form.errors.date");
    if (form.type === "purchase" && form.due_date) {
      if (!isValidDateString(form.due_date)) next.due_date = tr("form.errors.date");
      else if (form.due_date < form.transaction_date) next.due_date = tr("form.errors.dueBeforeDate");
    }
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      if (nextErrors.amount) amountRef.current?.focus();
      return;
    }

    const payload = {
      type: form.type,
      amount: round2(amountValue),
      transaction_date: form.transaction_date,
      due_date: form.type === "purchase" && form.due_date ? form.due_date : null,
      reference: form.reference.trim() || null,
      payment_method: form.type === "payment" ? form.payment_method : null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setServerError("");
    try {
      const saved = isEdit
        ? await ledgerApi.update(supplier.id, entry.id, payload)
        : await ledgerApi.create(supplier.id, payload);
      onSaved(saved || { ...payload, id: entry?.id }, isEdit);
    } catch (err) {
      if (err.code === "network") setServerError(tr("errors.network"));
      else if (err.status === 404) setServerError(tr("errors.entryNotFound"));
      else setServerError(`${tr("errors.save")}${err.message ? ` (${err.message})` : ""}`);
      setSaving(false);
    }
  };

  const meta = TYPE_META[form.type] || TYPE_META.purchase;
  const errorText = (key) =>
    errors[key] ? (
      <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{errors[key]}</p>
    ) : null;

  const termsLabel = supplier?.payment_terms
    ? t(
        `suppliersPage.paymentTerms.${String(supplier.payment_terms).replace(/ /g, "").toLowerCase()}`,
        { defaultValue: supplier.payment_terms },
      )
    : "";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="ledger-entry-title"
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]"
    >
      {/* ---------- Main card: fields ---------- */}
      <section className={`${card} overflow-hidden`}>
        <header
          className={`flex items-center gap-4 border-b border-s-4 border-b-gray-100 px-6 py-5 dark:border-b-gray-700 ${meta.rail}`}
        >
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${meta.icon}`}>
            <meta.Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              {supplier?.name}
            </p>
            <h2
              id="ledger-entry-title"
              className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
            >
              {isEdit ? tr("form.editTitle") : tr(`form.newTitle.${form.type}`)}
            </h2>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6">
          {/* Type */}
          <fieldset disabled={saving}>
            <legend className={fieldLabel}>{tr("form.type")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {LEDGER_TYPES.map((type) => {
                const { Icon } = TYPE_META[type];
                const active = form.type === type;
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setType(type)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold transition sm:flex-row sm:justify-center ${
                      active
                        ? TYPE_META[type].active
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {tr(`types.${type}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {tr(`form.typeHint.${form.type}`)}
            </p>
          </fieldset>

          {/* Amount + date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ledger-amount" className={fieldLabel}>
                {tr("form.amount")} *
              </label>
              <div className="relative">
                <input
                  id="ledger-amount"
                  ref={amountRef}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0,00"
                  aria-invalid={Boolean(errors.amount)}
                  className={`${inputClass} pe-14 text-xl font-bold tabular-nums ${errors.amount ? "border-red-400" : ""}`}
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-gray-400">
                  {currency}
                </span>
              </div>
              {errorText("amount")}
              {/* Pay full balance shortcut */}
              {form.type === "payment" && baseBalance > 0 ? (
                <button
                  type="button"
                  onClick={() => setField("amount", baseBalance.toFixed(2))}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  {tr("form.payBalance", { amount: money(baseBalance) })}
                </button>
              ) : null}
            </div>
            <div>
              <label htmlFor="ledger-date" className={fieldLabel}>
                {tr("form.date")} *
              </label>
              <input
                id="ledger-date"
                type="date"
                value={form.transaction_date}
                onChange={(e) => setField("transaction_date", e.target.value)}
                aria-invalid={Boolean(errors.transaction_date)}
                className={`${inputClass} py-3 ${errors.transaction_date ? "border-red-400" : ""}`}
              />
              {errorText("transaction_date")}
            </div>
          </div>

          {/* Due date (purchases) */}
          {form.type === "purchase" ? (
            <div>
              <label htmlFor="ledger-due" className={fieldLabel}>
                {tr("form.dueDate")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="ledger-due"
                  type="date"
                  value={form.due_date}
                  min={form.transaction_date || undefined}
                  onChange={(e) => setDue(e.target.value)}
                  aria-invalid={Boolean(errors.due_date)}
                  className={`${inputClass} sm:max-w-[11rem] ${errors.due_date ? "border-red-400" : ""}`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {dueChips.map((chip) => {
                    const value = isValidDateString(form.transaction_date)
                      ? addDays(form.transaction_date, chip.days)
                      : "";
                    const active = value && form.due_date === value;
                    return (
                      <button
                        type="button"
                        key={chip.key}
                        onClick={() => setDue(value)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          active
                            ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700"
                            : "text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setDue("")}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                      !form.due_date
                        ? "bg-gray-200 text-gray-800 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-500"
                        : "text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {tr("form.noDue")}
                  </button>
                </div>
              </div>
              {errorText("due_date")}
            </div>
          ) : null}

          {/* Payment method */}
          {form.type === "payment" ? (
            <fieldset>
              <legend className={fieldLabel}>{tr("form.method")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((method) => {
                  const active = form.payment_method === method;
                  return (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setField("payment_method", method)}
                      aria-pressed={active}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                        active
                          ? "bg-emerald-700 text-white ring-emerald-700"
                          : "text-gray-700 ring-gray-200 hover:bg-gray-50 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      {tr(`methods.${method}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* Reference + description */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <label htmlFor="ledger-ref" className={fieldLabel}>
                {tr(`form.reference.${form.type}`)}
              </label>
              <input
                id="ledger-ref"
                value={form.reference}
                maxLength={100}
                onChange={(e) => setField("reference", e.target.value)}
                placeholder={tr(`form.referencePlaceholder.${form.type}`)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="ledger-desc" className={fieldLabel}>
                {tr("form.description")}
              </label>
              <input
                id="ledger-desc"
                value={form.description}
                maxLength={500}
                onChange={(e) => setField("description", e.target.value)}
                placeholder={tr("form.descriptionPlaceholder")}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ledger-notes" className={fieldLabel}>
              {tr("form.notes")}
            </label>
            <textarea
              id="ledger-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder={tr("form.notesPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>
      </section>

      {/* ---------- Side panel: balance preview + actions ---------- */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className={`${card} p-5`}>
          <p className={fieldLabel}>{tr("form.preview")}</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">
                {isEdit ? tr("form.balanceWithout") : tr("form.balanceNow")}
              </dt>
              <dd className={`font-semibold tabular-nums ${balanceTextTone(baseBalance)}`}>
                {money(baseBalance)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">{tr("form.thisEntry")}</dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {effect === null ? "—" : `${effect > 0 ? "+" : "−"} ${money(Math.abs(effect))}`}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-dashed border-gray-300 pt-4 dark:border-gray-600">
            <p className="text-xs text-gray-500 dark:text-gray-400">{tr("form.balanceAfter")}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p
                className={`text-2xl font-bold tabular-nums tracking-tight ${balanceAfter === null ? "text-gray-400" : balanceTextTone(balanceAfter)}`}
              >
                {balanceAfter === null ? "—" : money(balanceAfter)}
              </p>
              {balanceAfter === null ? null : <BalancePill balance={balanceAfter} />}
            </div>
          </div>
          {termsLabel ? (
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
              {tr("form.terms", { terms: termsLabel })}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition disabled:opacity-60 ${meta.button}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <meta.Icon className="h-4 w-4" />}
            {saving ? tr("form.saving") : isEdit ? tr("form.saveChanges") : tr("form.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={`${ghostButton} w-full py-2.5`}
          >
            {tr("form.cancel")}
          </button>
        </div>
      </aside>
    </form>
  );
}

