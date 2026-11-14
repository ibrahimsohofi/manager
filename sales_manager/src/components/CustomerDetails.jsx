import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CreditCard,
  HandCoins,
  Hash,
  Heart,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  StickyNote,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { SALES_MANAGER_API, buildUrl } from "../config/integration.js";
import { isAutoCustomerName } from "../lib/customerLabel.js";
import { formatAmount } from "../lib/print.js";

const TICKETS_STEP = 15;
const PAYMENT_KEYS = {
  cash: "cash",
  card: "card",
  credit: "credit",
  check: "check",
  bank_transfer: "transfer",
  transfer: "transfer",
};
const TYPE_STYLES = {
  retail: "bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300",
  wholesale: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300",
  commercial: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/60 dark:text-cyan-300",
};
const TYPE_LABEL_KEYS = {
  retail: "customers.customerTypeRetailBilingual",
  wholesale: "customers.customerTypeWholesaleBilingual",
  commercial: "customers.customerTypeCommercialBilingual",
};

const card =
  "rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800";
const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

const toForm = (customer) => ({
  name: customer?.name || "",
  code: customer?.code || "",
  phone: customer?.phone || "",
  email: customer?.email || "",
  address: customer?.address || "",
  city: customer?.city || "",
  postal_code: customer?.postal_code || "",
  customer_type: customer?.customer_type || "retail",
  credit_limit: customer?.credit_limit ?? 0,
  notes: customer?.notes || "",
});

