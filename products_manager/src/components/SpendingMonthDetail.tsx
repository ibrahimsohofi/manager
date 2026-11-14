import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { api } from "@/services/api";
import { cn, formatMoney } from "@/lib/utils";
import type {
  SpendingEntriesResponse,
  SpendingSource,
  SpendingSourceFilter,
} from "@/types";

const PAGE_SIZE = 20;

const SOURCE_STYLES: Record<SpendingSource, { dot: string; badge: string }> = {
  restock: {
    dot: "bg-rose-600 dark:bg-rose-500",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
  },
  initial: {
    dot: "bg-amber-500",
    badge:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  opening: {
    dot: "bg-slate-400",
    badge:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
  },
};

/** ISO string, or "2026-03-12 14:05:00" if the driver returns date strings */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

interface SpendingMonthDetailProps {
  year: number;
  /** 1-12 */
  month: number;
  monthName: string;
  onBack: () => void;
}

export function SpendingMonthDetail({
  year,
  month,
  monthName,
  onBack,
}: SpendingMonthDetailProps) {
  const { t, i18n } = useTranslation();
  const [source, setSource] = useState<SpendingSourceFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SpendingEntriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the "retry" trigger
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getSpendingEntries({ year, month, source, page, limit: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setData(result);
          // The API clamps the page (lines removed meanwhile): follow it
          if (result.pagination.currentPage !== page) {
            setPage(result.pagination.currentPage);
          }
        } else {
          setError(result.error || t("spending.detail.error"));
        }
      })
      .catch((err) => {
        console.error("Error loading spending entries:", err);
        if (!cancelled) setError(t("spending.detail.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, month, source, page, reloadKey, t]);

  // Latin digits in both languages, like the amounts
  const locale = `${i18n.language?.startsWith("ar") ? "ar-MA" : "fr-FR"}-u-nu-latn`;
  const { dayFormatter, timeFormatter } = useMemo(
    () => ({
      dayFormatter: new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "short",
      }),
      timeFormatter: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }),
    [locale],
  );

  const changeSource = (next: SpendingSourceFilter) => {
    if (next === source) return;
    setSource(next);
    setPage(1);
  };

  // Only trust data that matches what is on screen
  const current =
    data && data.year === year && data.month === month && data.source === source
      ? data
      : null;
  const currency = t("currency");
  const bySource = current?.bySource ?? data?.bySource ?? [];
  const pagination = current?.pagination;
  const from = pagination
    ? (pagination.currentPage - 1) * pagination.itemsPerPage + 1
    : 0;
  const to = pagination
    ? Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)
    : 0;
  const hasOpening = bySource.some((s) => s.source === "opening");
  const summary = current?.summary ?? data?.summary ?? null;

  return (
    <div className="space-y-5">
      {/* Back + month title */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t("spending.detail.backToMonths")}
          <kbd className="ms-1 hidden rounded border border-rose-200 bg-rose-50 px-1.5 font-mono text-[10px] font-semibold text-rose-700 sm:inline-block dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            Esc
          </kbd>
        </Button>
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {monthName} <span className="tabular-nums">{year}</span>
        </h3>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
          <p className="mb-3 text-sm text-red-700 dark:text-red-300">{error}</p>
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
          {/* Month summary (whole month, whatever the filter) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t("spending.detail.monthTotal")}
              value={summary ? `${formatMoney(summary.total)} ${currency}` : null}
              highlight
              className="col-span-2 sm:col-span-1"
            />
            <StatTile
              label={t("spending.purchases")}
              value={summary ? String(summary.entries) : null}
            />
            <StatTile
              label={t("spending.detail.quantityBought")}
              value={summary ? String(summary.quantity) : null}
            />
            <StatTile
              label={t("spending.detail.products")}
              value={summary ? String(summary.products) : null}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          {/* Source filter (only useful with 2+ sources) */}
          {summary && bySource.length > 1 && (
            <fieldset
              aria-label={t("spending.detail.filterLabel")}
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              <span className="me-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("spending.detail.filterLabel")}
              </span>
              <SourceChip
                active={source === "all"}
                disabled={loading}
                onClick={() => changeSource("all")}
                label={t("spending.detail.all")}
                amount={summary.total}
              />
              {bySource.map((item) => (
                <SourceChip
                  key={item.source}
                  active={source === item.source}
                  disabled={loading}
                  onClick={() => changeSource(item.source)}
                  label={t(`spending.detail.source.${item.source}`)}
                  amount={item.total}
                  dotClassName={SOURCE_STYLES[item.source]?.dot}
                />
              ))}
            </fieldset>
          )}

          {/* Purchase lines */}
          <div className="relative overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {loading && current && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
                <Loader2 className="h-6 w-6 animate-spin text-rose-700 dark:text-rose-400" />
              </div>
            )}
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("spending.detail.date")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("spending.detail.product")}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {t("spending.detail.origin")}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t("spending.quantity")}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t("spending.detail.unitCost")}
                  </th>
                  <th className="px-4 py-2.5 text-end font-medium">
                    {t("spending.amount")} ({currency})
                  </th>
                </tr>
              </thead>
              <tbody>
                {!current ? (
                  Array.from({ length: 8 }, (_, index) => (
                    <tr
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                      key={`skeleton-${index}`}
                      className="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td className="px-4 py-3" colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : current.entries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400"
                    >
                      {t("spending.detail.noEntries")}
                    </td>
                  </tr>
                ) : (
                  current.entries.map((entry) => {
                    const date = parseDate(entry.purchased_at);
                    const name =
                      entry.product_name ||
                      entry.current_name ||
                      t("spending.detail.unknownProduct");
                    const deleted = entry.product_id !== null && !entry.product_exists;
                    const style = SOURCE_STYLES[entry.source];

                    return (
                      <tr
                        key={entry.id}
                        className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {date ? (
                            <>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {dayFormatter.format(date)}
                              </span>
                              <span className="ms-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                {timeFormatter.format(date)}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span
                              className={cn(
                                "font-medium",
                                deleted
                                  ? "text-gray-500 line-through decoration-gray-400 dark:text-gray-400"
                                  : "text-gray-900 dark:text-gray-100",
                              )}
                            >
                              {name}
                            </span>
                            {entry.product_id !== null && (
                              <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
                                #{entry.product_id}
                              </span>
                            )}
                            {deleted && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                {t("spending.detail.deleted")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                              style?.badge ??
                                "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300",
                            )}
                          >
                            <span
                              className={cn("h-1.5 w-1.5 rounded-full", style?.dot ?? "bg-gray-400")}
                            />
                            {t(`spending.detail.source.${entry.source}`, entry.source)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-end tabular-nums">
                          {entry.quantity}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-end tabular-nums text-gray-600 dark:text-gray-300">
                          {formatMoney(entry.unit_cost)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-end font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                          {formatMoney(entry.total_cost)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {current && current.filtered.entries > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-rose-200 bg-rose-50 font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    <td className="px-4 py-3" colSpan={3}>
                      {source === "all"
                        ? t("spending.detail.monthTotal")
                        : t("spending.detail.filteredTotal", {
                            source: t(`spending.detail.source.${source}`),
                          })}
                      <span className="ms-2 text-xs font-medium text-rose-700/80 dark:text-rose-300/80">
                        ({t("spending.detail.lines", { count: current.filtered.entries })})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      {current.filtered.quantity}
                    </td>
                    <td />
                    <td className="whitespace-nowrap px-4 py-3 text-end tabular-nums">
                      {formatMoney(current.filtered.total)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalItems > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="tabular-nums">
                {t("spending.detail.showing", {
                  from,
                  to,
                  total: pagination.totalItems,
                })}
              </span>
              {pagination.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-rose-200 dark:border-rose-900"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={loading || !pagination.hasPrevPage}
                    aria-label={t("spending.detail.previousPage")}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  <span className="min-w-[6rem] text-center font-medium tabular-nums text-gray-900 dark:text-gray-100">
                    {t("spending.detail.page", {
                      page: pagination.currentPage,
                      pages: pagination.totalPages,
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-rose-200 dark:border-rose-900"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={loading || !pagination.hasNextPage}
                    aria-label={t("spending.detail.nextPage")}
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {hasOpening && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <span className="text-rose-600 dark:text-rose-400">* </span>
              {t("spending.detail.source.opening")} : {t("spending.openingNote")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight = false,
  className,
}: {
  label: string;
  value: string | null;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        highlight
          ? "border-rose-700 bg-rose-700 text-white dark:border-rose-600 dark:bg-rose-700"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800",
        className,
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
        <Skeleton className="mt-1.5 h-6 w-20" />
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

function SourceChip({
  active,
  disabled,
  onClick,
  label,
  amount,
  dotClassName,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  amount: number;
  dotClassName?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-wait",
        active
          ? "border-rose-700 bg-rose-700 text-white dark:border-rose-500 dark:bg-rose-600"
          : "border-gray-200 text-gray-600 hover:border-rose-300 hover:text-rose-700 dark:border-gray-700 dark:text-gray-300 dark:hover:text-rose-400",
      )}
    >
      {dotClassName && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-white" : dotClassName,
          )}
        />
      )}
      {label}
      <span className="tabular-nums opacity-80">· {formatMoney(amount)}</span>
    </button>
  );
}
