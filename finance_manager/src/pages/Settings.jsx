// f° IV — Réglages (FINANCE_PLAN.md §5.4, §5.5, §8). Expense categories (add / edit / archive / delete an
// unused one), the default margin used for sale lines without a purchase price, the PIN, the display
// preferences and a short system card (API mode, sales database, idle lock).
import {
  Archive,
  ArchiveRestore,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  Moon,
  Pencil,
  Percent,
  Plus,
  Server,
  SlidersHorizontal,
  Sun,
  Tags,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CategoryIcon } from "../components/CategoryIcon";
import { Money } from "../components/Money";
import { Card, EmptyState, ErrorState, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { FieldLabel, Input } from "../components/ui/input";
import { Segmented, Skeleton } from "../components/ui/segmented";
import { Switch } from "../components/ui/switch";
import { Tip } from "../components/ui/tooltip";
import { useExpenseActions } from "../context/ExpenseActions";
import { usePreferences } from "../context/PreferencesContext";
import { useSession } from "../context/SessionContext";
import { useResource } from "../hooks/useResource";
import { categoriesApi, sessionApi, settingsApi } from "../lib/api";
import { CATEGORY_COLORS, CATEGORY_ICON_NAMES, categoryIcon, categoryName } from "../lib/categoryIcons";
import { errorMessage } from "../lib/errors";
import { emitDataChanged } from "../lib/events";
import { formatAmount, formatInt } from "../lib/format";
import { cn } from "../lib/utils";

const delay = (ms) => ({ animationDelay: `${ms}ms` });
const parseAmount = (value) => Number(String(value).replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
const PIN_RE = /^\d{4,8}$/;

// ---------------------------------------------------------------------------------------------------------
// Category dialog (new / edit)
// ---------------------------------------------------------------------------------------------------------

const formFrom = (category) => ({
  name_fr: category?.name_fr ?? "",
  name_ar: category?.name_ar ?? "",
  icon: category?.icon ?? "tag",
  color: category?.color ?? CATEGORY_COLORS[0],
  is_personal: Boolean(category?.is_personal),
  is_fixed: Boolean(category?.is_fixed),
  monthly_budget:
    category?.monthly_budget === null || category?.monthly_budget === undefined
      ? ""
      : formatAmount(category.monthly_budget).replace(/[\u00a0\u202f]/g, " "),
});

const ToggleRow = ({ label, hint, checked, onCheckedChange, id }) => (
  <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-input bg-background/40 px-3.5 py-3">
    <span className="min-w-0">
      <span className="block text-sm font-semibold">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span> : null}
    </span>
    <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
  </label>
);

const CategoryDialog = ({ open, onOpenChange, category }) => {
  const { t, i18n } = useTranslation();
  const editing = Boolean(category);
  const [form, setForm] = useState(() => formFrom(category));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  const preview = { ...form, name_fr: form.name_fr || form.name_ar, name_ar: form.name_ar || form.name_fr };

  const submit = async (event) => {
    event.preventDefault();
    const nameFr = form.name_fr.trim();
    const nameAr = form.name_ar.trim();
    if (!nameFr && !nameAr) {
      setError(t("errors.INVALID_NAME"));
      return;
    }
    const budgetText = String(form.monthly_budget).trim();
    const budget = budgetText === "" ? null : parseAmount(budgetText);
    if (budget !== null && !(budget >= 0)) {
      setError(t("errors.INVALID_BUDGET"));
      return;
    }
    const body = {
      name_fr: nameFr || nameAr,
      name_ar: nameAr || nameFr,
      icon: form.icon,
      color: form.color,
      is_personal: form.is_personal,
      is_fixed: form.is_fixed,
      monthly_budget: budget,
    };
    setSaving(true);
    setError("");
    try {
      if (editing) {
        await categoriesApi.update(category.id, body);
        toast.success(t("common.saved"));
      } else {
        await categoriesApi.create(body);
        toast.success(t("settings.categoryCreated"));
      }
      emitDataChanged({ type: "category" });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide closeLabel={t("common.close")}>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <CategoryIcon category={preview} size="lg" />
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {editing ? categoryName(preview, i18n.language) : t("settings.newCategory")}
                </DialogTitle>
                <DialogDescription>{t("settings.categoriesHint")}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <FieldLabel>{t("settings.nameFr")}</FieldLabel>
                <Input
                  value={form.name_fr}
                  onChange={(event) => set("name_fr")(event.target.value)}
                  dir="ltr"
                  lang="fr"
                  maxLength={100}
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <FieldLabel>{t("settings.nameAr")}</FieldLabel>
                <Input
                  value={form.name_ar}
                  onChange={(event) => set("name_ar")(event.target.value)}
                  dir="rtl"
                  lang="ar"
                  maxLength={100}
                />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2">
                <FieldLabel>{t("settings.icon")}</FieldLabel>
              </legend>
              <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-11">
                {CATEGORY_ICON_NAMES.map((name) => {
                  const Icon = categoryIcon(name);
                  const active = form.icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => set("icon")(name)}
                      aria-label={name}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex aspect-square items-center justify-center rounded-md border transition-all",
                        active
                          ? "border-transparent text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.2)]"
                          : "border-input bg-paper text-foreground/70 hover:border-foreground/30 hover:text-foreground",
                      )}
                      style={active ? { backgroundColor: form.color } : undefined}
                    >
                      <Icon className="size-4" strokeWidth={2.2} />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2">
                <FieldLabel>{t("settings.color")}</FieldLabel>
              </legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => {
                  const active = form.color === color;
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => set("color")(color)}
                      aria-label={color}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-paper transition-transform hover:scale-110",
                        active && "ring-2 ring-foreground/70",
                      )}
                      style={{ backgroundColor: color }}
                    >
                      {active ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow
                id="category-personal"
                label={t("settings.personal")}
                hint={t("dialog.personalCategory")}
                checked={form.is_personal}
                onCheckedChange={set("is_personal")}
              />
              <ToggleRow
                id="category-fixed"
                label={t("settings.fixed")}
                hint={t("overview.breakEven")}
                checked={form.is_fixed}
                onCheckedChange={set("is_fixed")}
              />
            </div>

            <label className="flex max-w-xs flex-col gap-1.5">
              <FieldLabel optional optionalText={t("common.optional")}>
                {t("settings.budget")}
              </FieldLabel>
              <div className="relative">
                <Input
                  value={form.monthly_budget}
                  onChange={(event) => set("monthly_budget")(event.target.value)}
                  inputMode="decimal"
                  placeholder={t("settings.noBudget")}
                  className="figure pe-12"
                  dir="ltr"
                />
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                  {t("common.currency")}
                </span>
              </div>
            </label>

            {error ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm font-medium text-loss">{error}</p> : null}
          </DialogBody>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              {editing ? t("common.save") : t("common.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------------------

const Tag = ({ children, className }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-sm border px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-wider",
      className,
    )}
  >
    {children}
  </span>
);

const CategoryRow = ({ category, onEdit, index }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [busy, setBusy] = useState(false);
  const other = lang === "ar" ? category.name_fr : category.name_ar;
  const used = category.expense_count > 0;

  const run = async (work, message) => {
    setBusy(true);
    try {
      const result = await work();
      emitDataChanged({ type: "category" });
      toast.success(typeof message === "function" ? message(result) : message);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const archive = () => run(() => categoriesApi.update(category.id, { archived: true }), t("settings.categoryArchived"));
  const unarchive = () => run(() => categoriesApi.update(category.id, { archived: false }), t("common.saved"));
  const remove = () =>
    run(
      () => categoriesApi.remove(category.id),
      (result) => (result?.archived ? t("settings.categoryArchived") : t("settings.categoryDeleted")),
    );

  return (
    <li
      className={cn(
        "animate-rise-in grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-rule/60 px-4 py-3 last:border-b-0 sm:px-5",
        category.archived && "bg-secondary/30",
      )}
      style={delay(Math.min(index, 14) * 25)}
    >
      <CategoryIcon category={category} className={cn(category.archived && "opacity-50 grayscale")} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("truncate text-[0.92rem] font-semibold", category.archived && "text-muted-foreground")}>
            {categoryName(category, lang)}
          </span>
          {category.is_personal ? <Tag className="border-due/50 text-due">{t("settings.personal")}</Tag> : null}
          {category.is_fixed ? <Tag className="border-primary/40 text-primary">{t("settings.fixed")}</Tag> : null}
          {category.archived ? (
            <Tag className="border-muted-foreground/40 text-muted-foreground">{t("settings.archived")}</Tag>
          ) : null}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 truncate text-xs text-muted-foreground">
          {other && other !== categoryName(category, lang) ? (
            <>
              <span dir="auto">{other}</span>
              <span aria-hidden>·</span>
            </>
          ) : null}
          <span>{t("settings.used", { count: category.expense_count })}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-baseline gap-1">
            {t("settings.budget")}
            {category.monthly_budget !== null ? (
              <Money value={category.monthly_budget} round className="font-semibold text-foreground/80" />
            ) : (
              <span className="italic">{t("settings.noBudget")}</span>
            )}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        {busy ? <Loader2 className="me-2 size-4 animate-spin text-muted-foreground" /> : null}
        {category.archived ? (
          <Button variant="outline" size="sm" onClick={unarchive} disabled={busy}>
            <ArchiveRestore />
            <span className="hidden sm:inline">{t("settings.unarchive")}</span>
          </Button>
        ) : (
          <>
            <Tip label={t("common.edit")}>
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(category)} aria-label={t("common.edit")}>
                <Pencil />
              </Button>
            </Tip>
            {used ? (
              <Tip label={t("settings.archive")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={archive}
                  disabled={busy}
                  aria-label={t("settings.archive")}
                  className="hover:bg-due-soft hover:text-due"
                >
                  <Archive />
                </Button>
              </Tip>
            ) : (
              <Tip label={t("common.delete")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={remove}
                  disabled={busy}
                  aria-label={t("common.delete")}
                  className="hover:bg-loss-soft hover:text-loss"
                >
                  <Trash2 />
                </Button>
              </Tip>
            )}
          </>
        )}
      </div>
    </li>
  );
};

const CategoriesCard = ({ style }) => {
  const { t } = useTranslation();
  const { categories } = useExpenseActions();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState(null);

  const archivedCount = categories.filter((category) => category.archived).length;
  const visible = useMemo(
    () => categories.filter((category) => showArchived || !category.archived),
    [categories, showArchived],
  );
  const business = visible.filter((category) => !category.is_personal);
  const personal = visible.filter((category) => category.is_personal);

  const openDialog = (category) => setDialog({ key: Date.now(), open: true, category });
  const onOpenChange = (next) => {
    if (!next) setDialog((current) => (current ? { ...current, open: false } : current));
  };

  const group = (label, rows, offset) =>
    rows.length > 0 ? (
      <div>
        <p className="eyebrow border-b-2 border-foreground/50 bg-background/50 px-4 py-2 sm:px-5">
          {label} <span className="figure ms-1 text-foreground/60">{rows.length}</span>
        </p>
        <ul>
          {rows.map((category, index) => (
            <CategoryRow key={category.id} category={category} onEdit={openDialog} index={offset + index} />
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <Card
      eyebrow={<span className="inline-flex items-center gap-1.5"><Tags className="size-3.5" />{t("settings.categories")}</span>}
      title={t("settings.categories")}
      style={style}
      bodyClassName="px-0 pb-0 pt-2"
      actions={
        <Button size="sm" onClick={() => openDialog(null)}>
          <Plus strokeWidth={2.6} />
          {t("settings.newCategory")}
        </Button>
      }
    >
      <p className="px-5 pb-3 text-sm leading-relaxed text-muted-foreground">{t("settings.categoriesHint")}</p>
      {archivedCount > 0 ? (
        <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-dashed border-rule px-5 py-2.5 text-sm">
          <span className="font-medium text-foreground/80">
            {t("settings.showArchived")} <span className="figure text-muted-foreground">({archivedCount})</span>
          </span>
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
        </label>
      ) : null}
      {categories.length === 0 ? (
        <div className="space-y-2 px-5 pb-5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Tags} title={t("common.none")} />
      ) : (
        <div className="border-t border-rule/70">
          {group(t("nav.expenses"), business, 0)}
          {group(t("overview.personalTag"), personal, business.length)}
        </div>
      )}
      {dialog ? (
        <CategoryDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} category={dialog.category} />
      ) : null}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Default margin
// ---------------------------------------------------------------------------------------------------------

const MarginCard = ({ settings, onSaved, style }) => {
  const { t } = useTranslation();
  const saved = settings?.default_margin_pct ?? null;
  const [value, setValue] = useState(saved === null ? "" : String(saved));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (saved !== null) setValue(String(saved));
  }, [saved]);

  const numeric = Number(String(value).replace(",", "."));
  const valid = value !== "" && Number.isFinite(numeric) && numeric >= 0 && numeric <= 95;
  const dirty = valid && saved !== null && numeric !== Number(saved);

  const save = async (event) => {
    event.preventDefault();
    if (!valid) {
      toast.error(t("errors.INVALID_MARGIN"));
      return;
    }
    setBusy(true);
    try {
      const next = await settingsApi.update({ default_margin_pct: numeric });
      onSaved(next);
      emitDataChanged({ type: "settings" });
      toast.success(t("common.saved"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      eyebrow={<span className="inline-flex items-center gap-1.5"><Percent className="size-3.5" />{t("settings.margin")}</span>}
      style={style}
    >
      {settings ? (
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex items-baseline gap-1">
              <input
                value={value}
                onChange={(event) => setValue(event.target.value.replace(/[^\d.,]/g, "").slice(0, 5))}
                inputMode="decimal"
                aria-label={t("settings.margin")}
                dir="ltr"
                className={cn(
                  "display-figure w-[4.5ch] border-b-2 bg-transparent text-[3.4rem] leading-none outline-none transition-colors focus:border-primary",
                  valid ? "border-foreground/40" : "border-loss text-loss",
                )}
              />
              <span className="font-display text-3xl text-muted-foreground">%</span>
            </div>
            <Button type="submit" size="sm" disabled={!dirty || busy} className="mb-2 ms-auto">
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {t("common.save")}
            </Button>
          </div>
          <input
            type="range"
            min={0}
            max={95}
            step={1}
            value={valid ? numeric : 0}
            onChange={(event) => setValue(event.target.value)}
            aria-label={t("settings.margin")}
            className="w-full cursor-pointer accent-[hsl(var(--primary))]"
          />
          <div className="figure -mt-2 flex justify-between text-[0.65rem] text-muted-foreground" dir="ltr">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>95</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("settings.marginHint")}</p>
        </form>
      ) : (
        <Skeleton className="h-28 w-full" />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------------------------------------

const PinInput = ({ label, value, onChange, autoComplete }) => (
  <label className="flex flex-col gap-1.5">
    <FieldLabel>{label}</FieldLabel>
    <Input
      type="password"
      inputMode="numeric"
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
      className="figure tracking-[0.4em]"
      dir="ltr"
      maxLength={8}
    />
  </label>
);

const PinCard = ({ style }) => {
  const { t } = useTranslation();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!PIN_RE.test(next)) {
      setError(t("pin.invalid"));
      return;
    }
    if (next !== confirm) {
      setError(t("pin.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await sessionApi.changePin(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(t("settings.pinChanged"));
    } catch (err) {
      const body = err?.body ?? {};
      if (err?.code === "WRONG_PIN") setError(t("settings.pinWrong"));
      else if (err?.code === "TOO_MANY_ATTEMPTS") setError(t("pin.tooMany", { seconds: body.retry_after ?? 60 }));
      else if (err?.code === "INVALID_PIN") setError(t("pin.invalid"));
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      eyebrow={<span className="inline-flex items-center gap-1.5"><KeyRound className="size-3.5" />{t("settings.pinTitle")}</span>}
      style={style}
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{t("settings.pinHint")}</p>
        <PinInput label={t("settings.currentPin")} value={current} onChange={setCurrent} autoComplete="current-password" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <PinInput label={t("settings.newPin")} value={next} onChange={setNext} autoComplete="new-password" />
          <PinInput label={t("settings.confirmPin")} value={confirm} onChange={setConfirm} autoComplete="new-password" />
        </div>
        {error ? <p className="rounded-md bg-loss-soft px-3 py-2 text-sm font-medium text-loss">{error}</p> : null}
        <Button type="submit" variant="outline" className="w-full" disabled={busy || !current || !next || !confirm}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {t("settings.pinTitle")}
        </Button>
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Display preferences + system
// ---------------------------------------------------------------------------------------------------------

const PreferencesCard = ({ style }) => {
  const { t } = useTranslation();
  const { theme, setTheme, lang, setLang, discreet, toggleDiscreet } = usePreferences();
  const row = "flex items-center justify-between gap-4 border-b border-rule/60 py-3 first:pt-0 last:border-b-0 last:pb-0";
  return (
    <Card
      eyebrow={<span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="size-3.5" />{t("settings.preferences")}</span>}
      style={style}
    >
      <div>
        <div className={row}>
          <span className="text-sm font-medium">{t("common.theme")}</span>
          <Segmented
            size="sm"
            value={theme}
            onChange={setTheme}
            ariaLabel={t("common.theme")}
            options={[
              { value: "light", label: <><Sun className="size-3.5" />{t("common.light")}</> },
              { value: "dark", label: <><Moon className="size-3.5" />{t("common.dark")}</> },
            ]}
          />
        </div>
        <div className={row}>
          <span className="text-sm font-medium">{t("common.language")}</span>
          <Segmented
            size="sm"
            value={lang}
            onChange={setLang}
            ariaLabel={t("common.language")}
            options={[
              { value: "fr", label: "Français" },
              { value: "ar", label: <span lang="ar">العربية</span> },
            ]}
          />
        </div>
        <label className={cn(row, "cursor-pointer")}>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("common.discreet")}</span>
            <span className="block text-xs text-muted-foreground">{t("common.discreetHint")}</span>
          </span>
          <Switch checked={discreet} onCheckedChange={toggleDiscreet} />
        </label>
      </div>
    </Card>
  );
};

const SystemCard = ({ settings, style }) => {
  const { t } = useTranslation();
  const { health, idleMinutes } = useSession();
  const items = [
    { key: "apiMode", value: t("common.apiMode.mysql") },
    {
      key: "salesDb",
      value: (
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", health?.sales_db ? "text-gain" : "text-loss")}>
          <span className={cn("size-1.5 rounded-full", health?.sales_db ? "bg-gain" : "bg-loss")} aria-hidden />
          {t(health?.sales_db ? "settings.connected" : "settings.disconnected")}
        </span>
      ),
    },
    { key: "idleLock", value: t("settings.idleLockValue", { minutes: formatInt(settings?.idle_minutes ?? idleMinutes) }) },
  ];
  return (
    <Card
      eyebrow={<span className="inline-flex items-center gap-1.5"><Server className="size-3.5" />{t("settings.system")}</span>}
      style={style}
    >
      <dl className="space-y-2.5 text-sm">
        {items.map((item) => (
          <div key={item.key} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{t(`settings.${item.key}`)}</dt>
            <dd className="text-end font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      {settings?.sales_app_url ? (
        <Button variant="outline" size="sm" asChild className="mt-4 w-full">
          <a href={settings.sales_app_url} target="_blank" rel="noreferrer">
            {t("settings.salesApp")}
            <ExternalLink className="rtl:-scale-x-100" />
          </a>
        </Button>
      ) : null}
      <p className="mt-4 border-t border-dashed border-rule pt-3 text-[0.7rem] leading-relaxed text-muted-foreground">
        {t("app.internal")}
      </p>
    </Card>
  );
};

// ---------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------

export default function Settings() {
  const { t } = useTranslation();
  const settings = useResource(({ signal }) => settingsApi.get({ signal }), []);

  return (
    <div className="space-y-6 lg:space-y-7">
      <PageHeader folio="IV" eyebrow={t("app.tagline")} title={t("settings.title")} />

      {settings.error && !settings.data ? <ErrorState error={settings.error} onRetry={settings.reload} /> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-6">
        <CategoriesCard style={delay(60)} />
        <div className="space-y-5 lg:space-y-6">
          <MarginCard settings={settings.data} onSaved={(next) => settings.setData(next)} style={delay(120)} />
          <PinCard style={delay(180)} />
          <PreferencesCard style={delay(240)} />
          <SystemCard settings={settings.data} style={delay(300)} />
        </div>
      </div>
    </div>
  );
}
