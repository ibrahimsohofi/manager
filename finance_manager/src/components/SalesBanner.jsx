// "Ventes indisponibles" (FINANCE_PLAN.md §1.1): the sales database (bricojamal) can't be read. Expenses keep
// working; the sales-based figures come back as null. "Réessayer" forces the server to recheck at once.
import { DatabaseZap, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "../context/SessionContext";
import { financeApi } from "../lib/api";
import { emitDataChanged } from "../lib/events";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export const SalesBanner = ({ className }) => {
  const { t } = useTranslation();
  const { reloadHealth } = useSession();
  const [busy, setBusy] = useState(false);

  const retry = async () => {
    setBusy(true);
    try {
      await financeApi.salesStatus(true);
    } catch {
      /* the banner stays */
    }
    emitDataChanged({ type: "sales" });
    reloadHealth();
    setBusy(false);
  };

  return (
    <div
      aria-live="polite"
      className={cn(
        "animate-rise-in flex flex-col gap-3 rounded-lg border border-due/40 bg-due-soft/70 px-4 py-3.5 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-due/15 text-due">
        <DatabaseZap className="size-[1.1rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-due">{t("sales.unavailableTitle")}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-foreground/75">{t("sales.unavailableText")}</p>
      </div>
      <Button variant="outline" size="sm" onClick={retry} disabled={busy} className="self-start sm:self-auto">
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {busy ? t("sales.retrying") : t("common.retry")}
      </Button>
    </div>
  );
};
