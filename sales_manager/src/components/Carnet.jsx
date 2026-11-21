// Carnet — people list (`/carnet`): leather cover with totals, search, filters, sort,
// archived toggle and one "notebook page" card per person.
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  CalendarClock,
  ChevronRight,
  NotebookPen,
  Package,
  Pencil,
  RotateCw,
  Search,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { balanceState, carnetApi, contactPath, relationLabel, round2 } from "../lib/carnet.js";
import {
  Avatar,
  BalanceTag,
  ConfirmDialog,
  ContactFormDialog,
  Notice,
  apiErrorText,
  balanceTone,
  chipBase,
  formatDayMonth,
  searchable,
  signedMoney,
  useCarnetT,
} from "./CarnetShared.jsx";

const FILTERS = ["all", "owesMe", "iOwe", "settled", "overdue", "items"];
const SORTS = ["recent", "amount", "name"];
const DEFAULTS = { q: "", filter: "all", sort: "recent", view: "active" };

const FILTER_TEST = {
  all: () => true,
  owesMe: (c) => round2(c.balance) > 0,
  iOwe: (c) => round2(c.balance) < 0,
  settled: (c) => round2(c.balance) === 0,
  overdue: (c) => (c.overdueCount || 0) > 0,
  items: (c) => (c.itemsOut || 0) + (c.itemsIn || 0) > 0,
};

const FILTER_DOT = {
  owesMe: "bg-emerald-500",
  iOwe: "bg-rose-500",
  settled: "bg-stone-400",
};

const EMPTY_SUMMARY = {
  balance: 0,
  totalGave: 0,
  totalReceived: 0,
  entryCount: 0,
  lastEntryDate: null,
  itemsOut: 0,
  itemsIn: 0,
  overdueCount: 0,
  overdueAmount: 0,
  nextDueDate: null,
};

/** Fallback when the API does not send totals (computed on active people only). */
const computeTotals = (contacts) => {
  const totals = {
    owedToMe: 0,
    iOwe: 0,
    net: 0,
    peopleOweMe: 0,
    peopleIOwe: 0,
    itemsOut: 0,
    itemsIn: 0,
    overduePeople: 0,
    contactCount: 0,
  };
  for (const c of contacts) {
    if (c.archived) continue;
    totals.contactCount += 1;
    if (c.balance > 0) {
      totals.owedToMe += c.balance;
      totals.peopleOweMe += 1;
    } else if (c.balance < 0) {
      totals.iOwe -= c.balance;
      totals.peopleIOwe += 1;
    }
    totals.itemsOut += c.itemsOut || 0;
    totals.itemsIn += c.itemsIn || 0;
    if (c.overdueCount > 0) totals.overduePeople += 1;
  }
  totals.owedToMe = round2(totals.owedToMe);
  totals.iOwe = round2(totals.iOwe);
  totals.net = round2(totals.owedToMe - totals.iOwe);
  return totals;
};

const activityKey = (c) => c.lastEntryDate || String(c.updated_at || c.created_at || "").slice(0, 10);

