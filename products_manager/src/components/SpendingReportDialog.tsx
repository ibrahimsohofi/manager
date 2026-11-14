import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ReceiptText,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { SpendingMonthDetail } from "./SpendingMonthDetail";
import { api } from "@/services/api";
import { cn, formatMoney } from "@/lib/utils";
import type { SpendingReportResponse } from "@/types";

interface SpendingReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpendingReportDialog({
  open,
  onOpenChange,
}: SpendingReportDialogProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [year, setYear] = useState(currentYear);
  const [report, setReport] = useState<SpendingReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** 1-12 when a month is opened (purchase lines), null = 12-month table */
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Back to the current year (and the month table) each time the dialog is opened
  useEffect(() => {
    if (open) {
      setYear(new Date().getFullYear());
      setSelectedMonth(null);
    }
  }, [open]);

  const showMonth = (month: number | null) => {
    setSelectedMonth(month);
    // Each view starts at the top of the scrollable body
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the "retry" trigger
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getSpendingReport(year)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setReport(result);
        } else {
          setError(result.error || t("spending.error"));
        }
      })
      .catch((err) => {
        console.error("Error loading spending report:", err);
        if (!cancelled) setError(t("spending.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, year, reloadKey, t]);

  const locale = i18n.language?.startsWith("ar") ? "ar-MA" : "fr-FR";
  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, index) => {
      const name = formatter.format(new Date(2000, index, 1));
      return name.charAt(0).toUpperCase() + name.slice(1);
    });
  }, [locale]);

  // Only trust the report if it matches the year on screen
  const data = report && report.year === year ? report : null;
  const months = data?.months ?? [];
  const maxMonthTotal = Math.max(0, ...months.map((m) => m.total));
  const yearQuantity = months.reduce((sum, m) => sum + m.quantity, 0);
  const yearEntries = months.reduce((sum, m) => sum + m.entries, 0);
  const hasOpening = months.some((m) => m.openingTotal > 0);
  const elapsedMonths =
    year < currentYear ? 12 : year === currentYear ? currentMonth : 0;
  const monthlyAverage =
    data && elapsedMonths > 0 ? data.yearTotal / elapsedMonths : 0;

  const knownYears = report?.years ?? [];
  const minYear = knownYears.length
    ? Math.min(...knownYears.map((y) => y.year))
    : currentYear;
  const currency = t("currency");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl gap-0 p-0 max-h-[92vh] overflow-hidden flex flex-col"
        onEscapeKeyDown={(event) => {
          // In a month detail, Esc goes back to the 12-month table first
          if (selectedMonth !== null) {
            event.preventDefault();
            showMonth(null);
          }
        }}
      >
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-rose-100 dark:border-rose-900/40 text-start sm:text-start">
          <DialogTitle className="flex items-center gap-2 pe-8 text-rose-700 dark:text-rose-400">
            <ReceiptText className="h-5 w-5 shrink-0" />
            {t("spending.title")}
          </DialogTitle>
          <DialogDescription className="pe-8">
            {t("spending.description")}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="overflow-y-auto p-6 space-y-5">
          {selectedMonth !== null ? (
            <SpendingMonthDetail
              year={year}
              month={selectedMonth}
              monthName={monthNames[selectedMonth - 1]}
              onBack={() => showMonth(null)}
            />
          ) : (
          <>
          {/* Year selector */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-rose-200 dark:border-rose-900"
              onClick={() => setYear((y) => y - 1)}
              disabled={loading || year <= minYear}
              aria-label={t("spending.previousYear")}
            >
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <div className="min-w-[5.5rem] text-center text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {year}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-rose-200 dark:border-rose-900"
              onClick={() => setYear((y) => y + 1)}
              disabled={loading || year >= currentYear}
              aria-label={t("spending.nextYear")}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>

            {knownYears.length > 1 && (
              <div className="flex flex-wrap gap-1.5 ms-auto">
                {knownYears.map((item) => (
                  <button
                    key={item.year}
                    type="button"
                    onClick={() => setYear(item.year)}
                    disabled={loading}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                      item.year === year
                        ? "border-rose-700 bg-rose-700 text-white dark:border-rose-500 dark:bg-rose-600"
                        : "border-gray-200 text-gray-600 hover:border-rose-300 hover:text-rose-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-rose-400",
                    )}
                  >
                    {item.year} · {formatMoney(item.total)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
              <p className="mb-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                <RefreshCw className="me-2 h-4 w-4" />
                {t("spending.retry")}
              </Button>
            </div>
          ) : (
            <>
              {/* Totals */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryTile
                  label={t("spending.yearTotal", { year })}
                  value={data ? `${formatMoney(data.yearTotal)} ${currency}` : null}
                  highlight
                />
                <SummaryTile
                  label={t("spending.monthlyAverage")}
                  value={data ? `${formatMoney(monthlyAverage)} ${currency}` : null}
                />
                <SummaryTile
                  label={t("spending.allTime")}
                  value={data ? `${formatMoney(data.allTimeTotal)} ${currency}` : null}
                />
              </div>

              {/* Monthly table */}
              <div className="relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                {loading && data && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
                    <Loader2 className="h-6 w-6 animate-spin text-rose-700 dark:text-rose-400" />
                  </div>
                )}
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                      <th className="px-4 py-2.5 text-start font-medium">
                        {t("spending.month")}
                      </th>
                      <th className="px-4 py-2.5 text-end font-medium">
                        {t("spending.purchases")}
                      </th>
                      <th className="px-4 py-2.5 text-end font-medium">
                        {t("spending.quantity")}
                      </th>
                      <th className="px-4 py-2.5 text-end font-medium">
                        {t("spending.amount")} ({currency})
                      </th>
                      <th className="hidden px-4 py-2.5 text-start font-medium sm:table-cell w-[22%]">
                        {t("spending.share")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {!data
                      ? Array.from({ length: 12 }, (_, index) => (
                          <tr
                            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                            key={`skeleton-${index}`}
                            className="border-b border-gray-100 dark:border-gray-800"
                          >
                            <td className="px-4 py-2.5" colSpan={5}>
                              <Skeleton className="h-4 w-full" />
                            </td>
                          </tr>
                        ))
                      : months.map((m) => {
                          const isFuture =
                            year > currentYear ||
                            (year === currentYear && m.month > currentMonth);
                          const isCurrent =
                            year === currentYear && m.month === currentMonth;
                          const share =
                            data.yearTotal > 0
                              ? (m.total / data.yearTotal) * 100
                              : 0;
                          const barWidth =
                            maxMonthTotal > 0
                              ? (m.total / maxMonthTotal) * 100
                              : 0;
                          // Only months with purchase lines open the detail
                          const canOpen = m.entries > 0;
                          const monthLabel = (
                            <>
                              {monthNames[m.month - 1]}
                              {m.openingTotal > 0 && (
                                <span className="text-rose-600 dark:text-rose-400">
                                  *
                                </span>
                              )}
                              {isCurrent && (
                                <span className="rounded-full bg-rose-700 px-2 py-0.5 text-[10px] font-semibold uppercase text-white dark:bg-rose-600">
                                  {t("spending.current")}
                                </span>
                              )}
                            </>
                          );

                          return (
                            <tr
                              key={m.month}
                              className={cn(
                                "border-b border-gray-100 last:border-0 dark:border-gray-800",
                                isCurrent && "bg-rose-50/70 dark:bg-rose-950/20",
                                isFuture && "text-gray-400 dark:text-gray-600",
                                // The month button stretches over the whole row (::after)
                                canOpen &&
                                  "group relative cursor-pointer transition-colors hover:bg-rose-50 focus-within:bg-rose-50 dark:hover:bg-rose-950/30 dark:focus-within:bg-rose-950/30",
                              )}
                            >
                              <td className="px-4 py-2.5 font-medium">
                                {canOpen ? (
                                  <button
                                    type="button"
                                    onClick={() => showMonth(m.month)}
                                    title={t("spending.detail.openMonth", {
                                      month: monthNames[m.month - 1],
                                      year,
                                    })}
                                    className="inline-flex items-center gap-2 text-start font-medium outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-rose-500 group-hover:text-rose-700 dark:group-hover:text-rose-400"
                                  >
                                    {monthLabel}
                                    <ChevronRight className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-600 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 dark:text-gray-600 dark:group-hover:text-rose-400" />
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center gap-2">
                                    {monthLabel}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-end tabular-nums">
                                {m.entries > 0 ? m.entries : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-end tabular-nums">
                                {m.quantity > 0 ? m.quantity : "—"}
                              </td>
                              <td
                                className={cn(
                                  "px-4 py-2.5 text-end tabular-nums",
                                  m.total > 0
                                    ? "font-semibold text-gray-900 dark:text-gray-100"
                                    : "text-gray-400 dark:text-gray-600",
                                )}
                              >
                                {m.total > 0 ? formatMoney(m.total) : "—"}
                              </td>
                              <td className="hidden px-4 py-2.5 sm:table-cell">
                                {m.total > 0 && (
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                      <div
                                        className="h-full rounded-full bg-rose-600 dark:bg-rose-500"
                                        style={{ width: `${barWidth}%` }}
                                      />
                                    </div>
                                    <span className="w-10 text-end text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                      {Math.round(share)}%
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                  {data && (
                    <tfoot>
                      <tr className="border-t-2 border-rose-200 bg-rose-50 font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                        <td className="px-4 py-3">
                          {t("spending.yearTotal", { year })}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {yearEntries}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {yearQuantity}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {formatMoney(data.yearTotal)}
                        </td>
                        <td className="hidden sm:table-cell" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {data && data.yearTotal === 0 && (
                <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                  {t("spending.noData", { year })}
                </p>
              )}

              {data && yearEntries > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <ChevronRight className="h-3.5 w-3.5 text-rose-600 rtl:rotate-180 dark:text-rose-400" />
                  {t("spending.detail.clickHint")}
                </p>
              )}

              {hasOpening && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="text-rose-600 dark:text-rose-400">* </span>
                  {t("spending.openingNote")}
                </p>
              )}
            </>
          )}
          </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight
          ? "border-rose-700 bg-rose-700 text-white dark:border-rose-600 dark:bg-rose-700"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
      )}
    >
      <p
        className={cn(
          "text-xs font-medium",
          highlight ? "text-rose-100" : "text-gray-500 dark:text-gray-400",
        )}
      >
        {label}
      </p>
      {value === null ? (
        <Skeleton className="mt-1.5 h-6 w-28" />
      ) : (
        <p
          className={cn(
            "mt-0.5 text-lg font-bold tabular-nums",
            highlight ? "text-white" : "text-gray-900 dark:text-gray-100",
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}
