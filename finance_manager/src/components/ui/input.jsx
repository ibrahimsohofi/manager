import { ChevronDown } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

const fieldBase =
  "w-full rounded-md border border-input bg-paper px-3 text-sm text-foreground shadow-[inset_0_1px_2px_hsl(213_40%_20%/0.06)] transition-colors placeholder:text-muted-foreground/70 hover:border-foreground/25 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef(({ className, type = "text", ...props }, ref) => (
  <input ref={ref} type={type} className={cn(fieldBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[72px] resize-y py-2", className)} {...props} />
));
Textarea.displayName = "Textarea";

/** Native select (works everywhere, RTL included) dressed like the inputs. */
export const Select = forwardRef(({ className, children, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <select ref={ref} className={cn(fieldBase, "h-10 cursor-pointer appearance-none pe-9")} {...props}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = "Select";

export const Label = ({ className, children, hint, ...props }) => (
  <label className={cn("flex flex-col gap-1.5 text-sm font-medium text-foreground/90", className)} {...props}>
    {children}
    {hint ? <span className="text-xs font-normal leading-snug text-muted-foreground">{hint}</span> : null}
  </label>
);

export const FieldLabel = ({ className, children, optional, optionalText }) => (
  <span className={cn("flex items-baseline gap-1.5 text-[0.8rem] font-semibold text-foreground/85", className)}>
    {children}
    {optional ? <span className="text-xs font-normal text-muted-foreground">({optionalText})</span> : null}
  </span>
);
