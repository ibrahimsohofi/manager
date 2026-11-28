// Shared page furniture: the page head (folio number, serif title), the paper cards and the empty / error
// states, so the four screens read like pages of the same account book.
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../lib/errors";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export const PageHeader = ({ folio, eyebrow, title, subtitle, actions, children, className }) => (
  <header className={cn("animate-rise-in", className)}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-2">
          {folio ? <span className="figure text-loss/80">f° {folio}</span> : null}
          {folio && eyebrow ? <span className="h-px w-5 bg-rule" /> : null}
          {eyebrow}
        </p>
        <h1 className="mt-1.5 font-display text-[2.6rem] leading-[0.95] tracking-tight sm:text-[3.25rem]">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {children ? <div className="no-print mt-5">{children}</div> : null}
    <div aria-hidden className="mt-5 h-px origin-[0%_50%] animate-ink-draw bg-foreground/70 rtl:origin-[100%_50%]" />
    <div aria-hidden className="mt-[3px] h-px origin-[0%_50%] animate-ink-draw bg-foreground/25 [animation-delay:120ms] rtl:origin-[100%_50%]" />
  </header>
);

/** A sheet of paper with an optional head (title + right-side actions). */
export const Card = ({ title, eyebrow, actions, children, className, bodyClassName, style, as: Tag = "section" }) => (
  <Tag className={cn("paper-card animate-rise-in", className)} style={style}>
    {title || actions || eyebrow ? (
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="font-display text-[1.55rem] leading-tight tracking-tight">{title}</h2> : null}
        </div>
        {actions ? <div className="no-print flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
    ) : null}
    <div className={cn("px-5 pb-5 pt-3", bodyClassName)}>{children}</div>
  </Tag>
);

export const EmptyState = ({ icon: Icon, title, text, action, className }) => (
  <div className={cn("ledger-rules flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center", className)}>
    {Icon ? (
      <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full border-2 border-dashed border-rule text-muted-foreground">
        <Icon className="size-5" />
      </span>
    ) : null}
    {title ? <p className="font-display text-2xl leading-tight">{title}</p> : null}
    {text ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const ErrorState = ({ error, onRetry, className }) => {
  const { t } = useTranslation();
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed border-loss/40 bg-loss-soft/40 px-6 py-8 text-center", className)}>
      <AlertCircle className="size-6 text-loss" />
      <p className="text-sm font-medium text-loss">{errorMessage(error)}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={() => onRetry()}>
          <RefreshCw />
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
};

/** Prev / next pager under lists and tables. */
export const Pager = ({ page, pages, onChange, className }) => {
  const { t } = useTranslation();
  if (!pages || pages <= 1) return null;
  return (
    <div className={cn("no-print flex items-center justify-between gap-3 pt-4", className)}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t("common.previous")}
      </Button>
      <span className="figure text-xs text-muted-foreground">{t("common.pageOf", { page, pages })}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t("common.next")}
      </Button>
    </div>
  );
};
