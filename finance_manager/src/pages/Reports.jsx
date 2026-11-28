// f° III — Rapports (FINANCE_PLAN.md §8). Four ledgers on one page, the tab lives in the URL (?tab=):
//   year    — the twelve months of the selected year + the year total (row -> opens that month)
//   years   — one line per year that has sales or expenses (row -> opens that year)
//   daily   — day by day of the selected month: sales, cost, gross margin, expenses paid that day
//   unknown — sale lines without a purchase price, costed with the default margin
// Every tab exports to CSV (";" + decimal comma for Excel) and prints cleanly (window.print()).
import {
  ArrowUpRight,
  CalendarRange,
  Download,
  ExternalLink,
  FileQuestion,
  Loader2,
  Printer,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Money, Pct } from "../components/Money";
import { EmptyState, ErrorState, PageHeader, Pager } from "../components/PageHeader";
import { PeriodSwitcher } from "../components/PeriodSwitcher";
import { SalesBanner } from "../components/SalesBanner";
import { Button } from "../components/ui/button";
import { Segmented, Skeleton } from "../components/ui/segmented";
import { Tip } from "../components/ui/tooltip";
import { useParam, usePeriod } from "../hooks/usePeriod";
import { useResource } from "../hooks/useResource";
import { financeApi } from "../lib/api";
import { downloadCsv } from "../lib/csv";
import { errorMessage } from "../lib/errors";
import { formatDate, formatInt, formatMonth, formatPeriod, formatWeekday, moneyText } from "../lib/format";
import { currentMonth, currentYear, isMonthKey, todayISO, yearOf } from "../lib/period";
import { cn } from "../lib/utils";

const TABS = ["year", "years", "daily", "unknown"];
const UNKNOWN_PAGE_SIZE = 50;
const EXPORT_PAGE_SIZE = 200;

const delay = (ms) => ({ animationDelay: `${ms}ms` });
const isNum = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const numOrNull = (value) => (isNum(value) ? Number(value) : null);

/** The profit ladder (§6) as table columns, shared by the year and the all-years ledgers. */
const LADDER = [
  { key: "revenue", label: "reports.revenue" },
  { key: "cogs", label: "reports.cogs", muted: true },
  { key: "gross_margin", label: "reports.gross" },
  { key: "gross_margin_pct", label: "reports.grossPct", kind: "pct" },
  { key: "business_expenses", label: "reports.expenses", muted: true },
  { key: "net_profit", label: "reports.net", strong: true, tone: "auto", highlight: true },
  { key: "withdrawals", label: "reports.withdrawals", muted: true },
  { key: "left_over", label: "reports.leftOver", tone: "auto" },
  { key: "lines", label: "reports.lines", kind: "int" },
];

// ---------------------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------------------

const TableSheet = ({ children, className, style }) => (
  <section className={cn("paper-card animate-rise-in overflow-hidden", className)} style={style}>
    <div className="scrollbar-thin overflow-x-auto">{children}</div>
  </section>
);

const LadderHead = ({ first }) => {
  const { t } = useTranslation();
  return (
    <thead>
      <tr>
        <th>{first}</th>
        {LADDER.map((col) => (
          <th key={col.key} className={cn("num", col.highlight && "!text-foreground")}>
            {t(col.label)}
          </th>
        ))}
      </tr>
    </thead>
  );
};

const LadderCells = ({ row }) =>
  LADDER.map((col) => {
    const value = row[col.key];
    if (col.kind === "pct") {
      return (
        <td key={col.key} className="num text-xs text-muted-foreground">
          {isNum(value) ? <Pct value={value} /> : "—"}
        </td>
      );
    }
    if (col.kind === "int") {
      return (
        <td key={col.key} className="num figure text-xs text-muted-foreground">
          {formatInt(value)}
        </td>
      );
    }
    return (
      <td key={col.key} className={cn("num", col.highlight && "bg-secondary/40")}>
        <Money
          value={value}
          currency={false}
          tone={col.tone ?? "none"}
          className={cn(col.muted && "text-muted-foreground", col.strong && "font-semibold")}
        />
      </td>
    );
  });

