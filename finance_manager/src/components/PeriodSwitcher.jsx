// "◀ Novembre 2026 ▶  [Mois | Année]" (FINANCE_PLAN.md §8). The period lives in the URL (?p=), so every
// screen shares it. Clicking the label opens a month grid (or a year list) to jump directly.
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePeriod } from "../hooks/usePeriod";
import { formatMonth, formatPeriod } from "../lib/format";
import {
  currentMonth,
  currentYear,
  isFuturePeriod,
  periodKind,
  shiftPeriod,
  togglePeriodKind,
  yearOf,
} from "../lib/period";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Segmented } from "./ui/segmented";

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

const MonthGrid = ({ period, onPick }) => {
  const { t, i18n } = useTranslation();
  const [viewYear, setViewYear] = useState(() => Number(yearOf(period)));
  const today = currentMonth();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon-sm" onClick={() => setViewYear((y) => y - 1)} aria-label={t("period.prevYear")}>
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <span className="display-figure text-2xl">{viewYear}</span>
        <Button variant="ghost" size="icon-sm" onClick={() => setViewYear((y) => y + 1)} aria-label={t("period.nextYear")}>
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS.map((mm) => {
          const key = `${viewYear}-${mm}`;
          const active = key === period;
          const isToday = key === today;
          const future = key > today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              className={cn(
                "relative h-10 rounded-md border text-sm font-medium capitalize transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-transparent hover:border-input hover:bg-secondary/60",
                future && !active && "text-muted-foreground/60",
              )}
            >
              {formatMonth(key, i18n.language, { short: true, withYear: false })}
              {isToday && !active ? (
                <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const YearGrid = ({ period, onPick }) => {
  const thisYear = Number(currentYear());
  const years = Array.from({ length: 9 }, (_, i) => String(thisYear - 7 + i));
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {years.map((year) => {
        const active = year === period;
        return (
          <button
            key={year}
            type="button"
            onClick={() => onPick(year)}
            className={cn(
              "figure h-10 rounded-md border text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-transparent hover:border-input hover:bg-secondary/60",
              Number(year) > thisYear && !active && "text-muted-foreground/60",
            )}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
};

/**
 * @param {{allowYear?: boolean, className?: string, size?: "md"|"lg"}} props
 */
export const PeriodSwitcher = ({ allowYear = true, className, size = "md" }) => {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = usePeriod();
  const [open, setOpen] = useState(false);
  const kind = periodKind(period);
  const isCurrent = kind === "month" ? period === currentMonth() : period === currentYear();
  const future = isFuturePeriod(period);

  const pick = (key) => {
    setPeriod(key);
    setOpen(false);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex items-center rounded-lg border border-input bg-paper p-0.5 shadow-[0_1px_0_hsl(var(--rule))]">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setPeriod(shiftPeriod(period, -1))}
          aria-label={t(kind === "month" ? "period.prevMonth" : "period.prevYear")}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "group inline-flex items-center justify-center gap-2 rounded-md px-2.5 font-display leading-none transition-colors hover:bg-secondary/60",
                size === "lg" ? "h-10 min-w-[11rem] text-[1.6rem]" : "h-8 min-w-[9.5rem] text-[1.35rem]",
              )}
              aria-label={t("period.pick")}
            >
              <span className="whitespace-nowrap">{formatPeriod(period, i18n.language)}</span>
              <CalendarDays className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent>
            {kind === "month" ? <MonthGrid period={period} onPick={pick} /> : <YearGrid period={period} onPick={pick} />}
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setPeriod(shiftPeriod(period, 1))}
          aria-label={t(kind === "month" ? "period.nextMonth" : "period.nextYear")}
        >
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>

      {allowYear ? (
        <Segmented
          size="sm"
          ariaLabel={t("period.pick")}
          value={kind}
          onChange={(next) => {
            if (next !== kind) setPeriod(togglePeriodKind(period));
          }}
          options={[
            { value: "month", label: t("period.month") },
            { value: "year", label: t("period.year") },
          ]}
        />
      ) : null}

      {future ? <span className="stamp border-due/70 text-due">{t("period.future")}</span> : null}
      {!isCurrent ? (
        <Button variant="link" size="sm" className="text-xs" onClick={() => setPeriod(null)}>
          {t("common.backToToday")}
        </Button>
      ) : null}
    </div>
  );
};
