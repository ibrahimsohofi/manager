// Stock & achats (FINANCE_PLAN.md §8.1, decision 21): the stock value at sale / purchase price and the money
// spent on purchases, moved here from the products_manager home page. The data stays in products_manager:
// the finance API reads its GET /api/stats* for us (server/models/StockSource.js).
// - Stock values are a live snapshot (the catalogue keeps no history): always "today", whatever the period.
// - The purchases card follows the period: the selected month + its year (a year period: the year + all time).
// - Products API down: an "unavailable" panel whose retry skips the server's fail-fast window.
// - Purchases are cash, not an expense (§2): nothing here enters the profit.
import { ChevronRight, Info, PackageOpen, ReceiptText, RefreshCw, Unplug } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResource } from "../hooks/useResource";
import { financeApi } from "../lib/api";
import { formatMonth, formatStamp } from "../lib/format";
import { isYearKey, todayISO, yearOf } from "../lib/period";
import { cn } from "../lib/utils";
import { Money, Pct } from "./Money";
import { ErrorState } from "./PageHeader";
import { StockSpendingReport } from "./StockSpendingReport";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/segmented";
import { Tip } from "./ui/tooltip";

const delay = (ms) => ({ animationDelay: `${ms}ms` });

// 3 columns only from xl: with the 16.5rem sidebar, a third of the page at lg (~215px) is too narrow for
// figures that never wrap. Below xl: sale + cost side by side, the purchases card on its own row.
const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-12";
const THIRD = "xl:col-span-4";
const WIDE_THIRD = "sm:col-span-2 xl:col-span-4";
/** Main figure of a value card: rounded (the cents live in the report), larger on wider screens. */
const FIGURE = "text-[1.6rem] font-semibold leading-none sm:text-[1.85rem]";

/**
 * Stock summary of a period. Expense edits never change it, so it does not reload on data changes.
 * `refresh()` asks the finance API to call the products API right now, even inside the fail-fast window
 * that follows a failure (`?refresh=1`).
 */
export const useStockSummary = (period) => {
  const refreshNext = useRef(false);
  const resource = useResource(
    ({ signal }) => {
      const refresh = refreshNext.current;
      refreshNext.current = false;
      return financeApi.stock(period, { refresh }, { signal });
    },
    [period],
    { reloadOnChange: false },
  );
  const { reload } = resource;
  const refresh = useCallback(() => {
    refreshNext.current = true;
    reload();
  }, [reload]);
  return { ...resource, refresh };
};

/** Three card placeholders, also used by the overview's first-load skeleton. */
export const StockCardsSkeleton = () => (
  <div className={GRID}>
    <Skeleton className={cn("h-44", THIRD)} />
    <Skeleton className={cn("h-44", THIRD)} />
    <Skeleton className={cn("h-44", WIDE_THIRD)} />
  </div>
);

/** Small coloured square: ties a figure to its segment in the stock bar, so the bar needs no legend. */
const Swatch = ({ className }) => (
  <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-[2px]", className)} />
);

const LiveBadge = () => {
  const { t } = useTranslation();
  // A button (not a span) so the keyboard reaches the tooltip too.
  return (
    <Tip label={t("stock.liveHint")}>
      <button
        type="button"
        className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-gain/30 bg-gain-soft/60 px-2 py-0.5 text-[0.7rem] font-semibold text-gain outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-gain opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-gain" />
        </span>
        {t("stock.live")}
      </button>
    </Tip>
  );
};

// ---------------------------------------------------------------------------------------------------------
// The three cards
// ---------------------------------------------------------------------------------------------------------