/** Net profit first (serif), then four cells — the head of a closed account. */
const StatementStrip = ({ label, summary, style }) => {
  const { t } = useTranslation();
  const cells = [
    { key: "revenue", label: t("reports.revenue"), value: summary.revenue },
    { key: "gross", label: t("reports.gross"), value: summary.gross_margin, pct: summary.gross_margin_pct },
    { key: "expenses", label: t("reports.expenses"), value: summary.business_expenses },
    { key: "left", label: t("reports.leftOver"), value: summary.left_over, tone: "auto" },
  ];
  return (
    <section className="paper-card animate-rise-in overflow-hidden" style={style}>
      <div className="grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
        <div className="ledger-margin relative border-b border-rule/70 py-5 pe-5 ps-14 md:border-b-0 md:border-e">
          <p className="eyebrow">
            {t("reports.net")} · {label}
          </p>
          <Money
            value={summary.net_profit}
            tone="auto"
            className="mt-2 font-display text-[2.6rem] leading-none sm:text-[3rem]"
          />
          {isNum(summary.net_margin_pct) ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <Pct value={summary.net_margin_pct} className="font-semibold text-foreground/80" /> {t("overview.netRate")}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4">
          {cells.map((cell, index) => (
            <div
              key={cell.key}
              className={cn(
                "flex flex-col justify-center gap-1 px-5 py-4",
                index % 2 === 1 && "border-s border-rule/70",
                index >= 2 && "border-t border-rule/70 sm:border-t-0",
                index === 2 && "sm:border-s",
              )}
            >
              <dt className="eyebrow">{cell.label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2">
                <Money value={cell.value} tone={cell.tone ?? "none"} className="text-lg font-semibold" />
                {isNum(cell.pct) ? <Pct value={cell.pct} className="text-xs text-muted-foreground" /> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};

const ReportSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

// ---------------------------------------------------------------------------------------------------------
// Year by month
// ---------------------------------------------------------------------------------------------------------

const YearView = ({ data, period }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const thisMonth = currentMonth();

  return (
    <div className="space-y-5">
      <StatementStrip label={data.year} summary={data.totals} style={delay(60)} />
      <TableSheet style={delay(140)}>
        <table className="ledger-table">
          <LadderHead first={t("reports.month")} />
          <tbody>
            {data.rows.map((row) => {
              const future = row.month > thisMonth;
              const selected = row.month === period;
              return (
                <tr key={row.month} className={cn(future && "opacity-40", selected && "bg-accent/40")}>
                  <td>
                    {future ? (
                      <span className="font-semibold capitalize">{formatMonth(row.month, lang, { withYear: false })}</span>
                    ) : (
                      <Tip label={t("reports.openMonth")}>
                        <button
                          type="button"
                          onClick={() => navigate({ pathname: "/", search: `?p=${row.month}` })}
                          className="group inline-flex items-center gap-1.5 font-semibold capitalize transition-colors hover:text-primary"
                        >
                          {row.month === thisMonth ? (
                            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                          ) : null}
                          {formatMonth(row.month, lang, { withYear: false })}
                          <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-70 rtl:-scale-x-100" />
                        </button>
                      </Tip>
                    )}
                  </td>
                  <LadderCells row={row} />
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="double-rule">
              <td>
                <span className="font-display text-xl font-normal">
                  {t("reports.total")} <span className="display-figure">{data.year}</span>
                </span>
              </td>
              <LadderCells row={data.totals} />
            </tr>
          </tfoot>
        </table>
      </TableSheet>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// All years
// ---------------------------------------------------------------------------------------------------------

const YearsView = ({ data }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const thisYear = currentYear();

  if (data.rows.length === 0) {
    return <EmptyState icon={CalendarRange} title={t("reports.yearsEmpty")} className="paper-card" />;
  }

  return (
    <TableSheet style={delay(80)}>
      <table className="ledger-table">
        <LadderHead first={t("reports.yearCol")} />
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.year}>
              <td>
                <button
                  type="button"
                  onClick={() => navigate({ pathname: "/reports", search: `?p=${row.year}` })}
                  className="group inline-flex items-center gap-2 transition-colors hover:text-primary"
                >
                  {row.year === thisYear ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
                  <span className="display-figure text-2xl">{row.year}</span>
                  <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-70 rtl:-scale-x-100" />
                </button>
              </td>
              <LadderCells row={row} />
            </tr>
          ))}
        </tbody>
      </table>
    </TableSheet>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Day by day
// ---------------------------------------------------------------------------------------------------------

const StatCell = ({ label, children, hint, className, style }) => (
  <div className={cn("paper-card animate-rise-in px-5 py-4", className)} style={style}>
    <p className="eyebrow">{label}</p>
    <div className="mt-1.5">{children}</div>
    {hint ? <p className="mt-1 text-xs capitalize text-muted-foreground">{hint}</p> : null}
  </div>
);

const DailyView = ({ data }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = todayISO();
  const available = data.sales_available;

  const stats = useMemo(() => {
    const rows = data.rows;
    const sum = (key) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    const open = rows.filter((row) => Number(row.lines) > 0);
    const best = open.reduce((acc, row) => (!acc || Number(row.revenue) > Number(acc.revenue) ? row : acc), null);
    const max = Math.max(0, ...rows.map((row) => Number(row.revenue) || 0));
    const revenue = sum("revenue");
    return {
      best,
      max,
      openDays: open.length,
      average: open.length ? revenue / open.length : null,
      totals: {
        revenue: available ? revenue : null,
        cogs: available ? sum("cogs") : null,
        gross_margin: available ? sum("gross_margin") : null,
        lines: available ? sum("lines") : null,
        paid_expenses: sum("paid_expenses"),
      },
    };
  }, [data, available]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCell label={t("reports.revenue")} style={delay(40)} hint={t("common.days", { count: stats.openDays })}>
          <Money value={stats.totals.revenue} className="text-xl font-semibold" />
        </StatCell>
        <StatCell
          label={t("reports.bestDay")}
          style={delay(90)}
          hint={stats.best ? formatDate(stats.best.date, lang, { long: true, weekday: true }) : null}
        >
          <span className="flex items-center gap-2">
            <Trophy className="size-4 text-due" />
            <Money value={stats.best?.revenue ?? null} className="text-xl font-semibold" />
          </span>
        </StatCell>
        <StatCell label={t("reports.average")} style={delay(140)}>
          <Money value={available ? stats.average : null} className="text-xl font-semibold" />
        </StatCell>
        <StatCell label={t("reports.paidExpenses")} style={delay(190)}>
          <Money value={stats.totals.paid_expenses} tone="due" className="text-xl font-semibold" />
        </StatCell>
      </div>

      <TableSheet style={delay(220)}>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>{t("reports.day")}</th>
              <th className="num">{t("reports.revenue")}</th>
              <th className="num">{t("reports.cogs")}</th>
              <th className="num">{t("reports.gross")}</th>
              <th className="num">{t("reports.lines")}</th>
              <th className="num">{t("reports.paidExpenses")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const future = row.date > today;
              const closed = !future && available && Number(row.lines) === 0;
              const isBest = stats.best?.date === row.date;
              const width = stats.max > 0 ? Math.max(2, (Number(row.revenue) / stats.max) * 100) : 0;
              return (
                <tr key={row.date} className={cn(future && "opacity-35", closed && "text-muted-foreground")}>
                  <td>
                    <span className="flex items-baseline gap-2">
                      <span className={cn("display-figure w-7 text-xl", row.date === today && "text-primary")}>
                        {row.date.slice(8, 10)}
                      </span>
                      <span className="w-10 text-xs capitalize text-muted-foreground">{formatWeekday(row.date, lang)}</span>
                      {isBest ? <Trophy className="size-3.5 self-center text-due" aria-label={t("reports.bestDay")} /> : null}
                    </span>
                  </td>
                  <td className="num">
                    <span className="flex items-center justify-end gap-3">
                      <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-secondary sm:block" aria-hidden>
                        {available && Number(row.revenue) > 0 ? (
                          <span
                            className={cn("block h-full rounded-full", isBest ? "bg-due" : "bg-primary/70")}
                            style={{ width: `${width}%` }}
                          />
                        ) : null}
                      </span>
                      <Money value={future ? null : row.revenue} currency={false} className="font-semibold" />
                    </span>
                  </td>
                  <td className="num">
                    <Money value={future ? null : row.cogs} currency={false} className="text-muted-foreground" />
                  </td>
                  <td className="num">
                    <Money value={future ? null : row.gross_margin} currency={false} tone="auto" />
                  </td>
                  <td className="num figure text-xs text-muted-foreground">{future ? "—" : formatInt(row.lines)}</td>
                  <td className="num">
                    {Number(row.paid_expenses) > 0 ? (
                      <Money value={row.paid_expenses} currency={false} tone="due" />
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="double-rule">
              <td>
                <span className="font-display text-xl font-normal">{t("reports.total")}</span>
              </td>
              <td className="num">
                <Money value={stats.totals.revenue} />
              </td>
              <td className="num">
                <Money value={stats.totals.cogs} className="text-muted-foreground" />
              </td>
              <td className="num">
                <Money value={stats.totals.gross_margin} tone="auto" />
              </td>
              <td className="num figure text-xs text-muted-foreground">{formatInt(stats.totals.lines)}</td>
              <td className="num">
                <Money value={stats.totals.paid_expenses} tone="due" />
              </td>
            </tr>
          </tfoot>
        </table>
      </TableSheet>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Unknown-cost lines
// ---------------------------------------------------------------------------------------------------------

const UnknownView = ({ data, onPage }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const currency = t("common.currency");
  const rows = data.rows ?? [];

  return (
    <div className="space-y-5">
      <section
        className="paper-card animate-rise-in flex flex-col gap-4 border-due/30 px-5 py-4 sm:flex-row sm:items-start"
        style={delay(60)}
      >
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-due-soft text-due">
          <FileQuestion className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-foreground/80">
            {t("reports.unknownText", { margin: data.default_margin_pct })}
          </p>
          {data.sales_available ? (
            <p className="mt-2 text-sm font-semibold text-due">
              {t("reports.unknownSummary", {
                count: formatInt(data.total ?? 0),
                amount: moneyText(data.revenue ?? 0, currency),
              })}
            </p>
          ) : null}
        </div>
        {data.sales_app_url ? (
          <Button variant="outline" size="sm" asChild className="self-start">
            <a href={data.sales_app_url} target="_blank" rel="noreferrer">
              {t("reports.openSales")}
              <ExternalLink className="rtl:-scale-x-100" />
            </a>
          </Button>
        ) : null}
      </section>

      {rows.length === 0 ? (
        data.sales_available ? (
          <EmptyState icon={Trophy} title={t("reports.unknownEmpty")} className="paper-card" />
        ) : null
      ) : (
        <TableSheet style={delay(140)}>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>{t("reports.day")}</th>
                <th>{t("reports.ticket")}</th>
                <th>{t("reports.product")}</th>
                <th>{t("reports.category")}</th>
                <th className="num">{t("reports.qty")}</th>
                <th className="num">{t("reports.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="text-xs capitalize text-muted-foreground">{formatDate(row.date, lang, { weekday: true })}</td>
                  <td className="figure text-xs">{row.ticket ?? row.sale_number ?? "—"}</td>
                  <td className="max-w-[18rem]">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{row.product_name || "—"}</span>
                      {row.product_id === null ? (
                        <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground">
                          {t("reports.noProduct")}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="text-xs text-muted-foreground">{row.category || "—"}</td>
                  <td className="num figure">{formatInt(row.quantity)}</td>
                  <td className="num">
                    <Money value={row.total_price} currency={false} className="font-semibold" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={data.page} pages={data.pages} onChange={onPage} className="border-t border-rule/70 px-5 pb-4" />
        </TableSheet>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------

export default function Reports() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [period] = usePeriod();
  const [tabRaw, setTab] = useParam("tab", "year");
  const tab = TABS.includes(tabRaw) ? tabRaw : "year";
  const [pageRaw, setPage] = useParam("page", "1");
  const page = Math.max(1, Number(pageRaw) || 1);
  const year = yearOf(period);
  const monthPicked = isMonthKey(period);
  const [exporting, setExporting] = useState(false);

  // One resource per tab, only the visible one loads.
  const yearRes = useResource(({ signal }) => financeApi.monthly(year, { signal }), [year], {
    enabled: tab === "year",
  });
  const yearsRes = useResource(({ signal }) => financeApi.yearly({ signal }), [], { enabled: tab === "years" });
  const dailyRes = useResource(({ signal }) => financeApi.daily(period, { signal }), [period], {
    enabled: tab === "daily" && monthPicked,
  });
  const unknownRes = useResource(
    ({ signal }) => financeApi.unknownCostLines(period, { page, limit: UNKNOWN_PAGE_SIZE }, { signal }),
    [period, page],
    { enabled: tab === "unknown" },
  );
  const active = { year: yearRes, years: yearsRes, daily: dailyRes, unknown: unknownRes }[tab];
  const needsMonth = tab === "daily" && !monthPicked;
  const data = needsMonth ? null : active.data;

  const subtitle = {
    year: t("reports.tabs.year"),
    years: t("reports.tabs.years"),
    daily: t("reports.dailyOf", { period: formatPeriod(period, lang) }),
    unknown: t("reports.unknownTitle", { period: formatPeriod(period, lang) }),
  }[tab];
  const title = tab === "year" ? `${t("reports.title")} ${year}` : t("reports.title");

  // ---------- CSV ----------
  const ladderHeader = LADDER.map((col) => (col.kind === "pct" ? `${t("reports.gross")} %` : t(col.label)));
  const ladderRow = (row) => LADDER.map((col) => numOrNull(row[col.key]));

  const exportCsv = async () => {
    if (!data) return;
    setExporting(true);
    try {
      if (tab === "year") {
        downloadCsv(`finances-${data.year}.csv`, [t("reports.month"), ...ladderHeader], [
          ...data.rows.map((row) => [formatMonth(row.month, lang), ...ladderRow(row)]),
          [`${t("reports.total")} ${data.year}`, ...ladderRow(data.totals)],
        ]);
      } else if (tab === "years") {
        downloadCsv(
          "finances-annees.csv",
          [t("reports.yearCol"), ...ladderHeader],
          data.rows.map((row) => [row.year, ...ladderRow(row)]),
        );
      } else if (tab === "daily") {
        downloadCsv(
          `finances-${data.period}-jours.csv`,
          [
            t("reports.day"),
            t("reports.revenue"),
            t("reports.cogs"),
            t("reports.gross"),
            t("reports.lines"),
            t("reports.paidExpenses"),
          ],
          data.rows.map((row) => [
            row.date,
            numOrNull(row.revenue),
            numOrNull(row.cogs),
            numOrNull(row.gross_margin),
            numOrNull(row.lines),
            numOrNull(row.paid_expenses),
          ]),
        );
      } else {
        // Every page of the period, not only the visible one.
        const all = [];
        let next = 1;
        let pages = 1;
        do {
          const result = await financeApi.unknownCostLines(period, { page: next, limit: EXPORT_PAGE_SIZE });
          all.push(...(result.rows ?? []));
          pages = result.pages ?? 1;
          next += 1;
        } while (next <= pages && next <= 100);
        downloadCsv(
          `couts-inconnus-${period}.csv`,
          [
            t("reports.day"),
            t("reports.ticket"),
            t("reports.product"),
            t("reports.category"),
            t("reports.qty"),
            t("reports.amount"),
          ],
          all.map((row) => [
            row.date,
            row.ticket ?? row.sale_number ?? "",
            row.product_name ?? "",
            row.category ?? "",
            numOrNull(row.quantity),
            numOrNull(row.total_price),
          ]),
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  // ---------- Body ----------
  let body;
  if (needsMonth) {
    body = (
      <EmptyState
        icon={CalendarRange}
        title={t("reports.dailyNeedsMonth")}
        action={<PeriodSwitcher />}
        className="paper-card"
      />
    );
  } else if (active.error && !data) {
    body = <ErrorState error={active.error} onRetry={active.reload} />;
  } else if (!data) {
    body = <ReportSkeleton />;
  } else if (tab === "year") {
    body = <YearView data={data} period={period} />;
  } else if (tab === "years") {
    body = <YearsView data={data} />;
  } else if (tab === "daily") {
    body = <DailyView data={data} />;
  } else {
    body = <UnknownView data={data} onPage={(next) => setPage(String(next), { resetPage: false })} />;
  }

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* Print-only letterhead */}
      <div className="hidden print:block">
        <p className="text-xs font-semibold uppercase tracking-[0.3em]">
          {t("app.shop")} — {t("app.name")}
        </p>
        <p className="mt-1 text-xs">{t("reports.printedOn", { date: formatDate(todayISO(), lang, { long: true }) })}</p>
      </div>

      <PageHeader
        folio="III"
        eyebrow={t("app.tagline")}
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!data || exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />}
              {t("reports.exportCsv")}
            </Button>
            <Tip label={t("reports.print")}>
              <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label={t("reports.print")}>
                <Printer />
              </Button>
            </Tip>
          </>
        }
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
            <Segmented
              value={tab}
              onChange={(next) => setTab(next)}
              ariaLabel={t("reports.title")}
              options={TABS.map((key) => ({ value: key, label: t(`reports.tabs.${key}`) }))}
            />
          </div>
          {tab === "years" ? null : <PeriodSwitcher />}
        </div>
      </PageHeader>

      {data && data.sales_available === false ? <SalesBanner /> : null}

      <div className={cn("transition-opacity", active.loading && data && "opacity-60")}>{body}</div>

      <p className="hidden text-center text-[0.65rem] text-muted-foreground print:block">{t("app.internal")}</p>
    </div>
  );
}
