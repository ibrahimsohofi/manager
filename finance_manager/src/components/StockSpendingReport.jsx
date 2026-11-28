// Money spent on stock purchases, month by month (FINANCE_PLAN.md §8.1): the JSX port of products_manager
// SpendingReportDialog.tsx. Years -> the 12 months of one year -> the purchase lines of one month
// (StockSpendingMonth.jsx). The figures come from products_manager GET /api/stats/spending*, through the
// finance API (server/models/StockSource.js).
// - Each opening starts again on the period's year and the 12-month table: the body is keyed by an "opening
//   session", detected during render, so the old year is never fetched and the exit animation keeps the
//   last view on screen.
// - Esc inside a month goes back to the 12 months first; a second Esc closes the dialog.
// - Purchases are cash, not an expense (§2).
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResource } from "../hooks/useResource";
import { financeApi } from "../lib/api";
import { formatInt, formatMonth } from "../lib/format";
import { todayISO } from "../lib/period";
import { cn } from "../lib/utils";
import { Money, Pct } from "./Money";
import { ErrorState } from "./PageHeader";
import { StockSpendingMonth } from "./StockSpendingMonth";
import { Button } from "./ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/segmented";

export const monthKeyOf = (year, month) => `${year}-${String(month).padStart(2, "0")}`;

/**
 * @param {{open: boolean, onOpenChange: (open: boolean) => void, initialYear: number, today?: string}} props
 */