export default function Carnet() {
  const { t, tc, lang, currency, money, date } = useCarnetT();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const query = params.get("q") || DEFAULTS.q;
  const filter = FILTERS.includes(params.get("filter")) ? params.get("filter") : DEFAULTS.filter;
  const sort = SORTS.includes(params.get("sort")) ? params.get("sort") : DEFAULTS.sort;
  const showArchived = params.get("view") === "archived";

  const [contacts, setContacts] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // person being edited
  const [pendingDelete, setPendingDelete] = useState(null); // person waiting for delete confirmation
  const [deleting, setDeleting] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const searchRef = useRef(null);

  const updateParams = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === "" || value === DEFAULTS[key]) {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ----- Data -----
  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setStatus("loading");
      try {
        const res = await carnetApi.list({ archived: "all" });
        setContacts(Array.isArray(res?.contacts) ? res.contacts : []);
        setServerTotals(res?.totals || null);
        setLoadError(null);
        setStatus("ready");
      } catch (err) {
        if (silent) return;
        setLoadError(err);
        setStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Notice handed over by another page (e.g. person deleted on `/carnet/:id`)
  useEffect(() => {
    const incoming = location.state?.notice;
    if (!incoming) return;
    setNotice(incoming);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, navigate]);

  // Scroll to the person that was just added
  useEffect(() => {
    if (!highlightId) return undefined;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`carnet-person-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => setHighlightId(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [highlightId]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  // ----- Derived lists -----
  const totals = useMemo(() => serverTotals || computeTotals(contacts), [serverTotals, contacts]);
  const archivedCount = useMemo(() => contacts.filter((c) => c.archived).length, [contacts]);

  // Total spent: everything I gave (money, goods, services counted in the balance),
  // all people, archived included. Object loans and notes are not counted.
  const spent = useMemo(() => {
    let amount = 0;
    let people = 0;
    for (const c of contacts) {
      const gave = round2(c.totalGave);
      if (gave > 0) {
        amount += gave;
        people += 1;
      }
    }
    return { amount: round2(amount), people };
  }, [contacts]);

  const viewContacts = useMemo(
    () => contacts.filter((c) => Boolean(c.archived) === showArchived),
    [contacts, showArchived],
  );

  const searched = useMemo(() => {
    const needle = searchable(query.trim());
    if (!needle) return viewContacts;
    const digits = query.replace(/\D/g, "");
    return viewContacts.filter((c) => {
      const haystack = searchable(c.name, c.phone, c.relation, relationLabel(c.relation, t), c.notes);
      if (haystack.includes(needle)) return true;
      return digits.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(digits);
    });
  }, [viewContacts, query, t]);

  const counts = useMemo(() => {
    const result = {};
    for (const key of FILTERS) result[key] = searched.filter(FILTER_TEST[key]).length;
    return result;
  }, [searched]);

  const visible = useMemo(() => {
    const list = searched.filter(FILTER_TEST[filter]);
    const byName = (a, b) => String(a.name).localeCompare(String(b.name), lang);
    const sorters = {
      name: byName,
      amount: (a, b) => Math.abs(b.balance) - Math.abs(a.balance) || byName(a, b),
      recent: (a, b) => activityKey(b).localeCompare(activityKey(a)) || byName(a, b),
    };
    return [...list].sort(sorters[sort]);
  }, [searched, filter, sort, lang]);

  const hasFilters = Boolean(query.trim()) || filter !== "all";
  const clearFilters = () => updateParams({ q: "", filter: "all" });

  // ----- Actions -----
  const handleSaved = (saved) => {
    setShowForm(false);
    if (saved?.id) {
      setContacts((prev) => [
        ...prev.filter((c) => c.id !== saved.id),
        { ...EMPTY_SUMMARY, archived: false, ...saved },
      ]);
      setServerTotals(null);
      setHighlightId(saved.id);
    }
    updateParams({ q: "", filter: "all", view: "active" });
    setNotice({ tone: "ok", text: tc("notices.contactCreated", { name: saved?.name || "" }) });
    load({ silent: true });
  };

  // Edit keeps the current search / filters; balances are untouched, so the totals stay valid.
  const handleEdited = (saved) => {
    const id = editing?.id;
    setEditing(null);
    if (id) {
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...saved, id } : c)));
      setHighlightId(id);
    }
    setNotice({ tone: "ok", text: tc("notices.contactUpdated", { name: saved?.name || "" }) });
    load({ silent: true });
  };

  // Deleting removes the person and their whole history (server side).
  const confirmDeleteContact = async () => {
    if (!pendingDelete || deleting) return;
    const { id, name } = pendingDelete;
    setDeleting(true);
    try {
      await carnetApi.removeContact(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setServerTotals(null);
      setNotice({ tone: "ok", text: tc("notices.contactDeleted", { name }) });
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorText(err, tc, "errors.delete") });
    } finally {
      setPendingDelete(null);
      setDeleting(false);
      load({ silent: true });
    }
  };

  const netTone =
    totals.net > 0 ? "text-emerald-300" : totals.net < 0 ? "text-rose-300" : "text-[#ead9a8]";

  return (
    <div className="carnet space-y-6 pb-10">
      {/* ==================== Cover ==================== */}
      <section className="carnet-cover carnet-rise overflow-hidden rounded-[1.75rem] px-6 py-7 sm:px-10 sm:py-9">
        <span className="carnet-band hidden sm:block" aria-hidden="true" />
        <div className="relative sm:pe-16">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ead9a8]/70">
                <NotebookPen className="h-3.5 w-3.5" />
                {tc("cover.label")}
              </p>
              <h2 className="carnet-display carnet-foil mt-2 text-5xl font-semibold italic leading-none sm:text-6xl rtl:not-italic">
                {tc("title")}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[#ead9a8]/75">{tc("subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-[#ead9a8] px-5 py-3 text-sm font-bold text-[#10241f] shadow-lg shadow-black/25 ring-1 ring-inset ring-white/40 transition hover:-translate-y-0.5 hover:bg-[#f3e6bf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:self-auto"
            >
              <UserPlus className="h-4 w-4" />
              {tc("list.add")}
            </button>
          </div>

          <dl className="mt-8 grid grid-cols-1 gap-5 border-t border-[#ead9a8]/15 pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[#ead9a8]/15 rtl:sm:divide-x-reverse">
            <div className="sm:pe-6">
              <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ead9a8]/70">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {tc("cover.owedToMe")}
              </dt>
              <dd className="carnet-display mt-1.5 text-3xl font-semibold tabular-nums text-[#ead9a8]">
                {money(totals.owedToMe, false)}
                <span className="ms-1.5 text-sm font-medium opacity-60">{currency}</span>
              </dd>
              <dd className="mt-1 text-xs text-[#ead9a8]/60">
                {tc("cover.people", { count: totals.peopleOweMe })}
              </dd>
            </div>
            <div className="sm:px-6">
              <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ead9a8]/70">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {tc("cover.iOwe")}
              </dt>
              <dd className="carnet-display mt-1.5 text-3xl font-semibold tabular-nums text-[#ead9a8]">
                {money(totals.iOwe, false)}
                <span className="ms-1.5 text-sm font-medium opacity-60">{currency}</span>
              </dd>
              <dd className="mt-1 text-xs text-[#ead9a8]/60">
                {tc("cover.people", { count: totals.peopleIOwe })}
              </dd>
            </div>
            <div className="sm:ps-6">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ead9a8]/70">
                {tc("cover.net")}
              </dt>
              <dd className={`carnet-display mt-1.5 text-3xl font-semibold tabular-nums ${netTone}`}>
                {signedMoney(totals.net, money)}
                <span className="ms-1.5 text-sm font-medium text-[#ead9a8]/60">{currency}</span>
              </dd>
              <dd className="mt-1 text-xs text-[#ead9a8]/60">
                {tc("cover.people", { count: totals.contactCount })}
              </dd>
            </div>
          </dl>

          {/* Total spent (all time, all people) */}
          <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-black/20 px-5 py-4 ring-1 ring-inset ring-[#ead9a8]/15 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ead9a8]/10 text-amber-200 ring-1 ring-inset ring-[#ead9a8]/20">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ead9a8]/70">
                  {tc("cover.spent")}
                </p>
                <p className="mt-0.5 text-xs text-[#ead9a8]/60">
                  {tc("cover.spentHint")} · {tc("cover.people", { count: spent.people })}
                </p>
              </div>
            </div>
            <p className="carnet-display text-3xl font-semibold tabular-nums text-amber-200 sm:text-end">
              {money(spent.amount, false)}
              <span className="ms-1.5 text-sm font-medium text-[#ead9a8]/60">{currency}</span>
            </p>
          </div>

          {totals.itemsOut + totals.itemsIn + totals.overduePeople > 0 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {totals.overduePeople > 0 ? (
                <CoverChip onClick={() => updateParams({ filter: "overdue", view: "active" })}>
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                  {tc("cover.overdue")} · {totals.overduePeople}
                </CoverChip>
              ) : null}
              {totals.itemsOut > 0 ? (
                <CoverChip onClick={() => updateParams({ filter: "items", view: "active" })}>
                  <Package className="h-3.5 w-3.5 text-amber-300" />
                  {tc("cover.itemsOut")} · {totals.itemsOut}
                </CoverChip>
              ) : null}
              {totals.itemsIn > 0 ? (
                <CoverChip onClick={() => updateParams({ filter: "items", view: "active" })}>
                  <Package className="h-3.5 w-3.5 text-teal-300" />
                  {tc("cover.itemsIn")} · {totals.itemsIn}
                </CoverChip>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <Notice notice={notice} onDismiss={dismissNotice} />

      {/* ==================== Toolbar ==================== */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => updateParams({ q: e.target.value })}
              placeholder={tc("list.search")}
              aria-label={tc("list.search")}
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pe-10 ps-10 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[#1d3b34] focus:ring-2 focus:ring-[#1d3b34]/15 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-amber-500/60 dark:focus:ring-amber-500/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  updateParams({ q: "" });
                  searchRef.current?.focus();
                }}
                aria-label={t("common.clear")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <fieldset className="inline-flex min-w-0 items-center gap-0.5 rounded-xl border border-stone-200 bg-white p-1 shadow-sm dark:border-stone-700 dark:bg-stone-900">
              <legend className="sr-only">{tc("list.sort.label")}</legend>
              <ArrowUpDown className="mx-1.5 h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
              {SORTS.map((key) => {
                const active = sort === key;
                return (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={active}
                    onClick={() => updateParams({ sort: key })}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                        : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                    }`}
                  >
                    {tc(`list.sort.${key}`)}
                  </button>
                );
              })}
            </fieldset>

            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => updateParams({ view: showArchived ? "active" : "archived", filter: "all" })}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                showArchived
                  ? "border-[#1d3b34] bg-[#1d3b34] text-[#ead9a8]"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              }`}
            >
              {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {showArchived ? tc("list.showActive") : tc("list.showArchived")}
              {!showArchived && archivedCount > 0 ? (
                <span className="rounded-full bg-stone-100 px-1.5 text-[10px] tabular-nums text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  {archivedCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {FILTERS.map((key) => {
            const active = filter === key;
            return (
              <button
                type="button"
                key={key}
                aria-pressed={active}
                onClick={() => updateParams({ filter: key })}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                  active
                    ? "bg-[#1d3b34] text-[#ead9a8] ring-[#1d3b34] dark:bg-[#ead9a8] dark:text-[#10241f] dark:ring-[#ead9a8]"
                    : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700 dark:hover:bg-stone-800"
                }`}
              >
                {FILTER_DOT[key] ? <span className={`h-2 w-2 rounded-full ${FILTER_DOT[key]}`} /> : null}
                {key === "overdue" ? <AlertTriangle className="h-3.5 w-3.5 text-rose-500" /> : null}
                {key === "items" ? <Package className="h-3.5 w-3.5 text-amber-600" /> : null}
                {tc(`list.filters.${key}`)}
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                    active ? "bg-black/15 dark:bg-black/10" : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                  }`}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================== List ==================== */}
      <section aria-live="polite">
        {status === "ready" ? (
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="carnet-display text-lg font-semibold text-stone-800 dark:text-stone-100">
              {showArchived ? tc("list.archivedTitle") : tc(`list.filters.${filter}`)}
            </h3>
            <p className="text-xs font-medium text-stone-500 dark:text-stone-400">
              {tc("list.count", { count: visible.length })}
            </p>
          </div>
        ) : null}

        {status === "loading" ? <ListSkeleton /> : null}

        {status === "error" ? (
          <div className="carnet-paper flex flex-col items-center rounded-2xl border px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <p className="mt-4 max-w-md text-sm font-medium">
              {loadError?.code === "network"
                ? tc("errors.network")
                : `${tc("errors.load")}${loadError?.message ? ` (${loadError.message})` : ""}`}
            </p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1d3b34] px-4 py-2 text-sm font-bold text-[#ead9a8] transition hover:brightness-125"
            >
              <RotateCw className="h-4 w-4" />
              {tc("errors.retry")}
            </button>
          </div>
        ) : null}

        {status === "ready" && visible.length === 0 ? (
          <EmptyState
            kind={
              hasFilters ? "noResults" : showArchived ? "noArchived" : viewContacts.length ? "noResults" : "empty"
            }
            onAdd={() => setShowForm(true)}
            onClear={clearFilters}
          />
        ) : null}

        {status === "ready" && visible.length > 0 ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((contact, index) => (
              <li key={contact.id}>
                <PersonCard
                  contact={contact}
                  index={index}
                  highlight={highlightId === contact.id}
                  tc={tc}
                  t={t}
                  money={money}
                  date={date}
                  lang={lang}
                  onEdit={setEditing}
                  onDelete={setPendingDelete}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {showForm ? <ContactFormDialog onClose={() => setShowForm(false)} onSaved={handleSaved} /> : null}

      {editing ? (
        <ContactFormDialog contact={editing} onClose={() => setEditing(null)} onSaved={handleEdited} />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={tc("confirm.deleteContactTitle", { name: pendingDelete.name })}
          message={tc("confirm.deleteContactMessage", { count: pendingDelete.entryCount || 0 })}
          confirmLabel={tc("confirm.delete")}
          busy={deleting}
          onConfirm={confirmDeleteContact}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

// ==================== Pieces ====================

function CoverChip({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold text-[#ead9a8] ring-1 ring-inset ring-[#ead9a8]/20 transition hover:bg-black/30 hover:ring-[#ead9a8]/40"
    >
      {children}
    </button>
  );
}

const cardAction =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-stone-500";

function PersonCard({ contact, index, highlight, tc, t, money, date, lang, onEdit, onDelete }) {
  const tone = balanceTone(contact.balance);
  const relation = relationLabel(contact.relation, t);
  const overdue = (contact.overdueCount || 0) > 0;

  // The name link is stretched over the whole card (::after), so the card still opens the
  // person page; the edit / delete buttons sit above that overlay (relative z-10).
  return (
    <article
      id={`carnet-person-${contact.id}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className="carnet-paper carnet-margin carnet-rise group relative h-full rounded-2xl border p-4 pt-5 shadow-sm transition duration-200 [--carnet-margin-x:4.375rem] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/10"
    >
      <span className={`carnet-ribbon ${tone.ribbon}`} aria-hidden="true" />
      {highlight ? <span className="carnet-flash" aria-hidden="true" /> : null}

      <div className="flex gap-5">
        <Avatar name={contact.name} />
        <div className="min-w-0 flex-1">
          <div className="pe-6">
            <h4 className="carnet-display truncate text-lg font-semibold leading-snug">
              <Link
                to={contactPath(contact.id)}
                className="after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-amber-500"
              >
                {contact.name}
              </Link>
            </h4>
            <p className="mt-0.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 text-xs text-stone-500 dark:text-stone-400">
              {relation ? <span className="font-medium">{relation}</span> : null}
              {relation && contact.phone ? <span aria-hidden="true">·</span> : null}
              {contact.phone ? (
                <span dir="ltr" className="font-mono tracking-wide">
                  {contact.phone}
                </span>
              ) : null}
            </p>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <BalanceTag balance={contact.balance} />
            <ChevronRight className="h-5 w-5 shrink-0 text-stone-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </div>

          {overdue || contact.itemsOut > 0 || contact.itemsIn > 0 || contact.nextDueDate || contact.archived ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {overdue ? (
                <span className={`${chipBase} bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:ring-rose-900`}>
                  <AlertTriangle className="h-3 w-3" />
                  {tc("status.overdue")}
                  {contact.overdueAmount > 0 ? ` · ${money(contact.overdueAmount, false)}` : ""}
                </span>
              ) : null}
              {contact.itemsOut > 0 ? (
                <span className={`${chipBase} bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900`}>
                  <Package className="h-3 w-3" />
                  {tc("list.itemsOut", { count: contact.itemsOut })}
                </span>
              ) : null}
              {contact.itemsIn > 0 ? (
                <span className={`${chipBase} bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:ring-teal-900`}>
                  <Package className="h-3 w-3" />
                  {tc("list.itemsIn", { count: contact.itemsIn })}
                </span>
              ) : null}
              {!overdue && contact.nextDueDate ? (
                <span className={`${chipBase} bg-stone-100 text-stone-700 ring-1 ring-inset ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700`}>
                  <CalendarClock className="h-3 w-3" />
                  {tc("status.due", { date: formatDayMonth(contact.nextDueDate, lang) })}
                </span>
              ) : null}
              {contact.archived ? (
                <span className={`${chipBase} bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200`}>
                  <Archive className="h-3 w-3" />
                  {tc("list.archivedBadge")}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-stone-300/80 pt-1 dark:border-stone-600">
            <p className="min-w-0 truncate text-[11px] text-stone-500 dark:text-stone-400">
              {contact.lastEntryDate
                ? tc("list.lastActivity", { date: date(contact.lastEntryDate) })
                : tc("list.noActivity")}
            </p>
            <div className="relative z-10 -me-1.5 flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => onEdit(contact)}
                title={tc("person.edit")}
                aria-label={`${tc("person.edit")} · ${contact.name}`}
                className={`${cardAction} hover:bg-stone-900/5 hover:text-stone-800 dark:hover:bg-white/10 dark:hover:text-stone-100`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(contact)}
                title={tc("person.delete")}
                aria-label={`${tc("person.delete")} · ${contact.name}`}
                className={`${cardAction} hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/60 dark:hover:text-rose-300`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ kind, onAdd, onClear }) {
  const { tc } = useCarnetT();
  const isEmpty = kind === "empty";
  return (
    <div className="carnet-paper carnet-margin relative flex flex-col items-center overflow-hidden rounded-2xl border px-6 py-14 text-center [--carnet-margin-x:2.5rem]">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1d3b34] text-[#ead9a8] shadow-md">
        {kind === "noArchived" ? <Archive className="h-6 w-6" /> : isEmpty ? <NotebookPen className="h-6 w-6" /> : <Search className="h-6 w-6" />}
      </span>
      <p className="carnet-display mt-5 text-xl font-semibold">{tc(`list.${kind}`)}</p>
      {isEmpty ? (
        <p className="mt-2 max-w-sm text-sm text-stone-600 dark:text-stone-400">{tc("list.emptyHint")}</p>
      ) : null}
      {isEmpty ? (
        <button
          type="button"
          onClick={onAdd}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1d3b34] px-5 py-2.5 text-sm font-bold text-[#ead9a8] shadow-sm transition hover:brightness-125"
        >
          <UserPlus className="h-4 w-4" />
          {tc("list.add")}
        </button>
      ) : null}
      {kind === "noResults" ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-inset ring-stone-300 transition hover:bg-white/70 dark:text-stone-200 dark:ring-stone-600 dark:hover:bg-stone-800"
        >
          <X className="h-4 w-4" />
          {tc("timeline.clearFilters")}
        </button>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="carnet-paper rounded-2xl border p-4 pt-5">
          <div className="flex animate-pulse gap-5">
            <span className="h-11 w-11 shrink-0 rounded-full bg-stone-200 dark:bg-stone-700" />
            <div className="flex-1 space-y-3">
              <span className="block h-4 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
              <span className="block h-3 w-1/3 rounded bg-stone-200/80 dark:bg-stone-700/80" />
              <span className="block h-6 w-1/2 rounded bg-stone-200 dark:bg-stone-700" />
              <span className="block h-3 w-3/4 rounded bg-stone-200/70 dark:bg-stone-700/70" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
