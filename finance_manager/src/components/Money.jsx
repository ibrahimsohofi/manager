// Every amount on screen goes through <Money>: fr-MA grouping, Latin digits, <bdi> so RTL never reorders
// the digits or the sign, and the `money-value` class used by the discreet mode (index.css).
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatAmount, formatPct } from "../lib/format";
import { cn } from "../lib/utils";

/**
 * @param {{value: number|null, round?: boolean, sign?: boolean, tone?: "auto"|"none"|"gain"|"loss"|"due",
 *   currency?: boolean, className?: string, currencyClassName?: string}} props
 */
export const Money = ({
  value,
  round = false,
  sign = false,
  tone = "none",
  currency = true,
  className,
  currencyClassName,
}) => {
  const { t } = useTranslation();
  const n = Number(value);
  const missing = value === null || value === undefined || !Number.isFinite(n);
  const toneClass =
    tone === "auto"
      ? !missing && n < 0
        ? "text-loss"
        : ""
      : tone === "gain"
        ? "text-gain"
        : tone === "loss"
          ? "text-loss"
          : tone === "due"
            ? "text-due"
            : "";
  return (
    <span className={cn("money inline-flex items-baseline gap-[0.28em] whitespace-nowrap", toneClass, className)}>
      <bdi className="figure money-value">{formatAmount(value, { round, sign })}</bdi>
      {currency && !missing ? (
        <span className={cn("text-[0.62em] font-medium uppercase tracking-wide opacity-60", currencyClassName)}>
          {t("common.currency")}
        </span>
      ) : null}
    </span>
  );
};

export const Pct = ({ value, sign = false, className }) => (
  <bdi className={cn("figure", className)}>{formatPct(value, { sign })}</bdi>
);

/**
 * Change pill vs another period. `invert` = a rise is bad (expenses).
 * @param {{value: number|null, invert?: boolean, label?: string, size?: "sm"|"md"}} props
 */
export const Change = ({ value, invert = false, label, size = "sm", className }) => {
  const missing = value === null || value === undefined || !Number.isFinite(Number(value));
  const n = Number(value);
  const flat = !missing && Math.abs(n) < 0.5;
  const good = !missing && !flat && (invert ? n < 0 : n > 0);
  const Icon = missing || flat ? Minus : n > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[0.7rem]" : "px-2 py-0.5 text-xs",
        missing || flat
          ? "bg-secondary text-muted-foreground"
          : good
            ? "bg-gain-soft text-gain"
            : "bg-loss-soft text-loss",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
      {missing ? <span>—</span> : <Pct value={Math.abs(n)} />}
      {label ? <span className="font-medium opacity-75">{label}</span> : null}
    </span>
  );
};
