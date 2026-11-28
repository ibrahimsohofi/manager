// "Marquer comme payée": the real amount can differ from the planned one (water, electricity bills).
import { Loader2, Stamp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { expensesApi } from "../lib/api";
import { categoryName } from "../lib/categoryIcons";
import { errorMessage } from "../lib/errors";
import { emitDataChanged } from "../lib/events";
import { formatAmount, moneyText } from "../lib/format";
import { todayISO } from "../lib/period";
import { CategoryIcon } from "./CategoryIcon";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FieldLabel, Input } from "./ui/input";

const parseAmount = (value) => Number(String(value).replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));

export const PayDialog = ({ open, onOpenChange, expense }) => {
  const { t, i18n } = useTranslation();
  const [amount, setAmount] = useState(() => formatAmount(expense.amount).replace(/[\u00a0\u202f]/g, " "));
  const [date, setDate] = useState(todayISO);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const label = expense.description || categoryName(expense.category, i18n.language);

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const value = parseAmount(amount);
    if (!(value > 0)) {
      setError(t("dialog.invalidAmount"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await expensesApi.pay(expense.id, { amount: value, expense_date: date || todayISO() });
      emitDataChanged({ type: "expense" });
      toast.success(t("expenses.paid"));
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{t("pay.title")}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <CategoryIcon category={expense.category} size="sm" />
              <span>{t("pay.text", { label, amount: moneyText(expense.amount, t("common.currency")) })}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="block rounded-lg border border-input bg-background/60 px-4 pb-2 pt-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="eyebrow">{t("pay.amount")}</span>
              <span className="flex items-baseline gap-2">
                <input
                  autoFocus
                  dir="ltr"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d\s.,]/g, ""))}
                  className="display-figure money-value w-full min-w-0 bg-transparent py-1 text-[2.6rem] outline-none rtl:text-right"
                />
                <span className="shrink-0 text-base font-semibold text-muted-foreground">{t("common.currency")}</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{t("pay.amountHint")}</span>
            </label>
            <label className="flex flex-col gap-1.5 sm:max-w-[12rem]">
              <FieldLabel>{t("pay.date")}</FieldLabel>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </DialogBody>
          <DialogFooter>
            {error ? (
              <p className="me-auto text-sm font-medium text-loss" aria-live="polite">
                {error}
              </p>
            ) : null}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="due" disabled={saving} className="min-w-[12rem]">
              {saving ? <Loader2 className="animate-spin" /> : <Stamp />}
              {t("pay.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
