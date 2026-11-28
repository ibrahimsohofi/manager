import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = forwardRef(({ className, children, closeLabel = "Close", wide = false, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[hsl(213_70%_8%/0.5)] backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden border bg-paper text-foreground shadow-2xl outline-none",
        // Mobile: bottom sheet. Desktop: centred sheet of paper.
        "inset-x-0 bottom-0 rounded-t-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-8",
        "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[8vh] sm:max-h-[84vh] sm:-translate-x-1/2 sm:rounded-xl sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-[0.98]",
        wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        className,
      )}
      {...props}
    >
      {/* Ledger head band */}
      <div aria-hidden className="h-1.5 w-full shrink-0 bg-[repeating-linear-gradient(90deg,hsl(var(--primary))_0_18px,hsl(var(--primary)/0.75)_18px_20px)]" />
      <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-rule sm:hidden" />
      {children}
      <DialogPrimitive.Close
        className="absolute end-3 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label={closeLabel}
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({ className, ...props }) => (
  <div className={cn("shrink-0 px-5 pb-2 pt-4 pe-12 sm:px-6", className)} {...props} />
);

export const DialogBody = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("scrollbar-thin flex-1 overflow-y-auto px-5 py-3 sm:px-6", className)} {...props} />
));
DialogBody.displayName = "DialogBody";

export const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      "flex shrink-0 flex-col-reverse gap-2 border-t border-dashed border-rule bg-background/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6",
      className,
    )}
    {...props}
  />
);

export const DialogTitle = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-2xl leading-tight tracking-tight sm:text-[1.7rem]", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("mt-1 text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = "DialogDescription";
