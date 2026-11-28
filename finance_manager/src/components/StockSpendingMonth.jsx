// The purchase lines of one month (FINANCE_PLAN.md §8.1): the JSX port of products_manager
// SpendingMonthDetail.tsx, shown inside StockSpendingReport. Data: products_manager
// GET /api/stats/spending/entries through the finance API.
// - The 4 tiles and the origin chips cover the whole month, whatever the filter; the table, its total and the
//   pager follow the filter.
// - The server clamps the page when lines vanished meanwhile: the pager follows it.
// - While another page / filter loads, the previous lines stay on screen, dimmed (no flash).
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResource } from "../hooks/useResource";
import { financeApi } from "../lib/api";
import { formatInt, formatMonth, formatStamp } from "../lib/format";
import { cn } from "../lib/utils";
import { Money } from "./Money";
import { ErrorState } from "./PageHeader";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/segmented";

const PAGE_SIZE = 20;

/** Origin of a purchase line: restock (navy), new product (orange), opening stock (grey). */
const SOURCE_STYLES = {
  restock: { dot: "bg-primary", badge: "border-primary/25 bg-accent/70 text-accent-foreground" },
  initial: { dot: "bg-brand", badge: "border-brand/35 bg-brand-soft text-due" },
  opening: { dot: "bg-muted-foreground/60", badge: "border-rule bg-secondary text-muted-foreground" },
};
const FALLBACK_STYLE = { dot: "bg-muted-foreground/60", badge: "border-rule text-muted-foreground" };

const pad2 = (n) => String(n).padStart(2, "0");

const StatTile = ({ label, children, loading, highlight = false, className }) => (
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
      <Skeleton className={cn("mt-2 h-6 w-20", highlight && "bg-primary-foreground/25")} />
    ) : (
      <div className="mt-1 text-lg font-semibold leading-tight">{children}</div>
    )}
  </div>
);

const SourceChip = ({ active, disabled, onClick, label, amount, dotClassName }) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-wait",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-paper text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    )}
  >
    {dotClassName ? (
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", active ? "bg-primary-foreground" : dotClassName)}
      />
    ) : null}
    {label}
    <span aria-hidden className="opacity-50">
      ·
    </span>
    <Money value={amount} round currency={false} className="opacity-90" />
  </button>
);

/**
 * @param {{year: number, month: number, onBack: () => void, backRef?: React.Ref<HTMLButtonElement>}} props
 */