export const StockSpendingReport = ({ open, onOpenChange, initialYear, today }) => {
  const { t } = useTranslation();
  // A new session on each opening (set during render, before the body renders with the old state).
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession(session + 1);
  }
  // The body says how to go back from a month; null = on the 12 months, Esc closes.
  const escapeRef = useRef(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        wide
        className="sm:max-w-3xl"
        closeLabel={t("common.close")}
        onEscapeKeyDown={(event) => {
          if (!escapeRef.current) return;
          event.preventDefault();
          escapeRef.current();
        }}
      >
        <DialogHeader className="border-b border-dashed border-rule pb-4">
          <p className="eyebrow flex items-center gap-2">
            <ReceiptText className="size-3.5 text-brand" />
            {t("stock.eyebrow")}
          </p>
          <DialogTitle className="mt-1">{t("stock.report.title")}</DialogTitle>
          <DialogDescription className="max-w-xl">{t("stock.report.description")}</DialogDescription>
        </DialogHeader>
        <ReportBody key={session} initialYear={initialYear} today={today} escapeRef={escapeRef} />
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Body: year switcher + 12 months, or one month
// ---------------------------------------------------------------------------------------------------------

const ReportBody = ({ initialYear, today, escapeRef }) => {
  const todayIso = today || todayISO();
  const currentYear = Number(todayIso.slice(0, 4));
  const currentMonth = Number(todayIso.slice(5, 7));
  const [year, setYear] = useState(() => Math.min(Number(initialYear) || currentYear, currentYear));
  /** 1-12 when a month is open (its purchase lines), null = the 12-month table */
  const [month, setMonth] = useState(null);
  const bodyRef = useRef(null);
  const backRef = useRef(null);
  /** The month to give the focus back to when we return to the table. */
  const returnTo = useRef(null);

  const report = useResource(({ signal }) => financeApi.stockSpending(year, { signal }), [year], {
    reloadOnChange: false,
  });

  const openMonth = (next) => setMonth(next);
  const backToMonths = () => {
    returnTo.current = month;
    setMonth(null);
  };

  // Esc in a month = back to the months (read by the dialog, always the latest closure).
  useEffect(() => {
    escapeRef.current = month === null ? null : backToMonths;
    return () => {
      escapeRef.current = null;
    };
  });

  // Each view starts at the top. Focus: the back button in a month, the month's row on the way back.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    if (month !== null) {
      backRef.current?.focus();
      return;
    }
    if (returnTo.current !== null) {
      bodyRef.current?.querySelector(`[data-month="${returnTo.current}"]`)?.focus();
      returnTo.current = null;
    }
  }, [month]);

  return (
    <DialogBody ref={bodyRef} className="space-y-5 pb-6 pt-4">
      {month !== null ? (
        <StockSpendingMonth year={year} month={month} onBack={backToMonths} backRef={backRef} />
      ) : (
        <YearView
          report={report}
          year={year}
          onYear={setYear}
          currentYear={currentYear}
          currentMonth={currentMonth}
          onOpenMonth={openMonth}
        />
      )}
    </DialogBody>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Year view
// ---------------------------------------------------------------------------------------------------------

const SummaryTile = ({ label, children, loading, highlight = false, className }) => (
  <div
    className={cn(
      "min-w-0 rounded-lg border px-4 py-3",
      highlight
        ? "border-primary bg-primary text-primary-foreground shadow-[inset_0_-2px_0_hsl(0_0%_0%/0.18)]"
        : "bg-background/50",
      className,
    )}
  >
    <p className={cn("truncate text-xs font-medium", highlight ? "opacity-80" : "text-muted-foreground")}>
      {label}
    </p>
    {loading ? (
      <Skeleton className={cn("mt-2 h-6 w-28", highlight && "bg-primary-foreground/25")} />
    ) : (
      <div className="mt-1 text-lg font-semibold leading-tight">{children}</div>
    )}
  </div>
);

const YearView = ({ report, year, onYear, currentYear, currentMonth, onOpenMonth }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Only trust a report of the year on screen.
  const data = report.data?.year === year ? report.data : null;
  const failed = Boolean(report.error) && !report.loading && !data;

  // The server always lists the current year and the requested one, even with no purchases.
  const years = report.data?.years ?? [];
  const minYear = years.length > 0 ? Math.min(...years.map((row) => row.year)) : currentYear;

  const stats = useMemo(() => {
    if (!data) return null;
    const months = data.months;
    const elapsed = year < currentYear ? 12 : year === currentYear ? currentMonth : 0;
    return {
      months,
      max: Math.max(0, ...months.map((m) => m.total)),
      quantity: months.reduce((sum, m) => sum + m.quantity, 0),
      entries: months.reduce((sum, m) => sum + m.entries, 0),
      hasOpening: months.some((m) => m.opening_total > 0),
      average: elapsed > 0 ? data.year_total / elapsed : null,
    };
  }, [data, year, currentYear, currentMonth]);

  return (
    <>
      {/* Year switcher + one chip per year with purchases */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onYear(year - 1)}
            disabled={report.loading || year <= minYear}
            aria-label={t("stock.report.previousYear")}
          >
            <ChevronLeft className="rtl:-scale-x-100" />
          </Button>
          <bdi className="display-figure min-w-[4.5rem] text-center text-[2.1rem]" aria-live="polite">
            {year}
          </bdi>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onYear(year + 1)}
            disabled={report.loading || year >= currentYear}
            aria-label={t("stock.report.nextYear")}
          >
            <ChevronRight className="rtl:-scale-x-100" />
          </Button>
        </div>
        {years.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 sm:ms-auto">
            {years.map((row) => {
              const active = row.year === year;
              return (
                <button
                  key={row.year}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onYear(row.year)}
                  disabled={report.loading && !active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-wait",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-paper text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  <bdi className="figure">{row.year}</bdi>
                  <span aria-hidden className="opacity-50">
                    ·
                  </span>
                  <Money value={row.total} round currency={false} className="opacity-90" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {failed ? (
        <ErrorState error={report.error} onRetry={() => report.reload()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryTile
              label={t("stock.report.yearTotal", { year })}
              loading={!data}
              highlight
              className="col-span-2 sm:col-span-1"
            >
              <Money value={data?.year_total} />
            </SummaryTile>
            <SummaryTile label={t("stock.report.monthlyAverage")} loading={!stats}>
              <Money value={stats?.average} />
            </SummaryTile>
            <SummaryTile label={t("stock.report.allTime")} loading={!data}>
              <Money value={data?.all_time_total} />
            </SummaryTile>
          </div>

          <div className="scrollbar-thin overflow-x-auto rounded-lg border bg-paper">
            <table className="ledger-table min-w-[520px]">
              <thead>
                <tr>
                  <th>{t("stock.report.month")}</th>
                  <th className="num">{t("stock.report.purchases")}</th>
                  <th className="num">{t("stock.report.quantity")}</th>
                  <th className="num">
                    {t("stock.report.amount")} ({t("common.currency")})
                  </th>
                  <th className="hidden w-[24%] sm:table-cell">{t("stock.report.share")}</th>
                </tr>
              </thead>
              <tbody>
                {!stats
                  ? Array.from({ length: 12 }, (_, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                      <tr key={`skeleton-${index}`}>
                        <td colSpan={5}>
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))
                  : stats.months.map((m) => (
                      <MonthRow
                        key={m.month}
                        row={m}
                        year={year}
                        lang={lang}
                        yearTotal={data.year_total}
                        max={stats.max}
                        isCurrent={year === currentYear && m.month === currentMonth}
                        isFuture={year > currentYear || (year === currentYear && m.month > currentMonth)}
                        onOpen={onOpenMonth}
                      />
                    ))}
              </tbody>
              {stats ? (
                <tfoot>
                  <tr>
                    <td className="font-display text-base">{t("stock.report.yearTotal", { year })}</td>
                    <td className="num figure">{formatInt(stats.entries)}</td>
                    <td className="num figure">{formatInt(stats.quantity)}</td>
                    <td className="num">
                      <span className="double-rule inline-block pb-0.5">
                        <Money value={data.year_total} currency={false} />
                      </span>
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {stats && data.year_total === 0 ? (
            <p className="text-center text-sm text-muted-foreground">{t("stock.report.noData", { year })}</p>
          ) : null}
          {stats && stats.entries > 0 ? (
            <p className="no-print flex items-center gap-1.5 text-xs text-muted-foreground">
              <ChevronRight className="size-3.5 text-brand rtl:-scale-x-100" />
              {t("stock.report.clickHint")}
            </p>
          ) : null}
          {stats?.hasOpening ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-brand">* </span>
              {t("stock.report.openingNote")}
            </p>
          ) : null}
        </>
      )}
    </>
  );
};

const MonthRow = ({ row, year, lang, yearTotal, max, isCurrent, isFuture, onOpen }) => {
  const { t } = useTranslation();
  const name = formatMonth(monthKeyOf(year, row.month), lang, { withYear: false });
  const share = yearTotal > 0 ? (row.total / yearTotal) * 100 : 0;
  const bar = max > 0 ? (row.total / max) * 100 : 0;
  // Only a month with purchase lines opens the detail.
  const canOpen = row.entries > 0;
  const label = (
    <>
      <span>{name}</span>
      {row.opening_total > 0 ? <span className="text-brand">*</span> : null}
      {isCurrent ? (
        <span className="rounded-full bg-brand px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide text-brand-foreground">
          {t("stock.report.current")}
        </span>
      ) : null}
    </>
  );

  return (
    <tr
      className={cn(
        isCurrent && "bg-brand-soft/50",
        isFuture && "text-muted-foreground/60",
        // The month button stretches over the whole row (::after).
        canOpen && "group relative cursor-pointer focus-within:bg-accent/45",
      )}
    >
      <td className="font-medium">
        {canOpen ? (
          <button
            type="button"
            data-month={row.month}
            onClick={() => onOpen(row.month)}
            aria-label={t("stock.report.openMonth", {
              month: formatMonth(monthKeyOf(year, row.month), lang),
            })}
            className="inline-flex items-center gap-2 text-start font-medium outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring group-hover:text-primary"
          >
            {label}
            <ChevronRight className="size-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-brand rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </button>
        ) : (
          <span className="inline-flex items-center gap-2">{label}</span>
        )}
      </td>
      <td className="num figure">{row.entries > 0 ? formatInt(row.entries) : "—"}</td>
      <td className="num figure">{row.quantity > 0 ? formatInt(row.quantity) : "—"}</td>
      <td className={cn("num", row.total > 0 ? "font-semibold" : "text-muted-foreground/60")}>
        {row.total > 0 ? <Money value={row.total} currency={false} /> : "—"}
      </td>
      <td className="hidden sm:table-cell">
        {row.total > 0 ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", isCurrent ? "bg-brand" : "bg-primary")}
                style={{ width: `${bar}%` }}
              />
            </div>
            <Pct value={Math.round(share)} className="w-10 text-end text-xs text-muted-foreground" />
          </div>
        ) : null}
      </td>
    </tr>
  );
};
