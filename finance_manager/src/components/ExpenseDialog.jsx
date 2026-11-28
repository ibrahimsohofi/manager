// Quick add (FINANCE_PLAN.md §8 "under 10 seconds"): big amount field, category chips, date = today,
// Enter to save. Optional fields (month concerned, spread, payee, reference, notes) fold away.
import { ChevronDown, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { expensesApi } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { emitDataChanged } from "../lib/events";
import { formatAmount } from "../lib/format";
import { todayISO } from "../lib/period";
import { cn } from "../lib/utils";
import { CategoryIcon } from "./CategoryIcon";
import { categoryName } from "../lib/categoryIcons";
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
import { FieldLabel, Input, Select, Textarea } from "./ui/input";
import { Switch } from "./ui/switch";

const SPREAD_OPTIONS = [1, 2, 3, 4, 6, 12, 18, 24, 36];

const parseAmount = (value) => Number(String(value).replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));

const emptyForm = (preset) => {
  const today = todayISO();
  return {
    amount: "",
    category_id: preset?.category_id ?? null,
    expense_date: today,
    description: "",
    pending: preset?.status === "pending",
    due_date: "",
    period_month: today.slice(0, 7),
    period_touched: false,
    spread_months: 1,
    payee: "",
    reference: "",
    notes: "",
  };
};

const fromExpense = (expense) => ({
  amount: formatAmount(expense.amount).replace(/[\u00a0\u202f]/g, " "),
  category_id: expense.category_id,
  expense_date: expense.expense_date,
  description: expense.description ?? "",
  pending: expense.status === "pending",
  due_date: expense.due_date ?? "",
  period_month: expense.period_month,
  period_touched: expense.period_month !== String(expense.expense_date).slice(0, 7),
  spread_months: expense.spread_months ?? 1,
  payee: expense.payee ?? "",
  reference: expense.reference ?? "",
  notes: expense.notes ?? "",
});

