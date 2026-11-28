import { cn } from "../../lib/utils";

/**
 * Segmented control (tabs, Mois / Année, status filter).
 * @param {{value: string, onChange: (v: string) => void, options: {value: string, label: React.ReactNode, count?: number}[]}} props
 */
export const Segmented = ({ value, onChange, options, className, size = "md", ariaLabel }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className={cn(
      "inline-flex items-center gap-0.5 rounded-lg border border-input bg-secondary/60 p-0.5",
      size === "sm" ? "text-xs" : "text-sm",
      className,
    )}
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-all",
            size === "sm" ? "h-7 px-2.5" : "h-8 px-3",
            active
              ? "bg-paper text-foreground shadow-[0_1px_2px_hsl(213_40%_20%/0.15),0_0_0_1px_hsl(var(--border))]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span
              className={cn(
                "figure rounded px-1 text-[0.68rem]",
                active ? "bg-primary/10 text-primary" : "bg-background/70 text-muted-foreground",
              )}
            >
              {option.count}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
);

export const Skeleton = ({ className }) => (
  <div className={cn("animate-pulse rounded-md bg-[hsl(var(--rule)/0.45)]", className)} />
);
