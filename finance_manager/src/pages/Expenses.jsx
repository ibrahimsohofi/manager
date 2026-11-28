// f° II — Dépenses (FINANCE_PLAN.md §8). Everything counted in the period (spread expenses show the share of
// the period), filters in the URL (q, cat, status, page), grouped by day like the lines of an account book.
// The bin (?view=bin) lists deleted expenses, any period, with "Restaurer".
import {
  ArrowLeft,
  ArchiveRestore,
  CalendarClock,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CategoryIcon } from "../components/CategoryIcon";
import { Money } from "../components/Money";
import { EmptyState, ErrorState, PageHeader, Pager } from "../components/PageHeader";
import { PeriodSwitcher } from "../components/PeriodSwitcher";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Segmented, Skeleton } from "../components/ui/segmented";
import { Tip } from "../components/ui/tooltip";
import { useExpenseActions } from "../context/ExpenseActions";
import { useParam, usePeriod } from "../hooks/usePeriod";
import { useResource } from "../hooks/useResource";
import { expensesApi } from "../lib/api";
import { categoryName } from "../lib/categoryIcons";
import { formatDate, formatInt, formatMonth, formatPeriod, formatWeekday, moneyText } from "../lib/format";
import { todayISO } from "../lib/period";
import { cn } from "../lib/utils";

const PAGE_SIZE = 25;

const groupByDay = (rows) => {
  const groups = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.date === row.expense_date) last.rows.push(row);
    else groups.push({ date: row.expense_date, rows: [row] });
  }
  return groups;
};

// ---------------------------------------------------------------------------------------------------------
// Totals strip
// ---------------------------------------------------------------------------------------------------------

