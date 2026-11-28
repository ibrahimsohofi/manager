// f° I — Vue d'ensemble (FINANCE_PLAN.md §8). The net profit first, then the profit ladder (§6), the
// break-even and the month-end projection, the alerts, twelve months of the year, where the money goes and
// the bills still to pay. Every figure follows the period in the URL (?p=).
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Info,
  Plus,
  ReceiptText,
  Target,
  TrendingUp,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CategoryIcon } from "../components/CategoryIcon";
import { Change, Money, Pct } from "../components/Money";
import { Card, EmptyState, ErrorState, PageHeader } from "../components/PageHeader";
import { PeriodSwitcher } from "../components/PeriodSwitcher";
import { SalesBanner } from "../components/SalesBanner";
import { StockBlock, StockCardsSkeleton, useStockSummary } from "../components/StockValueCards";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/segmented";
import { Tip } from "../components/ui/tooltip";
import { useExpenseActions } from "../context/ExpenseActions";
import { usePreferences } from "../context/PreferencesContext";
import { usePeriod } from "../hooks/usePeriod";
import { useResource } from "../hooks/useResource";
import { useThemeColors } from "../hooks/useThemeColors";
import { financeApi } from "../lib/api";
import { categoryName } from "../lib/categoryIcons";
import { formatAmount, formatCompact, formatDate, formatMonth, formatPct, formatPeriod, moneyText } from "../lib/format";
import { daysBetween, yearOf } from "../lib/period";
import { cn } from "../lib/utils";

const FALLBACK_COLOR = "#07294d"; // brand navy
const neg = (value) => (value === null || value === undefined ? null : -value);
const delay = (ms) => ({ animationDelay: `${ms}ms` });

/** Serif display figure (the hero and the projection), same discreet / RTL rules as <Money>. */
const BigMoney = ({ value, className, tone = "none" }) => {
  const { t } = useTranslation();
  const missing = value === null || value === undefined || !Number.isFinite(Number(value));
  return (
    <span
      className={cn(
        "money inline-flex items-baseline gap-[0.18em] whitespace-nowrap",
        tone === "gain" && "text-gain",
        tone === "loss" && "text-loss",
        className,
      )}
    >
      <bdi className="display-figure money-value">{formatAmount(value)}</bdi>
      {missing ? null : (
        <span className="font-sans text-[0.26em] font-semibold uppercase tracking-[0.18em] opacity-60">
          {t("common.currency")}
        </span>
      )}
    </span>
  );
};

/** Due-date wording for a pending bill. */
const dueInfo = (bill, today, t, lang) => {
  if (!bill.due_date) return null;
  const days = daysBetween(today, bill.due_date);
  if (days < 0) return { text: t("overview.overdue", { days: -days }), tone: "loss" };
  if (days === 0) return { text: t("overview.dueToday"), tone: "due" };
  return {
    text: `${t("overview.due", { date: formatDate(bill.due_date, lang) })} · ${t("overview.dueIn", { days })}`,
    tone: days <= 3 ? "due" : "muted",
  };
};

// ---------------------------------------------------------------------------------------------------------
// Hero: net profit of the period
// ---------------------------------------------------------------------------------------------------------