const SaleValueCard = ({ data }) => {
  const { t } = useTranslation();
  return (
    <article
      className={cn("paper-card animate-rise-in flex flex-col overflow-hidden px-5 pt-4", THIRD)}
      style={delay(40)}
    >
      <p className="eyebrow flex items-center gap-2">
        <Swatch className="bg-foreground/80" />
        {t("stock.saleValue")}
      </p>
      <Money value={data.stock_sale_value} round className={cn("mt-4", FIGURE)} />
      {/* mb-4 + mt-auto below: at least 1rem of air, the rest pushes the ruled footer down. */}
      <p className="mb-4 mt-2 text-xs text-muted-foreground">{t("stock.saleValueDesc")}</p>
      {/* Two empty ledger lines, like the hero's ruled paper: keeps the card as tall as its neighbours. */}
      <div aria-hidden className="ledger-rules -mx-5 mt-auto h-[2.75rem] opacity-70" />
    </article>
  );
};

const CostValueCard = ({ data }) => {
  const { t } = useTranslation();
  const sale = Number(data.stock_sale_value) || 0;
  const cost = Number(data.stock_cost_value) || 0;
  const margin = data.potential_margin;
  const loss = margin !== null && margin < 0;
  // Bar = the sale value; navy = what it cost, green = the potential margin on top.
  const costShare = sale > 0 ? Math.min(100, Math.max(0, (cost / sale) * 100)) : null;
  return (
    <article
      className={cn("paper-card animate-rise-in flex flex-col px-5 pb-4 pt-4", THIRD)}
      style={delay(90)}
    >
      <p className="eyebrow flex items-center gap-2">
        <Swatch className="bg-primary" />
        {t("stock.costValue")}
      </p>
      <Money value={data.stock_cost_value} round className={cn("mt-4", FIGURE)} />
      <p className="mb-4 mt-2 text-xs text-muted-foreground">{t("stock.costValueDesc")}</p>
      <div className="mt-auto border-t border-dashed border-rule pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-[0.8rem] text-foreground/80">
            <Swatch className={loss ? "bg-loss" : "bg-gain"} />
            {t("stock.potentialMargin")}
          </span>
          <span className="inline-flex items-baseline gap-2">
            <Money
              value={margin}
              round
              tone={loss ? "loss" : "gain"}
              className="text-[0.95rem] font-semibold"
            />
            {data.potential_margin_pct === null ? null : (
              <Pct value={data.potential_margin_pct} className="text-xs text-muted-foreground" />
            )}
          </span>
        </div>
        {costShare === null ? null : (
          <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full bg-primary transition-[width] duration-700"
              style={{ width: `${costShare}%` }}
            />
            <div className={cn("h-full flex-1", loss ? "bg-loss/70" : "bg-gain")} />
          </div>
        )}
      </div>
    </article>
  );
};

const SpendingCard = ({ data, onOpen }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const s = data.spending;
  const yearLabel = t("stock.report.yearTotal", { year: s.year });
  // Month period: this month | its year. Year period: the year moves up, all time beside it.
  const figures = s.month
    ? [
        { label: formatMonth(s.month, lang), value: s.month_total },
        { label: yearLabel, value: s.year_total },
      ]
    : [
        { label: yearLabel, value: s.year_total },
        { label: t("stock.allTime"), value: s.all_time },
      ];
  return (
    <article
      className={cn(
        "paper-card animate-rise-in group flex flex-col transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-[0_18px_36px_-20px_hsl(var(--brand)/0.45)]",
        WIDE_THIRD,
      )}
      style={delay(140)}
    >
      <div className="flex items-start gap-3 px-5 pt-4">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <ReceiptText className="size-[1.1rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{t("stock.spent")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("stock.spentDesc")}</p>
        </div>
      </div>
      {/* Two halves; border-s keeps the divider between them in RTL too. Rounded figures: "71 900 DH" fits
          half of the narrowest card (xl, a third of the row); the cents are in the report. */}
      <div className="mb-4 grid grid-cols-2 px-5 pt-4">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={cn("min-w-0", index === 0 ? "pe-3" : "border-s border-dashed border-rule ps-4")}
          >
            <p className="truncate text-xs text-muted-foreground">{figure.label}</p>
            <Money
              value={figure.value}
              round
              className={cn(
                "mt-1.5 text-[1.4rem] font-semibold leading-none sm:text-[1.6rem] xl:text-[1.25rem] 2xl:text-[1.45rem]",
                index === 1 && "text-foreground/75",
              )}
            />
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-dashed border-rule px-5 py-3">
        <p className="inline-flex items-start gap-1.5 text-[0.72rem] font-medium leading-snug text-due">
          <Info className="mt-px size-3.5 shrink-0" />
          {t("stock.notExpense")}
        </p>
        {/* Stretched button: the whole card opens the report, with a real button for the keyboard. */}
        <button
          type="button"
          onClick={onOpen}
          className="no-print inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] group-hover:underline"
        >
          {t("stock.details")}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </button>
      </div>
    </article>
  );
};

