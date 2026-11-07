// ==================== Entry form page (create / edit) ====================

const initialForm = (entry, type, termsDays) => {
  if (entry) {
    return {
      type: entry.type,
      amount: String(entry.amount),
      transaction_date: entry.transaction_date || localToday(),
      due_date: entry.due_date || "",
      reference: entry.reference || "",
      payment_method: entry.payment_method || "cash",
      description: entry.description || "",
      notes: entry.notes || "",
    };
  }
  const today = localToday();
  return {
    type,
    amount: "",
    transaction_date: today,
    due_date:
      type === "purchase" && termsDays > 0 ? addDays(today, termsDays) : "",
    reference: "",
    payment_method: "cash",
    description: "",
    notes: "",
  };
};

export const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";

/**
 * Create or edit a ledger entry, rendered as a full page section
 * (routes `/suppliers/:supplierId/ledger/new` and `/suppliers/:supplierId/ledger/:entryId/edit`).
 * @param {object} props.supplier - { id, name, payment_terms }
 * @param {object|null} props.entry - existing entry when editing
 * @param {string} props.initialType - "purchase" | "payment" | "return" (create only)
 * @param {number} props.currentBalance - full-history balance of the supplier
 * @param {() => void} props.onCancel
 * @param {(saved: object, isEdit: boolean) => void} props.onSaved
 */