export const StockSpendingMonth = ({ year, month, onBack, backRef }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  /** "all" | "restock" | "initial" | "opening" */
  const [source, setSource] = useState("all");
  const [page, setPage] = useState(1);

  const entries = useResource(
    async ({ signal }) => {
      const result = await financeApi.stockSpendingEntries(
        { year, month, source, page, limit: PAGE_SIZE },
        { signal },
      );
      // Remember what was asked: the answer's page can differ (clamped by the server).
      return { ...result, request: { source, page } };
    },
    [year, month, source, page],
    { reloadOnChange: false },
  );

  const data = entries.data;
  // Same month: the tiles and chips can use it, whatever the filter / page.
  const sameMonth = data && data.year === year && data.month === month ? data : null;
  // Exactly what is on screen: the table can trust it.
  const current =
    sameMonth && sameMonth.request.source === source && sameMonth.request.page === page ? sameMonth : null;
  const shown = current ?? sameMonth;
  const failed = Boolean(entries.error) && !entries.loading && !current;

  // The server clamped the page (lines removed meanwhile): follow it.
  useEffect(() => {
    if (current && current.page !== page) setPage(current.page);
  }, [current, page]);

  const changeSource = (next) => {
    if (next === source) return;
    setSource(next);
    setPage(1);
  };

  const summary = sameMonth?.summary ?? null;
  const bySource = sameMonth?.by_source ?? [];
  const hasOpening = bySource.some((row) => row.source === "opening");
  const sourceLabel = (value) => t(`stock.month.source.${value}`, { defaultValue: value });
  const from = current && current.total > 0 ? (current.page - 1) * current.limit + 1 : 0;
  const to = current ? Math.min(current.page * current.limit, current.total) : 0;

  return (
    <div className="space-y-5">
      {/* Back + month title */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button ref={backRef} variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="rtl:-scale-x-100" />
          {t("stock.month.backToMonths")}
          <kbd className="ms-0.5 hidden rounded border border-rule bg-secondary px-1.5 font-mono text-[0.62rem] font-semibold text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </Button>
        <h3 className="font-display text-[1.7rem] leading-tight tracking-tight">
          {formatMonth(`${year}-${pad2(month)}`, lang)}
        </h3>
      </div>

      {failed ? (
        <ErrorState error={entries.error} onRetry={() => entries.reload()} />
      ) : (
        <>
          {/* The whole month, whatever the filter */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t("stock.month.monthTotal")}
              loading={!summary}
              highlight
              className="col-span-2 sm:col-span-1"
            >
              <Money value={summary?.total} />
            </StatTile>
            <StatTile label={t("stock.report.purchases")} loading={!summary}>
              <bdi className="figure">{formatInt(summary?.entries)}</bdi>
            </StatTile>
            <StatTile label={t("stock.month.quantityBought")} loading={!summary}>
              <bdi className="figure">{formatInt(summary?.quantity)}</bdi>
            </StatTile>
            <StatTile label={t("stock.month.products")} loading={!summary}>
              <bdi className="figure">{formatInt(summary?.products)}</bdi>
            </StatTile>
          </div>

          {/* Origin filter (only useful with 2+ origins) */}
          {summary && bySource.length > 1 ? (
            <fieldset
              aria-label={t("stock.month.filterLabel")}
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              <span className="me-1 text-xs font-medium text-muted-foreground">
                {t("stock.month.filterLabel")}
              </span>
              <SourceChip
                active={source === "all"}
                disabled={entries.loading}
                onClick={() => changeSource("all")}
                label={t("stock.month.all")}
                amount={summary.total}
              />
              {bySource.map((row) => (
                <SourceChip
                  key={row.source}
                  active={source === row.source}
                  disabled={entries.loading}
                  onClick={() => changeSource(row.source)}
                  label={sourceLabel(row.source)}
                  amount={row.total}
                  dotClassName={(SOURCE_STYLES[row.source] ?? FALLBACK_STYLE).dot}
                />
              ))}
            </fieldset>
          ) : null}

          {/* Purchase lines */}
          <div
            className={cn(
              "scrollbar-thin overflow-x-auto rounded-lg border bg-paper transition-opacity",
              entries.loading && shown && "opacity-60",
            )}
            aria-busy={entries.loading}
          >
            <table className="ledger-table min-w-[640px]">
              <thead>
                <tr>
                  <th>{t("stock.month.date")}</th>
                  <th>{t("stock.month.product")}</th>
                  <th>{t("stock.month.origin")}</th>
                  <th className="num">{t("stock.report.quantity")}</th>
                  <th className="num">{t("stock.month.unitCost")}</th>
                  <th className="num">
                    {t("stock.report.amount")} ({t("common.currency")})
                  </th>
                </tr>
              </thead>
              <tbody>
                {!shown ? (
                  Array.from({ length: 8 }, (_, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                    <tr key={`skeleton-${index}`}>
                      <td colSpan={6}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : shown.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {t("stock.month.noEntries")}
                    </td>
                  </tr>
                ) : (
                  shown.rows.map((row) => (
                    <EntryRow key={row.id} row={row} lang={lang} sourceLabel={sourceLabel} />
                  ))
                )}
              </tbody>
              {current && current.filtered.entries > 0 ? (
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      <span className="font-display text-base">
                        {source === "all"
                          ? t("stock.month.monthTotal")
                          : t("stock.month.filteredTotal", { source: sourceLabel(source) })}
                      </span>
                      <span className="ms-2 text-xs font-medium text-muted-foreground">
                        ({t("stock.month.lines", { count: current.filtered.entries })})
                      </span>
                    </td>
                    <td className="num figure">{formatInt(current.filtered.quantity)}</td>
                    <td />
                    <td className="num">
                      <span className="double-rule inline-block pb-0.5">
                        <Money value={current.filtered.total} currency={false} />
                      </span>
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          {/* Pager */}
          {current && current.total > 0 ? (
            <div className="no-print flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <bdi className="figure text-xs">
                {t("stock.month.showing", { from, to, total: current.total })}
              </bdi>
              {current.pages > 1 ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage(Math.max(1, current.page - 1))}
                    disabled={entries.loading || current.page <= 1}
                    aria-label={t("common.previous")}
                  >
                    <ChevronLeft className="rtl:-scale-x-100" />
                  </Button>
                  <span className="figure min-w-[6.5rem] text-center text-xs font-semibold text-foreground">
                    {t("common.pageOf", { page: current.page, pages: current.pages })}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPage(current.page + 1)}
                    disabled={entries.loading || current.page >= current.pages}
                    aria-label={t("common.next")}
                  >
                    <ChevronRight className="rtl:-scale-x-100" />
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasOpening ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-brand">* </span>
              {sourceLabel("opening")} : {t("stock.report.openingNote")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

const EntryRow = ({ row, lang, sourceLabel }) => {
  const { t } = useTranslation();
  const stamp = formatStamp(row.purchased_at, lang);
  const name = row.product_name || row.current_name || t("stock.month.unknownProduct");
  const deleted = row.product_id !== null && !row.product_exists;
  // The name frozen on the purchase day; the product may have been renamed since.
  const renamed = Boolean(row.product_name && row.current_name && row.current_name !== row.product_name);
  const style = SOURCE_STYLES[row.source] ?? FALLBACK_STYLE;

  return (
    <tr>
      <td>
        {stamp ? (
          <>
            <span className="font-medium">{stamp.day}</span>
            <bdi className="figure ms-2 text-xs text-muted-foreground">{stamp.time}</bdi>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className="max-w-[16rem] whitespace-normal">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "font-medium",
              deleted && "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
            title={renamed ? row.current_name : undefined}
          >
            {name}
          </span>
          {row.product_id !== null ? (
            <bdi className="figure text-[0.68rem] text-muted-foreground/80">#{row.product_id}</bdi>
          ) : null}
          {deleted ? (
            <span className="rounded bg-secondary px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">
              {t("stock.month.deleted")}
            </span>
          ) : null}
        </div>
      </td>
      <td>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
            style.badge,
          )}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
          {sourceLabel(row.source)}
        </span>
      </td>
      <td className="num figure">{formatInt(row.quantity)}</td>
      <td className="num text-muted-foreground">
        <Money value={row.unit_cost} currency={false} />
      </td>
      <td className="num font-semibold">
        <Money value={row.total_cost} currency={false} />
      </td>
    </tr>
  );
};