const Hero = ({ data }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const c = data.current;
  const missing = c.net_profit === null;
  const loss = !missing && c.net_profit < 0;
  const showToday = data.today_sales && data.today >= data.period.from && data.today < data.period.to;
  return (
    <section
      className="paper-card ledger-margin animate-rise-in relative overflow-hidden lg:col-span-5"
      style={delay(60)}
    >
      <div aria-hidden className="ledger-rules pointer-events-none absolute inset-0 opacity-60" />
      {loss ? (
        <span className="stamp absolute end-5 top-5 border-loss/70 text-loss">{t("overview.heroLoss")}</span>
      ) : null}
      <div className="relative flex h-full flex-col pb-5 pe-5 ps-14 pt-6">
        <p className="eyebrow">
          {t(loss ? "overview.heroLoss" : "overview.heroLabel")} · {formatPeriod(data.period.key, lang)}
        </p>
        <BigMoney
          value={c.net_profit}
          tone={missing ? "none" : loss ? "loss" : "gain"}
          className="mt-3 text-[3.4rem] sm:text-[4.4rem] xl:text-[5rem]"
        />
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{t("overview.heroCaption")}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Change
            size="md"
            value={data.changes.vs_previous.net_profit}
            label={t("overview.vsPrevious", { period: formatPeriod(data.period.previous, lang) })}
          />
          <Change
            size="md"
            value={data.changes.vs_last_year.net_profit}
            label={t("overview.vsLastYear", { period: formatPeriod(data.period.last_year, lang) })}
          />
        </div>
        <div className="mt-auto grid grid-cols-2 gap-4 border-t border-dashed border-rule pt-4 [margin-top:max(1.5rem,auto)]">
          <div>
            <p className="eyebrow">{t("overview.netRate")}</p>
            <p className="mt-1 text-lg font-semibold">
              <Pct value={c.net_margin_pct} />
            </p>
          </div>
          {showToday ? (
            <div>
              <p className="eyebrow">{t("overview.todaySales")}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <Money value={data.today_sales.revenue} className="text-lg font-semibold" />
                <span className="text-xs text-muted-foreground">
                  {t("common.lines", { count: data.today_sales.lines })}
                </span>
              </p>
            </div>
          ) : (
            <div>
              <p className="eyebrow">{t("overview.revenue")}</p>
              <Money value={c.revenue} className="mt-1 text-lg font-semibold" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Statement: the profit ladder (§6)
// ---------------------------------------------------------------------------------------------------------

const LadderRow = ({ op, label, value, note, strong, total, tone = "none", index }) => (
  <div
    className={cn(
      "animate-rise-in grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5",
      total ? "double-rule" : "border-b border-rule/60",
    )}
    style={delay(140 + index * 55)}
  >
    <span
      className={cn("figure text-center text-base leading-none", op === "=" ? "text-foreground" : "text-muted-foreground")}
    >
      {op}
    </span>
    <div className="min-w-0">
      <p className={cn("text-[0.92rem]", strong ? "font-semibold" : "text-foreground/85")}>{label}</p>
      {note ? <div className="mt-0.5 text-xs text-muted-foreground">{note}</div> : null}
    </div>
    <Money
      value={value}
      tone={tone}
      className={cn(strong ? "text-[1.15rem] font-semibold" : "text-[0.95rem]")}
    />
  </div>
);

const Statement = ({ data, period }) => {
  const { t, i18n } = useTranslation();
  const c = data.current;
  const currency = t("common.currency");
  const coverage =
    c.cost_coverage_pct === null ? null : (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tip label={t("overview.coverageHint", { margin: data.default_margin_pct })}>
          <span className="cursor-help underline decoration-dotted underline-offset-2">
            {t("overview.coverage", { pct: formatPct(c.cost_coverage_pct) })}
          </span>
        </Tip>
        {c.unknown_lines > 0 ? (
          <Link
            to={{ pathname: "/reports", search: `?tab=unknown&p=${period}` }}
            className="no-print inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            {t("overview.unknownLines", { count: c.unknown_lines })}
            <ArrowUpRight className="size-3 rtl:-scale-x-100" />
          </Link>
        ) : null}
      </span>
    );
  const rows = [
    { op: "+", label: t("overview.revenue"), value: c.revenue },
    { op: "−", label: t("overview.cogs"), value: neg(c.cogs), note: coverage },
    {
      op: "=",
      label: t("overview.grossMargin"),
      value: c.gross_margin,
      strong: true,
      note:
        c.gross_margin_pct === null ? null : (
          <span>
            {t("overview.marginRate")} <Pct value={c.gross_margin_pct} className="font-semibold text-foreground/80" />
          </span>
        ),
    },
    {
      op: "−",
      label: t("overview.businessExpenses"),
      value: neg(c.business_expenses),
      note:
        c.pending_expenses > 0 ? (
          <span className="text-due">
            {t("overview.pendingIncluded", { amount: moneyText(c.pending_expenses, currency) })}
          </span>
        ) : null,
    },
    {
      op: "=",
      label: t("overview.netProfit"),
      value: c.net_profit,
      strong: true,
      total: true,
      tone: c.net_profit === null ? "none" : c.net_profit < 0 ? "loss" : "gain",
      note:
        c.net_margin_pct === null ? null : (
          <span>
            {t("overview.netRate")} <Pct value={c.net_margin_pct} className="font-semibold text-foreground/80" />
          </span>
        ),
    },
    { op: "−", label: t("overview.withdrawals"), value: neg(c.withdrawals) },
    { op: "=", label: t("overview.leftOver"), value: c.left_over, strong: true, tone: "auto" },
  ];
  return (
    <Card
      eyebrow={t("overview.statement")}
      title={t("overview.statementOf", { period: formatPeriod(period, i18n.language) })}
      className="lg:col-span-7"
      style={delay(110)}
    >
      <div className="mt-1">
        {rows.map((row, index) => (
          <LadderRow key={row.label} index={index} {...row} />
        ))}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Break-even + projection
// ---------------------------------------------------------------------------------------------------------

const BreakEven = ({ data, className }) => {
  const { t, i18n } = useTranslation();
  const be = data.break_even;
  const currency = t("common.currency");
  const progress = be.progress_pct === null ? 0 : Math.min(100, be.progress_pct);
  return (
    <Card
      eyebrow={t("overview.breakEven")}
      actions={<Target className="size-5 text-muted-foreground" />}
      className={className}
      style={delay(200)}
    >
      {be.revenue === null ? (
        <p className="text-sm text-muted-foreground">{t("overview.breakEvenNone")}</p>
      ) : (
        <div className="space-y-4">
          <Money value={be.revenue} round className="font-display text-[2.3rem] leading-none" />
          <p className="text-sm leading-relaxed text-foreground/80">
            {t("overview.breakEvenText", {
              amount: moneyText(be.revenue, currency, { round: true }),
              perDay: moneyText(be.per_day, currency, { round: true }),
            })}
          </p>
          <div>
            <div className="relative h-3 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700",
                  be.reached_on ? "bg-gain" : "bg-due",
                )}
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-y-0 start-[25%] w-px bg-paper/70" />
              <div className="absolute inset-y-0 start-[50%] w-px bg-paper/70" />
              <div className="absolute inset-y-0 start-[75%] w-px bg-paper/70" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className={cn("font-semibold", be.reached_on ? "text-gain" : "text-due")}>
                {be.reached_on
                  ? t("overview.breakEvenReached", { date: formatDate(be.reached_on, i18n.language) })
                  : t("overview.breakEvenRemaining", { amount: moneyText(be.remaining, currency, { round: true }) })}
              </span>
              <Pct value={be.progress_pct} className="text-muted-foreground" />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const Projection = ({ data, className }) => {
  const { t } = useTranslation();
  const p = data.projection;
  if (!p) return null;
  const elapsedPct = p.days_in_month ? Math.min(100, ((p.days_elapsed ?? 0) / p.days_in_month) * 100) : 0;
  return (
    <Card
      eyebrow={t("overview.projection")}
      actions={<TrendingUp className="size-5 text-muted-foreground" />}
      className={className}
      style={delay(250)}
    >
      {p.is_future ? (
        <p className="text-sm text-muted-foreground">{t("overview.projectionFuture")}</p>
      ) : !p.is_current ? (
        <div className="space-y-2">
          <span className="stamp border-foreground/40 text-foreground/70">{t("overview.projectionPast")}</span>
          <div>
            <p className="eyebrow mt-3">{t("overview.netProfit")}</p>
            <BigMoney
              value={p.projected_net_profit}
              tone={p.projected_net_profit < 0 ? "loss" : "gain"}
              className="mt-1 text-[2.3rem]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-foreground/80">
            {t("overview.projectionText", { days: p.days_elapsed, total: p.days_in_month })}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="eyebrow">{t("overview.projectedRevenue")}</p>
              <Money value={p.projected_revenue} round className="mt-1 text-lg font-semibold" />
            </div>
            <div>
              <p className="eyebrow">{t("overview.projectedProfit")}</p>
              <BigMoney
                value={p.projected_net_profit}
                tone={p.projected_net_profit < 0 ? "loss" : "gain"}
                className="mt-0.5 text-[2rem]"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-foreground/60" style={{ width: `${elapsedPct}%` }} />
            </div>
            <span className="figure text-[0.7rem] text-muted-foreground">
              {p.days_elapsed}/{p.days_in_month}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------------------------------------

const SEVERITY = {
  danger: { icon: CircleAlert, className: "bg-loss-soft text-loss" },
  warning: { icon: AlertTriangle, className: "bg-due-soft text-due" },
  info: { icon: Info, className: "bg-secondary text-muted-foreground" },
};

const alertText = (alert, t, lang) => {
  const currency = t("common.currency");
  const label = alert.expense
    ? alert.expense.description || categoryName(alert.expense.category, lang)
    : undefined;
  switch (alert.type) {
    case "loss_projection":
      return t("alerts.loss_projection", { amount: moneyText(alert.amount, currency) });
    case "bill_overdue":
      return t("alerts.bill_overdue", { label, days: alert.days, amount: moneyText(alert.expense.amount, currency) });
    case "bill_due_soon":
      return alert.days === 0
        ? t("alerts.bill_due_today", { label, amount: moneyText(alert.expense.amount, currency) })
        : t("alerts.bill_due_soon", { label, days: alert.days, amount: moneyText(alert.expense.amount, currency) });
    case "low_coverage":
      return t("alerts.low_coverage", { pct: formatPct(alert.coverage_pct) });
    case "over_budget":
      return t("alerts.over_budget", {
        category: categoryName(alert.category, lang),
        amount: moneyText(alert.amount, currency),
        budget: moneyText(alert.budget, currency),
      });
    case "category_spike":
      return t("alerts.category_spike", {
        category: categoryName(alert.category, lang),
        change: formatPct(alert.change_pct, { sign: true }),
      });
    default:
      return alert.type;
  }
};

const Alerts = ({ data, className }) => {
  const { t, i18n } = useTranslation();
  const { openPay } = useExpenseActions();
  const alerts = data.alerts ?? [];
  return (
    <Card
      eyebrow={t("overview.alertsTitle")}
      actions={
        alerts.length > 0 ? (
          <span className="figure rounded-full bg-loss-soft px-2 py-0.5 text-xs font-semibold text-loss">
            {alerts.length}
          </span>
        ) : null
      }
      className={className}
      style={delay(300)}
    >
      {alerts.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md bg-gain-soft/60 px-3 py-3 text-sm text-gain">
          <CheckCircle2 className="size-5 shrink-0" />
          {t("overview.alertsEmpty")}
        </div>
      ) : (
        <ul className="scrollbar-thin -me-2 max-h-[17rem] space-y-2 overflow-y-auto pe-2">
          {alerts.map((alert, index) => {
            const severity = SEVERITY[alert.severity] ?? SEVERITY.info;
            const Icon = severity.icon;
            const key = `${alert.type}-${alert.expense?.id ?? alert.category?.id ?? index}`;
            return (
              <li key={key} className="flex items-start gap-2.5 rounded-md border border-rule/60 bg-background/40 p-2.5">
                <span className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full", severity.className)}>
                  <Icon className="size-3.5" />
                </span>
                <p className="min-w-0 flex-1 text-[0.82rem] leading-snug text-foreground/85">
                  {alertText(alert, t, i18n.language)}
                </p>
                {alert.expense && alert.expense.status === "pending" ? (
                  <Button variant="outline" size="sm" className="h-7 shrink-0 px-2" onClick={() => openPay(alert.expense)}>
                    {t("overview.pay")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Twelve months chart
// ---------------------------------------------------------------------------------------------------------

const ChartTooltip = ({ active, payload }) => {
  const { t, i18n } = useTranslation();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const line = (label, value, swatch, tone) => (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-sm" style={{ backgroundColor: swatch }} />
        {label}
      </span>
      <Money value={value} round tone={tone} className="font-semibold" />
    </div>
  );
  return (
    <div className="min-w-[12rem] space-y-1 rounded-md border bg-paper px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-display text-lg leading-none">{formatMonth(row.key, i18n.language)}</p>
      {line(t("overview.chartRevenue"), row.revenue, "transparent")}
      {line(t("overview.chartGross"), row.gross, row.colors.gain)}
      {line(t("overview.chartExpenses"), row.expenses, row.colors.due)}
      <div className="mt-1 border-t border-dashed border-rule pt-1">
        {line(t("overview.chartNet"), row.net, row.colors.foreground, "auto")}
      </div>
    </div>
  );
};

const TwelveMonths = ({ monthly, period, onPick, className }) => {
  const { t, i18n } = useTranslation();
  const { isRtl } = usePreferences();
  const colors = useThemeColors();
  const lang = i18n.language;
  const year = yearOf(period);
  const rows = monthly.data?.rows ?? [];
  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        key: row.month,
        label: formatMonth(row.month, lang, { short: true, withYear: false }),
        revenue: row.revenue,
        gross: row.gross_margin,
        expenses: row.business_expenses,
        net: row.net_profit,
        colors,
      })),
    [rows, lang, colors],
  );
  const NetDot = ({ cx, cy, payload }) => {
    if (cx === undefined || cy === undefined || payload.net === null) return null;
    const active = payload.key === period;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={active ? 5 : 3}
        fill={payload.net < 0 ? colors.loss : colors.paper}
        stroke={payload.net < 0 ? colors.loss : colors.foreground}
        strokeWidth={active ? 2.5 : 1.5}
      />
    );
  };
  const legend = [
    { label: t("overview.chartGross"), color: colors.gain },
    { label: t("overview.chartExpenses"), color: colors.due },
    { label: t("overview.chartNet"), color: colors.foreground, line: true },
  ];
  return (
    <Card
      eyebrow={formatPeriod(year, lang)}
      title={t("overview.chartTitle", { year })}
      actions={
        <div className="hidden flex-wrap items-center gap-3 text-xs text-muted-foreground sm:flex">
          {legend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span
                className={cn(item.line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-sm")}
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      }
      className={className}
      style={delay(340)}
    >
      {monthly.error && !monthly.data ? (
        <ErrorState error={monthly.error} onRetry={monthly.reload} />
      ) : !monthly.data ? (
        <Skeleton className="h-[280px] w-full" />
      ) : (
        <div className="h-[280px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 6, left: 6, bottom: 0 }}
              barGap={2}
              barCategoryGap="22%"
              onClick={(state) => {
                const key = state?.activePayload?.[0]?.payload?.key;
                if (key) onPick(key);
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid vertical={false} stroke={colors.rule} strokeDasharray="2 5" />
              <XAxis
                dataKey="label"
                reversed={isRtl}
                tickLine={false}
                axisLine={{ stroke: colors.rule }}
                tick={{ fill: colors.mutedForeground, fontSize: 11 }}
                interval={0}
                tickMargin={8}
              />
              <YAxis
                orientation={isRtl ? "right" : "left"}
                tickFormatter={formatCompact}
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: colors.mutedForeground, fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace" }}
              />
              <ReferenceLine y={0} stroke={colors.foreground} strokeOpacity={0.35} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: colors.rule, fillOpacity: 0.28 }} />
              <Bar dataKey="gross" fill={colors.gain} radius={[3, 3, 0, 0]} maxBarSize={16}>
                {chartData.map((row) => (
                  <Cell key={row.key} fillOpacity={row.key === period || period.length === 4 ? 0.95 : 0.45} />
                ))}
              </Bar>
              <Bar dataKey="expenses" fill={colors.due} radius={[3, 3, 0, 0]} maxBarSize={16}>
                {chartData.map((row) => (
                  <Cell key={row.key} fillOpacity={row.key === period || period.length === 4 ? 0.9 : 0.4} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="net"
                stroke={colors.foreground}
                strokeWidth={1.75}
                dot={<NetDot />}
                activeDot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Donut: where the money goes
// ---------------------------------------------------------------------------------------------------------

const WhereMoneyGoes = ({ byCategory, className }) => {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const lang = i18n.language;
  const data = byCategory.data;
  const rows = data?.rows ?? [];
  return (
    <Card eyebrow={t("overview.donutTitle")} className={className} style={delay(380)}>
      {byCategory.error && !data ? (
        <ErrorState error={byCategory.error} onRetry={byCategory.reload} />
      ) : !data ? (
        <Skeleton className="mx-auto size-48 rounded-full" />
      ) : rows.length === 0 ? (
        <EmptyState icon={ReceiptText} text={t("overview.donutEmpty")} className="py-8" />
      ) : (
        <div className="space-y-4">
          <div className="relative mx-auto h-[200px] w-full max-w-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="category.name_fr"
                  innerRadius="70%"
                  outerRadius="100%"
                  paddingAngle={1.4}
                  startAngle={90}
                  endAngle={-270}
                  stroke={colors.paper}
                  strokeWidth={2}
                >
                  {rows.map((row) => (
                    <Cell key={row.category.id} fill={row.category.color || FALLBACK_COLOR} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="eyebrow">{t("overview.donutTotal")}</span>
              <Money value={data.total} round className="mt-1 font-display text-[1.7rem] leading-none" />
            </div>
          </div>
          <ul className="space-y-2.5">
            {rows.slice(0, 7).map((row) => (
              <li key={row.category.id} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <CategoryIcon category={row.category} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{categoryName(row.category, lang)}</span>
                  {row.category.is_personal ? (
                    <span className="rounded bg-due-soft px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider text-due">
                      {t("overview.personalTag")}
                    </span>
                  ) : null}
                  <Pct value={row.share_pct} className="w-12 text-end text-xs text-muted-foreground" />
                  <Money value={row.amount} round className="w-24 justify-end text-[0.85rem] font-semibold" />
                </div>
                {row.budget ? (
                  <div className="flex items-center gap-2 ps-9">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full", row.budget_pct > 100 ? "bg-loss" : "bg-gain")}
                        style={{ width: `${Math.min(100, row.budget_pct ?? 0)}%` }}
                      />
                    </div>
                    <span className={cn("text-[0.68rem]", row.budget_pct > 100 ? "text-loss" : "text-muted-foreground")}>
                      {t("overview.budget", { amount: moneyText(row.budget, t("common.currency"), { round: true }) })}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Pending bills
// ---------------------------------------------------------------------------------------------------------

const PendingBills = ({ data, className }) => {
  const { t, i18n } = useTranslation();
  const { openPay, openEdit } = useExpenseActions();
  const lang = i18n.language;
  const pending = data.pending;
  return (
    <Card
      eyebrow={t("overview.pendingTitle")}
      title={
        pending.count > 0
          ? t("overview.pendingTotal", { count: pending.count, amount: moneyText(pending.amount, t("common.currency")) })
          : undefined
      }
      actions={<CalendarClock className="size-5 text-muted-foreground" />}
      className={className}
      style={delay(420)}
    >
      {pending.rows.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md bg-secondary/60 px-3 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-5 shrink-0 text-gain" />
          {t("overview.pendingEmpty")}
        </div>
      ) : (
        <ul className="grid gap-x-6 lg:grid-cols-2">
          {pending.rows.map((bill) => {
            const due = dueInfo(bill, data.today, t, lang);
            return (
              <li key={bill.id} className="flex items-center gap-3 border-b border-dashed border-rule py-3 last:border-b-0 lg:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <CategoryIcon category={bill.category} />
                <button type="button" onClick={() => openEdit(bill)} className="min-w-0 flex-1 text-start">
                  <p className="truncate text-sm font-semibold hover:underline">
                    {bill.description || categoryName(bill.category, lang)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {bill.payee ? `${bill.payee} · ` : ""}
                    {due ? (
                      <span
                        className={cn(
                          due.tone === "loss" && "font-semibold text-loss",
                          due.tone === "due" && "font-semibold text-due",
                        )}
                      >
                        {due.text}
                      </span>
                    ) : (
                      categoryName(bill.category, lang)
                    )}
                  </p>
                </button>
                <Money value={bill.amount} className="text-sm font-semibold" />
                <Button variant="due" size="sm" onClick={() => openPay(bill)}>
                  {t("overview.pay")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------

const OverviewSkeleton = () => (
  <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-12">
      <Skeleton className="h-[22rem] lg:col-span-5" />
      <Skeleton className="h-[22rem] lg:col-span-7" />
    </div>
    <div className="space-y-4">
      <Skeleton className="h-9 w-64" />
      <StockCardsSkeleton />
    </div>
    <div className="grid gap-6 lg:grid-cols-3">
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
    </div>
  </div>
);

export default function Overview() {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = usePeriod();
  const { openAdd } = useExpenseActions();
  const year = yearOf(period);
  const summary = useResource(({ signal }) => financeApi.summary(period, { signal }), [period]);
  const monthly = useResource(({ signal }) => financeApi.monthly(year, { signal }), [year]);
  const byCategory = useResource(({ signal }) => financeApi.expensesByCategory(period, { signal }), [period]);
  // Stock & purchases (§8.1): its own request, so a products API that is down never blocks the page.
  const stock = useStockSummary(period);
  const data = summary.data;
  const hasProjection = Boolean(data?.projection);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        folio="I"
        eyebrow={t("app.tagline")}
        title={t("overview.title")}
        subtitle={formatDate(data?.today ?? null, i18n.language, { long: true, weekday: true })}
        actions={
          <Button onClick={() => openAdd()} className="hidden sm:inline-flex">
            <Plus strokeWidth={2.6} />
            {t("overview.addExpense")}
          </Button>
        }
      >
        <PeriodSwitcher size="lg" />
      </PageHeader>

      {data && !data.sales_available ? <SalesBanner /> : null}

      {summary.error && !data ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : !data ? (
        <OverviewSkeleton />
      ) : (
        <div className={cn("space-y-6 transition-opacity", summary.loading && "opacity-70")}>
          <div className="grid gap-6 lg:grid-cols-12">
            <Hero data={data} />
            <Statement data={data} period={period} />
          </div>

          {/* Under the profit cards: stock value + money spent on purchases (cash, never in the profit). */}
          <StockBlock stock={stock} period={period} today={data.today} className="pt-2" style={delay(160)} />

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <BreakEven data={data} />
            {hasProjection ? <Projection data={data} /> : null}
            <Alerts data={data} className={cn(hasProjection ? "md:col-span-2 xl:col-span-1" : "xl:col-span-2")} />
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <TwelveMonths monthly={monthly} period={period} onPick={setPeriod} className="lg:col-span-8" />
            <WhereMoneyGoes byCategory={byCategory} className="lg:col-span-4" />
          </div>

          <PendingBills data={data} />

          <p className="pb-2 text-center text-[0.7rem] italic text-muted-foreground">{t("app.internal")}</p>
        </div>
      )}
    </div>
  );
}