const Unavailable = ({ onRetry, retrying }) => {
  const { t } = useTranslation();
  return (
    <div className="paper-card animate-rise-in flex flex-col items-start gap-4 border-dashed px-5 py-5 sm:flex-row sm:items-center">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-due/50 text-due">
        <Unplug className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl leading-tight">{t("stock.unavailableTitle")}</p>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("stock.unavailableText")}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={cn(retrying && "animate-spin")} />
        {t("common.retry")}
      </Button>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Block
// ---------------------------------------------------------------------------------------------------------

/**
 * @param {{stock: ReturnType<typeof useStockSummary>, period: string, today?: string, className?: string,
 *   style?: object}} props
 */
export const StockBlock = ({ stock, period, today, className, style }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [reportOpen, setReportOpen] = useState(false);
  const todayIso = today || todayISO();
  const currentYear = Number(todayIso.slice(0, 4));
  const data = stock.data;
  const available = data?.available === true;
  const stamp = available ? formatStamp(data.as_of, lang) : null;
  // The snapshot is "today": say so in plain text when another period is on screen.
  const isNow = isYearKey(period) ? period === todayIso.slice(0, 4) : period === todayIso.slice(0, 7);
  // The report opens on the period's year (a future year: the current one).
  const reportYear = Math.min(Number(yearOf(period)) || currentYear, currentYear);

  return (
    <section className={cn("animate-rise-in", className)} style={style} aria-labelledby="stock-block-title">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-2">
            <PackageOpen className="size-3.5" />
            {t("stock.eyebrow")}
          </p>
          <h2 id="stock-block-title" className="mt-1 font-display text-[1.9rem] leading-tight tracking-tight">
            {t("stock.title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          {available ? <LiveBadge /> : null}
          {stamp ? (
            <span>{t("stock.asOf", { date: `\u2068${stamp.day} · ${stamp.time}\u2069` })}</span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={stock.refresh}
            disabled={stock.loading}
            className="no-print h-7 px-2"
            aria-label={t("stock.refresh")}
          >
            <RefreshCw className={cn(stock.loading && "animate-spin")} />
            <span className="hidden sm:inline">{t("stock.refresh")}</span>
          </Button>
        </div>
      </div>
      <div aria-hidden className="mt-3 h-px bg-foreground/20" />
      {available && !isNow ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          {t("stock.liveHint")}
        </p>
      ) : null}

      <div className="mt-4">
        {stock.error && !data ? (
          <ErrorState error={stock.error} onRetry={stock.refresh} />
        ) : !data ? (
          <StockCardsSkeleton />
        ) : !available ? (
          <Unavailable onRetry={stock.refresh} retrying={stock.loading} />
        ) : (
          <div className={cn(GRID, "transition-opacity", stock.loading && "opacity-70")}>
            <SaleValueCard data={data} />
            <CostValueCard data={data} />
            <SpendingCard data={data} onOpen={() => setReportOpen(true)} />
          </div>
        )}
      </div>

      <StockSpendingReport
        open={reportOpen}
        onOpenChange={setReportOpen}
        initialYear={reportYear}
        today={todayIso}
      />
    </section>
  );
};