export function EntryForm({
  supplier,
  entry = null,
  initialType = "purchase",
  currentBalance = 0,
  onCancel,
  onSaved,
}) {
  const { t, tr, money, currency } = useLedgerT();
  const isEdit = Boolean(entry);
  const termsDays = paymentTermsDays(supplier?.payment_terms);
  const [form, setForm] = useState(() =>
    initialForm(entry, initialType, termsDays),
  );
  const [dueAuto, setDueAuto] = useState(!entry);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => amountRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const clearError = (key) =>
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const setField = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (
        key === "transaction_date" &&
        dueAuto &&
        next.type === "purchase" &&
        termsDays > 0 &&
        isValidDateString(value)
      ) {
        next.due_date = addDays(value, termsDays);
      }
      return next;
    });
    clearError(key);
    setServerError("");
  };

  const setType = (type) => {
    setForm((prev) => {
      const next = { ...prev, type };
      if (type === "purchase" && dueAuto && !prev.due_date && termsDays > 0) {
        next.due_date = addDays(prev.transaction_date, termsDays);
      }
      return next;
    });
    setErrors({});
    setServerError("");
  };

  const setDue = (value) => {
    setDueAuto(false);
    setField("due_date", value);
  };

  const amountValue = parseAmount(form.amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;
  const baseBalance = round2(
    (Number(currentBalance) || 0) -
      (isEdit ? signedAmount(entry.type, entry.amount) : 0),
  );
  const effect = validAmount ? signedAmount(form.type, amountValue) : null;
  const balanceAfter = effect === null ? null : round2(baseBalance + effect);

  const dueChips = [];
  if (termsDays > 0)
    dueChips.push({
      key: "terms",
      days: termsDays,
      label: tr("form.dueTerms", { days: termsDays }),
    });
  for (const days of [30, 60, 90]) {
    if (days !== termsDays)
      dueChips.push({
        key: `d${days}`,
        days,
        label: tr("form.plusDays", { count: days }),
      });
  }

  const validate = () => {
    const next = {};
    if (!validAmount) next.amount = tr("form.errors.amount");
    else if (amountValue > MAX_AMOUNT)
      next.amount = tr("form.errors.amountTooLarge");
    if (!isValidDateString(form.transaction_date))
      next.transaction_date = tr("form.errors.date");
    if (form.type === "purchase" && form.due_date) {
      if (!isValidDateString(form.due_date))
        next.due_date = tr("form.errors.date");
      else if (form.due_date < form.transaction_date)
        next.due_date = tr("form.errors.dueBeforeDate");
    }
    return next;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      if (nextErrors.amount) amountRef.current?.focus();
      return;
    }

    const payload = {
      type: form.type,
      amount: round2(amountValue),
      transaction_date: form.transaction_date,
      due_date:
        form.type === "purchase" && form.due_date ? form.due_date : null,
      reference: form.reference.trim() || null,
      payment_method: form.type === "payment" ? form.payment_method : null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setServerError("");
    try {
      const saved = isEdit
        ? await ledgerApi.update(supplier.id, entry.id, payload)
        : await ledgerApi.create(supplier.id, payload);
      onSaved(saved || { ...payload, id: entry?.id }, isEdit);
    } catch (err) {
      if (err.code === "network") setServerError(tr("errors.network"));
      else if (err.status === 404) setServerError(tr("errors.entryNotFound"));
      else
        setServerError(
          `${tr("errors.save")}${err.message ? ` (${err.message})` : ""}`,
        );
      setSaving(false);
    }
  };

  const meta = TYPE_META[form.type];
  const errorText = (key) =>
    errors[key] ? (
      <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
        {errors[key]}
      </p>
    ) : null;

  const termsLabel = supplier?.payment_terms
    ? t(
        `suppliersPage.paymentTerms.${String(supplier.payment_terms).replace(/ /g, "").toLowerCase()}`,
        { defaultValue: supplier.payment_terms },
      )
    : "";

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="ledger-entry-title"
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]"
    >
      {/* ---------- Main card: fields ---------- */}
      <section className={`${card} overflow-hidden`}>
        <header
          className={`flex items-center gap-4 border-b border-s-4 border-b-gray-100 px-6 py-5 dark:border-b-gray-700 ${meta.rail}`}
        >
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${meta.icon}`}
          >
            <meta.Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              {supplier?.name}
            </p>
            <h2
              id="ledger-entry-title"
              className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900 dark:text-white"
            >
              {isEdit ? tr("form.editTitle") : tr(`form.newTitle.${form.type}`)}
            </h2>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6">
          {/* Type */}
          <fieldset>
            <legend className={fieldLabel}>{tr("form.type")}</legend>
            <div className="grid grid-cols-3 gap-2">
              {LEDGER_TYPES.map((type) => {
                const { Icon } = TYPE_META[type];
                const active = form.type === type;
                return (
                  <button
                    type="button"
                    key={type}
                    onClick={() => setType(type)}
                    aria-pressed={active}
                    disabled={saving}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold transition sm:flex-row sm:justify-center ${
                      active
                        ? TYPE_META[type].active
                        : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {tr(`types.${type}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {tr(`form.typeHint.${form.type}`)}
            </p>
          </fieldset>

          {/* Amount + date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ledger-amount" className={fieldLabel}>
                {tr("form.amount")} *
              </label>
              <div className="relative">
                <input
                  id="ledger-amount"
                  ref={amountRef}
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0,00"
                  aria-invalid={Boolean(errors.amount)}
                  className={`${inputClass} pe-14 text-xl font-bold tabular-nums ${errors.amount ? "border-red-400" : ""}`}
                />
                <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-gray-400">
                  {currency}
                </span>
              </div>
              {errorText("amount")}
              {/* Pay full balance shortcut */}
              {form.type === "payment" && baseBalance > 0 ? (
                <button
                  type="button"
                  onClick={() => setField("amount", baseBalance.toFixed(2))}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  {tr("form.payBalance", { amount: money(baseBalance) })}
                </button>
              ) : null}
            </div>
            <div>
              <label htmlFor="ledger-date" className={fieldLabel}>
                {tr("form.date")} *
              </label>
              <input
                id="ledger-date"
                type="date"
                value={form.transaction_date}
                onChange={(e) => setField("transaction_date", e.target.value)}
                aria-invalid={Boolean(errors.transaction_date)}
                className={`${inputClass} py-3 ${errors.transaction_date ? "border-red-400" : ""}`}
              />
              {errorText("transaction_date")}
            </div>
          </div>

          {/* Due date (purchases) */}
          {form.type === "purchase" ? (
            <div>
              <label htmlFor="ledger-due" className={fieldLabel}>
                {tr("form.dueDate")}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="ledger-due"
                  type="date"
                  value={form.due_date}
                  min={form.transaction_date || undefined}
                  onChange={(e) => setDue(e.target.value)}
                  aria-invalid={Boolean(errors.due_date)}
                  className={`${inputClass} sm:max-w-[11rem] ${errors.due_date ? "border-red-400" : ""}`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {dueChips.map((chip) => {
                    const value = isValidDateString(form.transaction_date)
                      ? addDays(form.transaction_date, chip.days)
                      : "";
                    const active = value && form.due_date === value;
                    return (
                      <button
                        type="button"
                        key={chip.key}
                        onClick={() => setDue(value)}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                          active
                            ? "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700"
                            : "text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setDue("")}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                      !form.due_date
                        ? "bg-gray-200 text-gray-800 ring-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:ring-gray-500"
                        : "text-gray-600 ring-gray-200 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    {tr("form.noDue")}
                  </button>
                </div>
              </div>
              {errorText("due_date")}
            </div>
          ) : null}

          {/* Payment method */}
          {form.type === "payment" ? (
            <fieldset>
              <legend className={fieldLabel}>{tr("form.method")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_METHODS.map((method) => {
                  const active = form.payment_method === method;
                  return (
                    <button
                      type="button"
                      key={method}
                      onClick={() => setField("payment_method", method)}
                      aria-pressed={active}
                      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                        active
                          ? "bg-emerald-700 text-white ring-emerald-700"
                          : "text-gray-700 ring-gray-200 hover:bg-gray-50 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700/50"
                      }`}
                    >
                      {tr(`methods.${method}`)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* Reference + description */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <label htmlFor="ledger-ref" className={fieldLabel}>
                {tr(`form.reference.${form.type}`)}
              </label>
              <input
                id="ledger-ref"
                value={form.reference}
                maxLength={100}
                onChange={(e) => setField("reference", e.target.value)}
                placeholder={tr(`form.referencePlaceholder.${form.type}`)}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="ledger-desc" className={fieldLabel}>
                {tr("form.description")}
              </label>
              <input
                id="ledger-desc"
                value={form.description}
                maxLength={500}
                onChange={(e) => setField("description", e.target.value)}
                placeholder={tr("form.descriptionPlaceholder")}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="ledger-notes" className={fieldLabel}>
              {tr("form.notes")}
            </label>
            <textarea
              id="ledger-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder={tr("form.notesPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </div>
        </div>
      </section>

      {/* ---------- Side panel: balance preview + actions ---------- */}
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className={`${card} p-5`}>
          <p className={fieldLabel}>{tr("form.preview")}</p>
          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">
                {isEdit ? tr("form.balanceWithout") : tr("form.balanceNow")}
              </dt>
              <dd
                className={`font-semibold tabular-nums ${balanceTextTone(baseBalance)}`}
              >
                {money(baseBalance)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-gray-500 dark:text-gray-400">
                {tr("form.thisEntry")}
              </dt>
              <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {effect === null
                  ? "—"
                  : `${effect > 0 ? "+" : "−"} ${money(Math.abs(effect))}`}
              </dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-dashed border-gray-300 pt-4 dark:border-gray-600">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {tr("form.balanceAfter")}
            </p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p
                className={`text-2xl font-bold tabular-nums tracking-tight ${balanceAfter === null ? "text-gray-400" : balanceTextTone(balanceAfter)}`}
              >
                {balanceAfter === null ? "—" : money(balanceAfter)}
              </p>
              {balanceAfter === null ? null : (
                <BalancePill balance={balanceAfter} />
              )}
            </div>
          </div>
          {termsLabel ? (
            <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
              {tr("form.terms", { terms: termsLabel })}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-sm transition disabled:opacity-60 ${meta.button}`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <meta.Icon className="h-4 w-4" />
            )}
            {saving
              ? tr("form.saving")
              : isEdit
                ? tr("form.saveChanges")
                : tr("form.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={`${ghostButton} w-full py-2.5`}
          >
            {tr("form.cancel")}
          </button>
        </div>
      </aside>
    </form>
  );
}