const Totals = ({ totals, period }) => {
  const { t, i18n } = useTranslation();
  const cells = [
    { key: "business", value: totals.business },
    { key: "personal", value: totals.personal },
    { key: "paid", value: totals.paid, tone: "gain" },
    { key: "pending", value: totals.pending, tone: totals.pending > 0 ? "due" : "none" },
  ];
  return (
    <section className="paper-card animate-rise-in overflow-hidden" style={{ animationDelay: "80ms" }}>
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
        <div className="ledger-margin relative border-b border-rule/70 py-5 pe-5 ps-14 md:border-b-0 md:border-e">
          <p className="eyebrow">
            {t("expenses.totals.counted")} · {formatPeriod(period, i18n.language)}
          </p>
          <Money value={totals.counted} className="mt-2 font-display text-[2.6rem] leading-none sm:text-[3rem]" />
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="figure font-semibold text-foreground/80">{formatInt(totals.count)}</span>{" "}
            {t("expenses.totals.count").toLowerCase()}
          </p>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {cells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "flex flex-col justify-center gap-1 px-5 py-4",
                index % 2 === 1 && "border-s border-rule/70 sm:border-s",
                index >= 2 && "border-t border-rule/70 sm:border-t-0",
                index === 2 && "sm:border-s",
              )}
            >
              <dt className="eyebrow">{t(`expenses.totals.${cell.key}`)}</dt>
              <dd>
                <Money value={cell.value} tone={cell.tone} className="text-lg font-semibold" />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------------------------------------
// One expense line
// ---------------------------------------------------------------------------------------------------------

const ExpenseRow = ({ expense, bin, index }) => {
  const { t, i18n } = useTranslation();
  const { openEdit, openPay, remove, restore } = useExpenseActions();
  const lang = i18n.language;
  const currency = t("common.currency");
  const pending = expense.status === "pending";
  const counted = expense.period_amount ?? expense.amount;
  const otherMonth = expense.period_month && expense.period_month !== String(expense.expense_date).slice(0, 7);
  const overdue = pending && expense.due_date && expense.due_date < todayISO();
  const meta = [
    categoryName(expense.category, lang),
    expense.payee,
    expense.reference ? `#${expense.reference}` : null,
    otherMonth ? t("expenses.forMonth", { month: formatMonth(expense.period_month, lang) }) : null,
  ].filter(Boolean);

  return (
    <li
      className="animate-rise-in group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-rule/60 px-4 py-3 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-5"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <CategoryIcon category={expense.category} />
      <button
        type="button"
        className="min-w-0 text-start disabled:cursor-default"
        onClick={() => openEdit(expense)}
        disabled={bin}
      >
        <p className="flex items-center gap-2">
          <span className={cn("truncate text-[0.92rem] font-semibold", !bin && "group-hover:underline")}>
            {expense.description || <span className="italic text-muted-foreground">{t("expenses.noDescription")}</span>}
          </span>
          {pending ? (
            <span className={cn("stamp shrink-0", overdue ? "border-loss/70 text-loss" : "border-due/70 text-due")}>
              {t("expenses.stampPending")}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {meta.join(" · ")}
          {pending && expense.due_date ? (
            <span className={cn("ms-1", overdue ? "font-semibold text-loss" : "text-due")}>
              · {t("overview.due", { date: formatDate(expense.due_date, lang) })}
            </span>
          ) : null}
          {bin && expense.deleted_at ? (
            <span className="ms-1 text-loss">
              · {t("expenses.deletedOn", { date: formatDate(String(expense.deleted_at).slice(0, 10), lang) })}
            </span>
          ) : null}
        </p>
      </button>
      <div className="text-end">
        <Money
          value={counted}
          tone={pending ? "due" : "none"}
          className={cn("text-[0.98rem] font-semibold", expense.category?.is_personal && "text-muted-foreground")}
        />
        {expense.spread_months > 1 ? (
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
            {t("expenses.spread", { amount: moneyText(expense.amount, currency), months: expense.spread_months })}
          </p>
        ) : null}
      </div>
      <div className="col-span-3 flex items-center justify-end gap-1 sm:col-span-1">
        {bin ? (
          <Button variant="outline" size="sm" onClick={() => restore(expense)}>
            <ArchiveRestore />
            {t("common.restore")}
          </Button>
        ) : (
          <>
            {pending ? (
              <Button variant="due" size="sm" onClick={() => openPay(expense)}>
                <Wallet />
                {t("overview.pay")}
              </Button>
            ) : null}
            <Tip label={t("common.edit")}>
              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(expense)} aria-label={t("common.edit")}>
                <Pencil />
              </Button>
            </Tip>
            <Tip label={t("common.delete")}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(expense)}
                aria-label={t("common.delete")}
                className="hover:bg-loss-soft hover:text-loss"
              >
                <Trash2 />
              </Button>
            </Tip>
          </>
        )}
      </div>
    </li>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------

export default function Expenses() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [period] = usePeriod();
  const [q, setQ] = useParam("q");
  const [cat, setCat] = useParam("cat");
  const [status, setStatus] = useParam("status");
  const [view, setView] = useParam("view");
  const [pageRaw, setPage] = useParam("page", "1");
  const page = Math.max(1, Number(pageRaw) || 1);
  const bin = view === "bin";
  const { categories, openAdd } = useExpenseActions();

  // Search box: typed locally, pushed to the URL after a short pause.
  const [search, setSearch] = useState(q);
  useEffect(() => {
    const next = search.trim();
    if (next === q) return undefined;
    const timer = window.setTimeout(() => setQ(next), 300);
    return () => window.clearTimeout(timer);
  }, [search, q, setQ]);

  const list = useResource(
    ({ signal }) =>
      expensesApi.list(
        bin
          ? { deleted: 1, q, category_id: cat, page, limit: PAGE_SIZE }
          : { period, q, category_id: cat, status, page, limit: PAGE_SIZE },
        { signal },
      ),
    [bin, period, q, cat, status, page],
  );
  const data = list.data;
  const rows = data?.rows ?? [];
  const groups = useMemo(() => groupByDay(rows), [rows]);
  const filtered = Boolean(q || cat || status);

  const business = categories.filter((category) => !category.is_personal);
  const personal = categories.filter((category) => category.is_personal);
  const option = (category) => (
    <option key={category.id} value={category.id}>
      {categoryName(category, lang)}
      {category.archived ? ` (${t("settings.archived")})` : ""}
    </option>
  );

  const clearFilters = () => {
    setSearch("");
    setQ("");
    setCat("");
    setStatus("");
  };

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader
        folio="II"
        eyebrow={bin ? t("expenses.binTitle") : t("app.tagline")}
        title={bin ? t("expenses.binTitle") : t("expenses.title")}
        subtitle={bin ? t("expenses.binHint") : t("expenses.subtitle", { period: formatPeriod(period, lang) })}
        actions={
          bin ? (
            <Button variant="outline" onClick={() => setView("")}>
              <ArrowLeft className="rtl:rotate-180" />
              {t("expenses.backToList")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setView("bin")}>
                <Trash2 />
                {t("expenses.bin")}
              </Button>
              <Button onClick={() => openAdd()} className="hidden sm:inline-flex">
                <Plus strokeWidth={2.6} />
                {t("expenses.add")}
              </Button>
            </>
          )
        }
      >
        {bin ? null : <PeriodSwitcher />}
      </PageHeader>

      {!bin && data ? <Totals totals={data.totals} period={period} /> : null}
      {!bin && !data && list.loading ? <Skeleton className="h-36 w-full" /> : null}

      {/* Filters */}
      <div className="no-print animate-rise-in flex flex-col gap-2.5 lg:flex-row lg:items-center" style={{ animationDelay: "120ms" }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("expenses.searchPlaceholder")}
            className="ps-9"
            aria-label={t("common.search")}
          />
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <Select
            value={cat}
            onChange={(event) => setCat(event.target.value)}
            className="sm:w-60"
            aria-label={t("dialog.category")}
          >
            <option value="">{t("expenses.allCategories")}</option>
            {business.map(option)}
            {personal.length > 0 ? <optgroup label={t("overview.personalTag")}>{personal.map(option)}</optgroup> : null}
          </Select>
          {bin ? null : (
            <Segmented
              value={status || "all"}
              onChange={(next) => setStatus(next === "all" ? "" : next)}
              ariaLabel={t("expenses.status.all")}
              options={[
                { value: "all", label: t("expenses.status.all") },
                { value: "paid", label: t("expenses.status.paid") },
                { value: "pending", label: t("expenses.status.pending") },
              ]}
            />
          )}
          {filtered ? (
            <Tip label={t("common.close")}>
              <Button variant="ghost" size="icon" onClick={clearFilters} aria-label={t("common.close")}>
                <X />
              </Button>
            </Tip>
          ) : null}
        </div>
      </div>

      {/* List */}
      {list.error && !data ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={bin ? Trash2 : ReceiptText}
          title={bin ? t("expenses.emptyBin") : t("expenses.empty")}
          action={
            bin || filtered ? null : (
              <Button onClick={() => openAdd()}>
                <Plus strokeWidth={2.6} />
                {t("expenses.emptyCta")}
              </Button>
            )
          }
          className="paper-card"
        />
      ) : (
        <div className={cn("space-y-5 transition-opacity", list.loading && "opacity-60")}>
          {groups.map((group) => {
            const dayTotal = group.rows.reduce((acc, row) => acc + Number(row.period_amount ?? row.amount), 0);
            return (
              <section key={group.date} className="paper-card animate-rise-in overflow-hidden">
                <header className="flex items-baseline justify-between gap-3 border-b-2 border-foreground/50 bg-background/50 px-4 py-2 sm:px-5">
                  <h2 className="flex items-baseline gap-2">
                    <span className="display-figure text-[1.65rem]">{String(group.date).slice(8, 10)}</span>
                    <span className="text-sm font-semibold capitalize">{formatDate(group.date, lang, { long: true })}</span>
                    <span className="text-xs capitalize text-muted-foreground">{formatWeekday(group.date, lang)}</span>
                  </h2>
                  <Money value={dayTotal} className="text-xs font-semibold text-muted-foreground" />
                </header>
                <ul>
                  {group.rows.map((expense, index) => (
                    <ExpenseRow key={expense.id} expense={expense} bin={bin} index={index} />
                  ))}
                </ul>
              </section>
            );
          })}
          <Pager page={data.page} pages={data.pages} onChange={(next) => setPage(String(next), { resetPage: false })} />
        </div>
      )}

      {!bin && data && data.totals.pending > 0 && status !== "pending" ? (
        <button
          type="button"
          onClick={() => setStatus("pending")}
          className="no-print flex w-full items-center gap-3 rounded-lg border border-dashed border-due/50 bg-due-soft/50 px-4 py-3 text-start text-sm text-due transition-colors hover:bg-due-soft"
        >
          <CalendarClock className="size-4 shrink-0" />
          <span className="flex-1 font-medium">{t("expenses.status.pending")}</span>
          <Money value={data.totals.pending} className="font-semibold" />
        </button>
      ) : null}
    </div>
  );
}