export const ExpenseDialog = ({ open, onOpenChange, expense, preset, categories }) => {
  const { t, i18n } = useTranslation();
  const editing = Boolean(expense);
  const [form, setForm] = useState(() => (expense ? fromExpense(expense) : emptyForm(preset)));
  const [more, setMore] = useState(
    () =>
      Boolean(expense) &&
      (expense.spread_months > 1 ||
        Boolean(expense.payee || expense.reference || expense.notes) ||
        expense.period_month !== String(expense.expense_date).slice(0, 7)),
  );
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const visible = useMemo(
    () => categories.filter((category) => !category.archived || category.id === form.category_id),
    [categories, form.category_id],
  );
  const business = visible.filter((category) => !category.is_personal);
  const personal = visible.filter((category) => category.is_personal);
  const selected = categories.find((category) => category.id === form.category_id);

  const onDateChange = (value) => {
    setForm((current) => ({
      ...current,
      expense_date: value,
      period_month: current.period_touched || !value ? current.period_month : value.slice(0, 7),
    }));
  };

  const fail = (message) => {
    setError(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const amount = parseAmount(form.amount);
    if (!(amount > 0)) return fail(t("dialog.invalidAmount"));
    if (!form.category_id) return fail(t("dialog.chooseCategory"));
    setError("");
    setSaving(true);
    const body = {
      category_id: form.category_id,
      amount,
      expense_date: form.expense_date || todayISO(),
      period_month: form.period_month || (form.expense_date || todayISO()).slice(0, 7),
      spread_months: Number(form.spread_months) || 1,
      status: form.pending ? "pending" : "paid",
      due_date: form.pending ? form.due_date || null : null,
      description: form.description,
      payee: form.payee,
      reference: form.reference,
      notes: form.notes,
    };
    try {
      if (editing) await expensesApi.update(expense.id, body);
      else await expensesApi.create(body);
      emitDataChanged({ type: "expense" });
      toast.success(t(editing ? "expenses.updated" : "expenses.created"));
      onOpenChange(false);
    } catch (err) {
      fail(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const chip = (category) => {
    const active = category.id === form.category_id;
    return (
      <button
        key={category.id}
        type="button"
        onClick={() => set("category_id", category.id)}
        aria-pressed={active}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border pe-3 ps-1 text-[0.8rem] font-medium transition-all",
          active
            ? "border-primary bg-accent text-accent-foreground shadow-[0_0_0_1px_hsl(var(--primary))]"
            : "border-input bg-paper text-foreground/85 hover:border-foreground/30 hover:bg-secondary/50",
        )}
      >
        <CategoryIcon category={category} size="sm" />
        <span className="max-w-[11rem] truncate">{categoryName(category, i18n.language)}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t("common.close")} className={cn(shake && "sm:animate-shake")}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>{t(editing ? "dialog.editTitle" : "dialog.addTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("dialog.shortcut")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            {/* Amount */}
            <label className="group relative block rounded-lg border border-input bg-background/60 px-4 pb-1.5 pt-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="eyebrow">{t("dialog.amount")}</span>
              <span className="flex items-baseline gap-2">
                <input
                  autoFocus
                  inputMode="decimal"
                  autoComplete="off"
                  dir="ltr"
                  value={form.amount}
                  onChange={(event) => set("amount", event.target.value.replace(/[^\d\s.,]/g, ""))}
                  placeholder="0,00"
                  className="display-figure money-value w-full min-w-0 bg-transparent py-1 text-[3.25rem] text-foreground outline-none placeholder:text-muted-foreground/35 rtl:text-right"
                />
                <span className="shrink-0 text-lg font-semibold text-muted-foreground">{t("common.currency")}</span>
              </span>
              <span
                aria-hidden
                className="absolute inset-x-4 bottom-2 h-px bg-[repeating-linear-gradient(90deg,hsl(var(--rule))_0_6px,transparent_6px_10px)]"
              />
            </label>

            {/* Categories */}
            <fieldset className="space-y-2">
              <legend className="mb-2">
                <FieldLabel>{t("dialog.category")}</FieldLabel>
              </legend>
              <div className="flex flex-wrap gap-1.5">{business.map(chip)}</div>
              {personal.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-rule pt-2">
                  <span className="eyebrow me-1">{t("overview.personalTag")}</span>
                  {personal.map(chip)}
                </div>
              ) : null}
              {selected?.is_personal ? (
                <p className="rounded-md bg-due-soft px-2.5 py-1.5 text-xs text-due">{t("dialog.personalCategory")}</p>
              ) : null}
            </fieldset>

            {/* Date + label */}
            <div className="grid gap-3 sm:grid-cols-[10.5rem_1fr]">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>{t("dialog.date")}</FieldLabel>
                <Input type="date" value={form.expense_date} onChange={(event) => onDateChange(event.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel optional optionalText={t("common.optional")}>
                  {t("dialog.description")}
                </FieldLabel>
                <Input
                  value={form.description}
                  maxLength={255}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder={t("dialog.descriptionPlaceholder")}
                />
              </label>
            </div>

            {/* Pending */}
            <div
              className={cn(
                "rounded-lg border px-3.5 py-3 transition-colors",
                form.pending ? "border-due/50 bg-due-soft/60" : "border-input bg-background/40",
              )}
            >
              <label className="flex cursor-pointer items-start justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{t("dialog.pending")}</span>
                  <span className="text-xs text-muted-foreground">{t("dialog.pendingHint")}</span>
                </span>
                <Switch checked={form.pending} onCheckedChange={(value) => set("pending", value)} />
              </label>
              {form.pending ? (
                <label className="mt-3 flex flex-col gap-1.5 sm:max-w-[12rem]">
                  <FieldLabel optional optionalText={t("common.optional")}>
                    {t("dialog.dueDate")}
                  </FieldLabel>
                  <Input type="date" value={form.due_date} onChange={(event) => set("due_date", event.target.value)} />
                </label>
              ) : null}
            </div>

            {/* More options */}
            <div>
              <button
                type="button"
                onClick={() => setMore((value) => !value)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                aria-expanded={more}
              >
                <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} />
                {t(more ? "dialog.less" : "dialog.more")}
              </button>
              {more ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <FieldLabel>{t("dialog.periodMonth")}</FieldLabel>
                    <Input
                      type="month"
                      value={form.period_month}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, period_month: event.target.value, period_touched: true }))
                      }
                    />
                    <span className="text-xs leading-snug text-muted-foreground">{t("dialog.periodMonthHint")}</span>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <FieldLabel>{t("dialog.spread")}</FieldLabel>
                    <Select
                      value={String(form.spread_months)}
                      onChange={(event) => set("spread_months", Number(event.target.value))}
                    >
                      {SPREAD_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n} {t("dialog.months")}
                        </option>
                      ))}
                    </Select>
                    <span className="text-xs leading-snug text-muted-foreground">{t("dialog.spreadHint")}</span>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <FieldLabel optional optionalText={t("common.optional")}>
                      {t("dialog.payee")}
                    </FieldLabel>
                    <Input
                      value={form.payee}
                      maxLength={150}
                      onChange={(event) => set("payee", event.target.value)}
                      placeholder={t("dialog.payeePlaceholder")}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <FieldLabel optional optionalText={t("common.optional")}>
                      {t("dialog.reference")}
                    </FieldLabel>
                    <Input
                      value={form.reference}
                      maxLength={100}
                      onChange={(event) => set("reference", event.target.value)}
                      placeholder={t("dialog.referencePlaceholder")}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 sm:col-span-2">
                    <FieldLabel optional optionalText={t("common.optional")}>
                      {t("dialog.notes")}
                    </FieldLabel>
                    <Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} />
                  </label>
                </div>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <p
              className={cn(
                "me-auto text-sm",
                error ? "font-medium text-loss" : "hidden text-xs text-muted-foreground sm:block",
              )}
              aria-live="polite"
            >
              {error || t("dialog.shortcut")}
            </p>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving} className="min-w-[11rem]">
              {saving ? <Loader2 className="animate-spin" /> : null}
              {t(editing ? "dialog.submitEdit" : "dialog.submitAdd")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