// Sales lines -> tickets (lines of one QR ticket share the same "ticket" key)
const groupByTicket = (sales) => {
  const groups = new Map();
  for (const line of sales) {
    const key = line.ticket || `S${line.id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        isTicket: String(key).startsWith("TKT-"),
        sale_number: line.sale_number,
        date: line.created_at || line.date,
        payment_method: line.payment_method,
        lines: [],
        total: 0,
        units: 0,
      };
      groups.set(key, group);
    }
    group.lines.push(line);
    group.total += Number(line.totalPrice) || 0;
    group.units += Number(line.quantity) || 0;
  }
  return [...groups.values()];
};

// Local date as YYYY-MM-DD (not toISOString: that is UTC and can be the day before)
const todayValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// Balance > 0: the client owes me; < 0: I owe the client (advance); else settled / no activity
const accountStateOf = (totals) => {
  const balance = Number(totals?.balance) || 0;
  if (balance > 0.005) return "owesMe";
  if (balance < -0.005) return "iOwe";
  return (Number(totals?.total_purchases) || 0) > 0 || (Number(totals?.total_paid) || 0) > 0
    ? "settled"
    : "none";
};

const ACCOUNT_TONES = {
  owesMe: "text-red-600 dark:text-red-400",
  iOwe: "text-amber-600 dark:text-amber-400",
  settled: "text-emerald-600 dark:text-emerald-400",
  none: "text-gray-500 dark:text-gray-400",
};
const ACCOUNT_ICONS = { owesMe: CircleAlert, iOwe: Banknote, settled: CircleCheck, none: Wallet };
// Header badge (on the cyan gradient) - same wording as the customer cards
const ACCOUNT_BADGES = {
  owesMe: { key: "customers.statusUnpaid", style: "bg-red-500 text-white" },
  iOwe: { key: "customers.statusAdvance", style: "bg-amber-300 text-amber-950" },
  settled: { key: "customers.statusPaid", style: "bg-emerald-500 text-white" },
};
const ACCOUNT_PANELS = {
  owesMe: "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  iOwe: "bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  settled:
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  none: "bg-gray-50 text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900/40 dark:text-gray-400 dark:ring-gray-700",
};
const STAT_RINGS = {
  owesMe: "ring-2 ring-red-200 dark:ring-red-900",
  iOwe: "ring-2 ring-amber-200 dark:ring-amber-900",
  settled: "ring-2 ring-emerald-200 dark:ring-emerald-900",
  none: "",
};
const round2 = (value) => Math.round(value * 100) / 100;

const PAYMENT_METHODS = [
  ["cash", "cash"],
  ["check", "check"],
  ["bank_transfer", "transfer"],
];

const emptyEntry = () => ({
  amount: "",
  date: todayValue(),
  method: "cash",
  label: "",
  quantity: "1",
  notes: "",
});

// "12,5" or "12.5" -> 12.5 (NaN when empty / invalid)
const parseAmount = (value) => Number(String(value ?? "").replace(",", ".").trim() || Number.NaN);

function Stat({ icon: Icon, label, value, sub, tone = "text-gray-900 dark:text-white", className = "" }) {
  return (
    <div className={`${card} p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono = false }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className={`break-words text-sm font-medium text-gray-900 dark:text-white ${mono ? "font-mono" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function CustomerDetails() {
  const { t, i18n } = useTranslation();
  const tr = (key, options) => t(`customerDetails.${key}`, options);
  const { customerId } = useParams();
  const locale = i18n.language?.startsWith("ar") ? "ar-MA" : "fr-FR";

  const [overview, setOverview] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | notFound | error
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(toForm(null));
  const [formError, setFormError] = useState(null); // { field, message }
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [visibleTickets, setVisibleTickets] = useState(TICKETS_STEP);
  const [openTickets, setOpenTickets] = useState(() => new Set());
  // Customer account: inline "payment" / "credit" form + two-step delete of a movement
  const [accountMode, setAccountMode] = useState(null); // null | "payment" | "credit"
  const [entry, setEntry] = useState(emptyEntry);
  const [entryError, setEntryError] = useState(null);
  const [entrySaving, setEntrySaving] = useState(false);
  const [confirmKey, setConfirmKey] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [accountError, setAccountError] = useState(null);

  const money = (value) => `${formatAmount(value)} ${t("currency")}`;
  const formatDate = (value, withTime = false) => {
    if (!value) return tr("empty");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  };
  const paymentLabel = (method) => {
    const key = PAYMENT_KEYS[method];
    return key ? tr(`payment.${key}`) : method || tr("empty");
  };

  const load = useCallback(async () => {
    setStatus((current) => (current === "ready" ? current : "loading"));
    try {
      const response = await fetch(
        buildUrl(SALES_MANAGER_API.BASE_URL, `${SALES_MANAGER_API.CUSTOMERS}/${customerId}/overview`),
      );
      if (response.status === 404) {
        setStatus("notFound");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setOverview(data);
      setStatus("ready");
    } catch (error) {
      console.error("Error loading customer overview:", error);
      setStatus("error");
    }
  }, [customerId]);

  useEffect(() => {
    setEditing(false);
    setVisibleTickets(TICKETS_STEP);
    setOpenTickets(new Set());
    setAccountMode(null);
    setConfirmKey(null);
    setAccountError(null);
    load();
  }, [load]);

  // The "Confirm" delete button goes back to a trash icon after a few seconds
  useEffect(() => {
    if (!confirmKey) return;
    const timer = setTimeout(() => setConfirmKey(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmKey]);

  // Hide the "saved" confirmation after a moment
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), 2500);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const tickets = useMemo(() => groupByTicket(overview?.sales || []), [overview]);

  // Payments received (money in) and goods taken on credit (money owed) in one list, newest first
  const movements = useMemo(() => {
    const timeOf = (value) => new Date(value).getTime() || 0;
    const payments = (overview?.payments || []).map((payment) => ({
      key: `p${payment.id}`,
      kind: "payment",
      id: payment.id,
      date: payment.payment_date || payment.created_at,
      created: payment.created_at,
      amount: Number(payment.amount) || 0,
      method: payment.payment_method,
      detail: [payment.reference_number, payment.notes].filter(Boolean).join(" · "),
    }));
    const credits = (overview?.credits || []).map((item) => ({
      key: `c${item.id}`,
      kind: "credit",
      id: item.id,
      date: item.created_at,
      created: item.created_at,
      amount: Number(item.total_price) || 0,
      label: item.product_name,
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unit_price) || 0,
      detail: item.notes || "",
    }));
    return [...payments, ...credits].sort(
      (a, b) => timeOf(b.date) - timeOf(a.date) || timeOf(b.created) - timeOf(a.created),
    );
  }, [overview]);

  const openEntry = (mode) => {
    setAccountMode((current) => (current === mode ? null : mode));
    setEntry(emptyEntry());
    setEntryError(null);
    setAccountError(null);
  };

  const setEntryField = (field) => (event) => {
    setEntry((previous) => ({ ...previous, [field]: event.target.value }));
    if (entryError) setEntryError(null);
  };

  const submitEntry = async (event) => {
    event.preventDefault();
    const amount = parseAmount(entry.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEntryError(tr("account.amountInvalid"));
      return;
    }

    let path = "payments";
    let body = {
      amount: round2(amount),
      payment_date: entry.date || todayValue(),
      payment_method: entry.method,
      notes: entry.notes.trim() || undefined,
    };
    if (accountMode === "credit") {
      const label = entry.label.trim();
      const quantity = Number(String(entry.quantity).trim());
      if (!label) {
        setEntryError(tr("account.labelRequired"));
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        setEntryError(tr("account.quantityInvalid"));
        return;
      }
      path = "products";
      // Goods already taken by the client -> "delivered" (cancelled items are left out of the balance)
      body = {
        product_name: label,
        quantity,
        unit_price: round2(amount),
        status: "delivered",
        notes: entry.notes.trim() || undefined,
      };
    }

    setEntrySaving(true);
    setEntryError(null);
    try {
      const response = await fetch(
        buildUrl(SALES_MANAGER_API.BASE_URL, `${SALES_MANAGER_API.CUSTOMERS}/${customerId}/${path}`),
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("Error saving customer account entry:", data.error || response.status);
        setEntryError(tr("account.saveError"));
        return;
      }
      setAccountMode(null);
      setEntry(emptyEntry());
      await load();
    } catch (error) {
      console.error("Error saving customer account entry:", error);
      setEntryError(tr("account.saveError"));
    } finally {
      setEntrySaving(false);
    }
  };

  // First click arms the button ("Confirm"), second click deletes
  const deleteMovement = async (movement) => {
    if (confirmKey !== movement.key) {
      setConfirmKey(movement.key);
      return;
    }
    setDeletingKey(movement.key);
    setAccountError(null);
    try {
      const path = movement.kind === "payment" ? "payments" : "products";
      const response = await fetch(
        buildUrl(
          SALES_MANAGER_API.BASE_URL,
          `${SALES_MANAGER_API.CUSTOMERS}/${customerId}/${path}/${movement.id}`,
        ),
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setConfirmKey(null);
      await load();
    } catch (error) {
      console.error("Error deleting customer account entry:", error);
      setAccountError(tr("account.deleteError"));
    } finally {
      setDeletingKey(null);
    }
  };

  const startEdit = () => {
    setForm(toForm(overview?.customer));
    setFormError(null);
    setEditing(true);
  };

  const setField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
    if (formError && (formError.field === field || !formError.field)) setFormError(null);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError({ field: "name", message: tr("nameRequired") });
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...form, code: form.code.trim() || null };
      const response = await fetch(
        buildUrl(SALES_MANAGER_API.BASE_URL, `${SALES_MANAGER_API.CUSTOMERS}/${customerId}`),
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409 && data.field === "code" && data.owner) {
          setFormError({
            field: "code",
            message: t("customers.codeDuplicate", { code: body.code, name: data.owner.name, id: data.owner.id }),
          });
        } else {
          setFormError({ field: null, message: data.error || tr("saveError") });
        }
        return;
      }
      // Server returns the stored row
      setOverview((previous) => (previous ? { ...previous, customer: { ...previous.customer, ...data } } : previous));
      setEditing(false);
      setSavedAt(Date.now());
    } catch (error) {
      console.error("Error saving customer:", error);
      setFormError({ field: null, message: tr("saveError") });
    } finally {
      setSaving(false);
    }
  };

  const toggleTicket = (key) =>
    setOpenTickets((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (status === "loading") {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-gray-500 dark:text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
        <p className="font-medium">{tr("loading")}</p>
      </div>
    );
  }

  if (status !== "ready" || !overview) {
    return (
      <div className="p-6 md:p-8">
        <div className={`${card} mx-auto max-w-md p-8 text-center`}>
          <AlertCircle className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
            {status === "notFound" ? tr("notFound") : tr("loadError")}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              to="/customers"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {tr("back")}
            </Link>
            {status === "error" && (
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                <RefreshCw className="h-4 w-4" />
                {tr("retry")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const { customer, totals, topProducts = [] } = overview;
  const isAuto = isAutoCustomerName(customer.name, customer.code);
  const average = totals.purchases_count > 0 ? totals.total_spent / totals.purchases_count : 0;
  const initials = isAuto
    ? "N°"
    : String(customer.name || "?")
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join("")
        .toUpperCase();
  const fieldError = (field) => (formError?.field === field ? formError.message : null);
  const topMax = Math.max(...topProducts.map((p) => p.amount), 1);
  const accountState = accountStateOf(totals);
  const AccountIcon = ACCOUNT_ICONS[accountState];
  const accountBadge = ACCOUNT_BADGES[accountState];
  const balance = Number(totals.balance) || 0;
  const creditPreview = round2((Number(String(entry.quantity).trim()) || 0) * (parseAmount(entry.amount) || 0));

  return (
    <div className="min-h-screen space-y-6 bg-gray-50 p-4 sm:p-6 md:p-8 dark:bg-gray-900">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-700 via-cyan-600 to-teal-600 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -end-20 -top-24 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 end-40 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/customers"
              aria-label={tr("back")}
              className="rounded-lg p-2 hover:bg-white/15"
            >
              <ArrowLeft className="h-6 w-6 rtl:rotate-180" />
            </Link>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-black text-cyan-700 shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold sm:text-3xl">{customer.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                {customer.code && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-white px-2 py-1 font-mono text-cyan-800">
                    <Hash className="h-3 w-3" />
                    {customer.code}
                  </span>
                )}
                {isAuto && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-1">
                    <Sparkles className="h-3 w-3" />
                    {tr("autoClient")}
                  </span>
                )}
                <span className={`rounded-md px-2 py-1 ${TYPE_STYLES[customer.customer_type] || "bg-white/20"}`}>
                  {TYPE_LABEL_KEYS[customer.customer_type] ? t(TYPE_LABEL_KEYS[customer.customer_type]) : customer.customer_type}
                </span>
                {accountBadge && (
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 shadow-sm ${accountBadge.style}`}>
                    <AccountIcon className="h-3 w-3" />
                    {t(accountBadge.key)}
                  </span>
                )}
                {customer.created_at && (
                  <span className="text-white/80">{tr("since", { date: formatDate(customer.created_at) })}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/qr-sale"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm hover:bg-cyan-50"
            >
              <ScanLine className="h-4 w-4" />
              {tr("newSale")}
            </Link>
            <Link
              to={`/customers/${customer.id}/wishlist`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold hover:bg-white/25"
            >
              <Heart className="h-4 w-4" />
              {tr("wishlist")}
            </Link>
          </div>
        </div>
      </div>

      {/* Totals */}
      {/* Spent / paid / balance: Balance = Spent - Paid (> 0 the client owes me, < 0 I owe the client) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Wallet}
          label={tr("money.spent")}
          value={money(totals.total_purchases)}
          sub={
            totals.products_total > 0
              ? tr("money.spentSub", { till: money(totals.total_spent), items: money(totals.products_total) })
              : undefined
          }
        />
        <Stat
          icon={HandCoins}
          label={tr("money.paid")}
          value={money(totals.total_paid)}
          sub={totals.payments_total > 0 ? tr("money.paidSub", { amount: money(totals.payments_total) }) : undefined}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <Stat
          icon={AccountIcon}
          label={tr("money.balance")}
          value={money(Math.abs(balance))}
          sub={tr(`state.${accountState}`)}
          tone={ACCOUNT_TONES[accountState]}
          className={STAT_RINGS[accountState]}
        />
        <Stat
          icon={Receipt}
          label={tr("money.tickets")}
          value={totals.purchases_count}
          sub={tr("money.ticketsSub", { units: tr("units", { count: totals.units }), average: money(average) })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Purchases by ticket */}
        <section className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
              <ShoppingBag className="h-5 w-5 text-gray-400" />
              {tr("purchasesTitle")}
            </h2>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{tr("purchasesCount", { count: tickets.length })}</span>
              {totals.first_purchase && (
                <span className="hidden items-center gap-1 sm:inline-flex">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(totals.first_purchase)} → {formatDate(totals.last_purchase)}
                </span>
              )}
            </div>
          </div>

          {tickets.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Receipt className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{tr("noPurchases")}</p>
              <Link
                to="/qr-sale"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                <ScanLine className="h-4 w-4" />
                {tr("newSale")}
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {tickets.slice(0, visibleTickets).map((ticket) => {
                const open = openTickets.has(ticket.key);
                return (
                  <li key={ticket.key}>
                    <button
                      type="button"
                      onClick={() => toggleTicket(ticket.key)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-5 py-3.5 text-start hover:bg-gray-50 dark:hover:bg-gray-700/40"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          ticket.payment_method === "credit"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                            : "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                        }`}
                      >
                        <Receipt className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {ticket.isTicket ? ticket.key : `${tr("singleSale")} ${ticket.sale_number || ""}`}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(ticket.date, true)} · {tr("lines", { count: ticket.lines.length })} ·{" "}
                          {paymentLabel(ticket.payment_method)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          ticket.payment_method === "credit"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                        }`}
                      >
                        {ticket.payment_method === "credit" ? tr("ticketCredit") : tr("ticketPaid")}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-gray-900 dark:text-white">
                        {money(ticket.total)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <div className="bg-gray-50 px-5 pb-4 pt-1 dark:bg-gray-900/40">
                        <table className="w-full text-sm">
                          <tbody className="divide-y divide-gray-200/70 dark:divide-gray-700">
                            {ticket.lines.map((line) => (
                              <tr key={line.id}>
                                <td className="py-2 pe-3">
                                  <span className="font-medium text-gray-900 dark:text-white">{line.productName}</span>
                                  {line.product_id && (
                                    <span className="ms-1.5 font-mono text-xs text-gray-400">#{line.product_id}</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap py-2 pe-3 text-end tabular-nums text-gray-600 dark:text-gray-400">
                                  {line.quantity} × {formatAmount(line.price)}
                                </td>
                                <td className="whitespace-nowrap py-2 text-end font-semibold tabular-nums text-gray-900 dark:text-white">
                                  {formatAmount(line.totalPrice)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {tickets.length > visibleTickets && (
            <div className="border-t border-gray-100 p-3 text-center dark:border-gray-700">
              <button
                type="button"
                onClick={() => setVisibleTickets((count) => count + TICKETS_STEP)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-900/30"
              >
                {tr("showMore")} ({tickets.length - visibleTickets})
              </button>
            </div>
          )}
        </section>

        <div className="space-y-6">
          {/* Customer account: who owes whom, payments received, goods taken on credit */}
          <section className={`${card} overflow-hidden`}>
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                <Wallet className="h-5 w-5 text-gray-400" />
                {tr("account.title")}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{tr("account.subtitle")}</p>
            </div>

            <div className="space-y-3 px-5 pt-4">
              <div className={`rounded-xl p-4 ${ACCOUNT_PANELS[accountState]}`}>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <AccountIcon className="h-3.5 w-3.5" />
                  {tr(`state.${accountState}`)}
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums">{money(Math.abs(balance))}</p>
              </div>

              {/* Balance = credit sales + goods on credit - payments received */}
              <dl className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600 dark:text-gray-400">{tr("account.creditSales")}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900 dark:text-white" dir="ltr">
                    + {formatAmount(totals.credit_total)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600 dark:text-gray-400">{tr("account.creditItems")}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900 dark:text-white" dir="ltr">
                    + {formatAmount(totals.products_total)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600 dark:text-gray-400">{tr("account.payments")}</dt>
                  <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">
                    − {formatAmount(totals.payments_total)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-dashed border-gray-200 pt-1.5 dark:border-gray-700">
                  <dt className="font-semibold text-gray-800 dark:text-gray-200">{tr("money.balance")}</dt>
                  <dd className={`font-bold tabular-nums ${ACCOUNT_TONES[accountState]}`} dir="ltr">
                    {money(balance)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid grid-cols-2 gap-2 px-5 py-4">
              <button
                type="button"
                onClick={() => openEntry("payment")}
                aria-pressed={accountMode === "payment"}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                  accountMode === "payment"
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                <HandCoins className="h-4 w-4" />
                {tr("account.addPayment")}
              </button>
              <button
                type="button"
                onClick={() => openEntry("credit")}
                aria-pressed={accountMode === "credit"}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  accountMode === "credit"
                    ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                <Plus className="h-4 w-4" />
                {tr("account.addCredit")}
              </button>
            </div>

            {accountMode && (
              <form
                onSubmit={submitEntry}
                noValidate
                className="mx-5 mb-4 space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
              >
                <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white">
                  {accountMode === "payment" ? (
                    <Banknote className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <ShoppingCart className="h-4 w-4 text-amber-600" />
                  )}
                  {accountMode === "payment" ? tr("account.paymentTitle") : tr("account.creditTitle")}
                </p>

                {accountMode === "payment" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-sm font-medium">
                        {tr("account.amount")}
                        <input
                          value={entry.amount}
                          onChange={setEntryField("amount")}
                          inputMode="decimal"
                          autoComplete="off"
                          autoFocus
                          placeholder="0,00"
                          className={`${inputClass} mt-1 tabular-nums`}
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        {tr("account.date")}
                        <input
                          type="date"
                          value={entry.date}
                          max={todayValue()}
                          onChange={setEntryField("date")}
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                    </div>
                    {balance > 0.005 && (
                      <button
                        type="button"
                        onClick={() => {
                          setEntry((previous) => ({ ...previous, amount: balance.toFixed(2) }));
                          setEntryError(null);
                        }}
                        className="text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
                      >
                        {tr("account.payAll", { amount: money(balance) })}
                      </button>
                    )}
                    <label className="block text-sm font-medium">
                      {tr("account.method")}
                      <select value={entry.method} onChange={setEntryField("method")} className={`${inputClass} mt-1`}>
                        {PAYMENT_METHODS.map(([value, key]) => (
                          <option key={value} value={value}>
                            {tr(`payment.${key}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium">
                      {tr("account.label")}
                      <input
                        value={entry.label}
                        onChange={setEntryField("label")}
                        maxLength={255}
                        autoComplete="off"
                        autoFocus
                        placeholder={tr("account.labelPlaceholder")}
                        className={`${inputClass} mt-1`}
                      />
                    </label>
                    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                      <label className="block text-sm font-medium">
                        {tr("account.quantity")}
                        <input
                          value={entry.quantity}
                          onChange={setEntryField("quantity")}
                          inputMode="numeric"
                          autoComplete="off"
                          className={`${inputClass} mt-1 tabular-nums`}
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        {tr("account.unitPrice")}
                        <input
                          value={entry.amount}
                          onChange={setEntryField("amount")}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                          className={`${inputClass} mt-1 tabular-nums`}
                        />
                      </label>
                    </div>
                    <p className="text-end text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                      {tr("account.lineTotal", { amount: money(creditPreview) })}
                    </p>
                  </>
                )}

                <label className="block text-sm font-medium">
                  {tr("account.notes")}
                  <input
                    value={entry.notes}
                    onChange={setEntryField("notes")}
                    maxLength={500}
                    placeholder={tr("account.notesPlaceholder")}
                    className={`${inputClass} mt-1`}
                  />
                </label>

                {entryError && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {entryError}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountMode(null)}
                    disabled={entrySaving}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-200/70 dark:hover:bg-gray-700"
                  >
                    <X className="h-4 w-4" />
                    {tr("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={entrySaving}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                      accountMode === "payment" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {entrySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {entrySaving ? tr("saving") : tr("account.save")}
                  </button>
                </div>
              </form>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700">
              <h3 className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {tr("account.historyTitle")} ({movements.length})
              </h3>
              {accountError && (
                <p role="alert" className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {accountError}
                </p>
              )}
              {movements.length === 0 ? (
                <p className="px-5 pb-6 pt-3 text-center text-sm text-gray-500 dark:text-gray-400">{tr("account.empty")}</p>
              ) : (
                <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto pb-2 dark:divide-gray-700">
                  {movements.map((movement) => {
                    const isPayment = movement.kind === "payment";
                    const armed = confirmKey === movement.key;
                    const deleting = deletingKey === movement.key;
                    const detail = isPayment
                      ? movement.detail
                      : [`${movement.quantity} × ${formatAmount(movement.unitPrice)}`, movement.detail]
                          .filter(Boolean)
                          .join(" · ");
                    return (
                      <li key={movement.key} className="flex items-center gap-3 px-5 py-3">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isPayment
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}
                        >
                          {isPayment ? <Banknote className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                            {isPayment ? `${tr("account.paymentRow")} · ${paymentLabel(movement.method)}` : movement.label}
                          </span>
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(movement.date)}
                            {detail ? ` · ${detail}` : ""}
                          </span>
                        </span>
                        <span
                          dir="ltr"
                          className={`shrink-0 text-sm font-bold tabular-nums ${
                            isPayment ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {isPayment ? "−" : "+"} {formatAmount(movement.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteMovement(movement)}
                          disabled={deleting}
                          aria-label={armed ? tr("account.confirmDelete") : tr("account.delete")}
                          title={armed ? tr("account.confirmDelete") : tr("account.delete")}
                          className={
                            armed
                              ? "shrink-0 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                              : "shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          }
                        >
                          {deleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : armed ? (
                            tr("account.confirmDelete")
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* Info: view / inline edit */}
          <section className={card}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{tr("infoTitle")}</h2>
              {savedAt > 0 && !editing && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  {tr("saved")}
                </span>
              )}
              {!editing && (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {tr("edit")}
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={save} className="space-y-3 p-5" noValidate>
                <label className="block text-sm font-medium">
                  {tr("fields.name")} *
                  <input
                    value={form.name}
                    onChange={setField("name")}
                    maxLength={255}
                    aria-invalid={Boolean(fieldError("name"))}
                    className={`${inputClass} mt-1 ${fieldError("name") ? "border-red-400 focus:ring-red-500" : ""}`}
                  />
                  {fieldError("name") && <span className="mt-1 block text-xs text-red-600">{fieldError("name")}</span>}
                </label>
                <label className="block text-sm font-medium">
                  {tr("fields.code")}
                  <span className="relative mt-1 block">
                    <Hash className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={form.code}
                      onChange={setField("code")}
                      maxLength={50}
                      autoComplete="off"
                      placeholder={t("customers.codePlaceholder")}
                      aria-invalid={Boolean(fieldError("code"))}
                      className={`${inputClass} ps-9 font-mono ${fieldError("code") ? "border-red-400 focus:ring-red-500" : ""}`}
                    />
                  </span>
                  <span
                    className={`mt-1 block text-xs ${fieldError("code") ? "font-semibold text-red-600" : "text-gray-500 dark:text-gray-400"}`}
                  >
                    {fieldError("code") || t("customers.codeHint")}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    {tr("fields.phone")}
                    <input type="tel" value={form.phone} onChange={setField("phone")} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium">
                    {tr("fields.type")}
                    <select value={form.customer_type} onChange={setField("customer_type")} className={`${inputClass} mt-1`}>
                      {Object.entries(TYPE_LABEL_KEYS).map(([value, key]) => (
                        <option key={value} value={value}>
                          {t(key)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  {tr("fields.email")}
                  <input type="email" value={form.email} onChange={setField("email")} className={`${inputClass} mt-1`} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium">
                    {tr("fields.address")}
                    <input value={form.address} onChange={setField("address")} className={`${inputClass} mt-1`} />
                  </label>
                  <label className="block text-sm font-medium">
                    {tr("fields.city")}
                    <input value={form.city} onChange={setField("city")} className={`${inputClass} mt-1`} />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  {tr("fields.creditLimit")}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.credit_limit}
                    onChange={setField("credit_limit")}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <label className="block text-sm font-medium">
                  {tr("fields.notes")}
                  <textarea rows={3} value={form.notes} onChange={setField("notes")} className={`${inputClass} mt-1`} />
                </label>
                {formError && !formError.field && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {formError.message}
                  </p>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="h-4 w-4" />
                    {tr("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {saving ? tr("saving") : tr("save")}
                  </button>
                </div>
              </form>
            ) : (
              <div className="divide-y divide-gray-100 px-5 py-1 dark:divide-gray-700">
                <InfoRow icon={Hash} label={tr("fields.code")} value={customer.code || tr("empty")} mono />
                <InfoRow icon={Phone} label={tr("fields.phone")} value={customer.phone || tr("empty")} />
                <InfoRow icon={Mail} label={tr("fields.email")} value={customer.email || tr("empty")} />
                <InfoRow
                  icon={MapPin}
                  label={tr("fields.address")}
                  value={[customer.address, customer.city, customer.postal_code].filter(Boolean).join(", ") || tr("empty")}
                />
                <InfoRow icon={CreditCard} label={tr("fields.creditLimit")} value={money(customer.credit_limit || 0)} />
                {customer.notes && <InfoRow icon={StickyNote} label={tr("fields.notes")} value={customer.notes} />}
              </div>
            )}
          </section>

          {/* Top products */}
          <section className={card}>
            <h2 className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 text-lg font-bold text-gray-900 dark:border-gray-700 dark:text-white">
              <Package className="h-5 w-5 text-gray-400" />
              {tr("topProducts")}
            </h2>
            {topProducts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{tr("noTopProducts")}</p>
            ) : (
              <ol className="space-y-3 p-5">
                {topProducts.map((product, index) => (
                  <li key={`${product.product_id}-${product.productName}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-gray-900 dark:text-white">
                        <span className="me-1.5 font-mono text-xs text-gray-400">{index + 1}.</span>
                        {product.productName}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatAmount(product.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500"
                        style={{ width: `${Math.max(4, (product.amount / topMax) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {tr("units", { count: product.units })} · {tr("timesBought", { count: product.times })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
