// Carnet — person page (`/carnet/:contactId`).
// Leather cover header (identity, call / WhatsApp, pinned notes, big balance), quick actions,
// month-grouped timeline with running balance, side panels, settle + person management.
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Loader2,
  MessageCircle,
  NotebookPen,
  Package,
  PackageCheck,
  Pencil,
  Phone,
  RotateCw,
  Search,
  Trash2,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  CARNET_PATH,
  balanceState,
  carnetApi,
  daysBetween,
  localToday,
  relationLabel,
  telLink,
  whatsappLink,
} from "../lib/carnet.js";
import {
  Avatar,
  ConfirmDialog,
  DIRECTION_META,
  DirectionIcon,
  EntryDialog,
  Notice,
  apiErrorText,
  balanceTone,
  chipBase,
  searchable,
  signedMoney,
  useCarnetT,
} from "./CarnetShared.jsx";

const QUICK_DIRECTIONS = ["gave", "received", "note"];

// ----- Timeline filters (kept in the URL: ?q=&f=) -----
const TIMELINE_FILTERS = ["all", "gave", "received", "note", "items", "open", "overdue"];
const TIMELINE_TEST = {
  all: () => true,
  gave: (e) => e.direction === "gave",
  received: (e) => e.direction === "received",
  note: (e) => e.direction === "note",
  items: (e) => Boolean(e.to_return),
  open: (e) => Boolean(e.is_open),
  overdue: (e) => Boolean(e.is_overdue),
};

/** Short human label of an entry ("J'ai donné · Argent", or the note text). */
const entryLabel = (entry, tc) =>
  entry.direction === "note"
    ? entry.description || tc("directions.note")
    : `${tc(`directions.${entry.direction}`)} · ${tc(`kinds.${entry.kind}`)}`;

const COVER_BALANCE_TONE = {
  owesMe: "text-emerald-300",
  iOwe: "text-rose-300",
  settled: "text-[#ead9a8]/70",
};

/** Small round button on the leather cover (link or button). */
const coverAction =
  "inline-flex items-center gap-2 rounded-full bg-black/20 px-3.5 py-2 text-sm font-semibold text-[#ead9a8] ring-1 ring-inset ring-[#ead9a8]/20 transition hover:bg-black/30 hover:ring-[#ead9a8]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

const coverActionDisabled =
  "inline-flex cursor-not-allowed items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-[#ead9a8]/35 ring-1 ring-inset ring-[#ead9a8]/10";

export default function CarnetPerson() {
  const { contactId } = useParams();
  const { t, tc } = useCarnetT();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const filter = TIMELINE_FILTERS.includes(params.get("f")) ? params.get("f") : "all";
  const [account, setAccount] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [entryDialog, setEntryDialog] = useState(null); // { entry?, direction }
  const [highlightId, setHighlightId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // entry
  const [deleting, setDeleting] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState(null); // returned toggle in flight

  const updateParams = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (!value || (key === "f" && value === "all")) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setStatus("loading");
      try {
        const res = await carnetApi.account(contactId);
        setAccount(res);
        setLoadError(null);
        setStatus("ready");
      } catch (err) {
        if (silent && err?.status !== 404) {
          setNotice({ tone: "error", text: tc("errors.loadPerson") });
          return;
        }
        setLoadError(err);
        setStatus("error");
      }
    },
    [contactId, tc],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Flash the entry that was just saved, then let it fade
  useEffect(() => {
    if (!highlightId) return undefined;
    const raf = requestAnimationFrame(() => {
      document
        .getElementById(`carnet-entry-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => setHighlightId(null), 2200);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [highlightId]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const contact = account?.contact;
  const summary = account?.summary;
  const entries = account?.entries || [];
  const balance = summary?.balance || 0;

  // ----- Entries -----
  const openEntry = (direction) => setEntryDialog({ direction });

  const handleEntrySaved = (saved, isEdit) => {
    setEntryDialog(null);
    setNotice({ tone: "ok", text: tc(isEdit ? "notices.entryUpdated" : "notices.entrySaved") });
    if (saved?.id) setHighlightId(Number(saved.id));
    load({ silent: true });
  };

  const confirmDeleteEntry = async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await carnetApi.removeEntry(contact.id, pendingDelete.id);
      setNotice({ tone: "ok", text: tc("notices.entryDeleted") });
      setPendingDelete(null);
      await load({ silent: true });
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorText(err, tc, "errors.delete") });
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggleReturned = async (entry) => {
    if (busyEntryId) return;
    const returned = !entry.settled;
    setBusyEntryId(entry.id);
    try {
      await carnetApi.setReturned(contact.id, entry.id, returned, localToday());
      const item = entry.description || tc("kinds.goods");
      setNotice({ tone: "ok", text: tc(returned ? "notices.returned" : "notices.notReturned", { item }) });
      await load({ silent: true });
    } catch (err) {
      setNotice({ tone: "error", text: apiErrorText(err, tc) });
    } finally {
      setBusyEntryId(null);
    }
  };

  // ----- Timeline: search + filter, then month groups (newest first) -----
  const searched = useMemo(() => {
    const needle = searchable(query.trim());
    if (!needle) return entries;
    const digits = query.replace(/[^\d]/g, "");
    return entries.filter((e) => {
      const haystack = searchable(
        e.description,
        e.notes,
        tc(`directions.${e.direction}`),
        e.direction === "note" ? "" : tc(`kinds.${e.kind}`),
        relationLabel(contact?.relation, t),
      );
      if (haystack.includes(needle)) return true;
      return digits.length > 0 && String(Math.round(e.amount * 100) / 100).replace(".", "").includes(digits);
    });
  }, [entries, query, tc, t, contact?.relation]);

  const filterCounts = useMemo(() => {
    const result = {};
    for (const key of TIMELINE_FILTERS) result[key] = searched.filter(TIMELINE_TEST[key]).length;
    return result;
  }, [searched]);

  // Month net + closing balance always come from the full history
  const monthStats = useMemo(() => {
    const stats = new Map();
    for (const e of entries) {
      const key = String(e.entry_date).slice(0, 7);
      const prev = stats.get(key) || { net: 0, closing: 0 };
      stats.set(key, { net: prev.net + (e.signed || 0), closing: e.running_balance });
    }
    return stats;
  }, [entries]);

  const groups = useMemo(() => {
    const visible = searched
      .filter(TIMELINE_TEST[filter])
      .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id);
    const map = new Map();
    for (const e of visible) {
      const key = e.entry_date.slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map].map(([key, items]) => ({ key, items, ...(monthStats.get(key) || {}) }));
  }, [searched, filter, monthStats]);

  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0);
  const hasFilters = Boolean(query.trim()) || filter !== "all";

  return (
    <div className="carnet space-y-6 pb-10">
      <Link
        to={CARNET_PATH}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {tc("person.back")}
      </Link>

      {status === "loading" ? <PersonSkeleton /> : null}

      {status === "error" ? (
        <div className="carnet-paper flex flex-col items-center rounded-2xl border px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <p className="mt-4 max-w-md text-sm font-medium">
            {loadError?.status === 404
              ? tc("errors.notFound")
              : loadError?.code === "network"
                ? tc("errors.network")
                : tc("errors.loadPerson")}
          </p>
          {loadError?.status !== 404 ? (
            <button
              type="button"
              onClick={() => load()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[color:var(--carnet-cover)] px-4 py-2 text-sm font-bold text-[color:var(--carnet-foil)] transition hover:brightness-125"
            >
              <RotateCw className="h-4 w-4" />
              {tc("errors.retry")}
            </button>
          ) : (
            <Link
              to={CARNET_PATH}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[color:var(--carnet-cover)] px-4 py-2 text-sm font-bold text-[color:var(--carnet-foil)] transition hover:brightness-125"
            >
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              {tc("person.back")}
            </Link>
          )}
        </div>
      ) : null}

      {status === "ready" && contact ? (
        <>
          <PersonHeader contact={contact} balance={balance} spent={summary?.totalGave || 0} />

          <QuickActions onPick={openEntry} />

          <Notice notice={notice} onDismiss={dismissNotice} />

          {/* ==================== Timeline ==================== */}
          <section
            className="carnet-rise space-y-4"
            style={{ animationDelay: "120ms" }}
            aria-labelledby="carnet-timeline-title"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3
                id="carnet-timeline-title"
                className="carnet-display text-2xl font-semibold text-stone-900 dark:text-stone-50"
              >
                {tc("timeline.title")}
              </h3>
              <p className="text-xs font-medium text-stone-500 dark:text-stone-400" aria-live="polite">
                {tc("timeline.count", { count: hasFilters ? visibleCount : entries.length })}
              </p>
            </div>

            {entries.length > 0 ? (
              <TimelineToolbar query={query} filter={filter} counts={filterCounts} onChange={updateParams} />
            ) : null}

            {entries.length === 0 ? (
              <TimelineEmpty kind="empty" />
            ) : visibleCount === 0 ? (
              <TimelineEmpty kind="noResults" onClear={() => updateParams({ q: "", f: "all" })} />
            ) : (
              <div className="space-y-5">
                {groups.map((group) => (
                  <MonthGroup
                    key={group.key}
                    group={group}
                    highlightId={highlightId}
                    busyEntryId={busyEntryId}
                    onEdit={(entry) => setEntryDialog({ entry, direction: entry.direction })}
                    onDelete={setPendingDelete}
                    onToggleReturned={toggleReturned}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {entryDialog && contact ? (
        <EntryDialog
          contact={contact}
          entry={entryDialog.entry || null}
          initialDirection={entryDialog.direction}
          currentBalance={balance}
          onClose={() => setEntryDialog(null)}
          onSaved={handleEntrySaved}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={tc("confirm.deleteEntryTitle")}
          message={tc("confirm.deleteEntryMessage", {
            label: pendingDelete.description || entryLabel(pendingDelete, tc),
          })}
          confirmLabel={tc("confirm.deleteEntry")}
          busy={deleting}
          onConfirm={confirmDeleteEntry}
          onCancel={() => setPendingDelete(null)}
        />
      ) : null}
    </div>
  );
}

// ==================== Header ====================

function PersonHeader({ contact, balance, spent }) {
  const { t, tc, money, currency, date } = useCarnetT();
  const relation = relationLabel(contact.relation, t);
  const state = balanceState(balance);
  const firstName = String(contact.name || "").trim().split(/\s+/)[0] || contact.name;
  const hasPhone = Boolean(String(contact.phone || "").trim());

  return (
    <section className="carnet-cover carnet-rise overflow-hidden rounded-[1.75rem] px-6 py-7 sm:px-10 sm:py-9">
      <span className="carnet-band hidden lg:block" aria-hidden="true" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pe-16">
        {/* Identity */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-5">
            <Avatar name={contact.name} size="xl" className="shadow-lg shadow-black/30" />
            <div className="min-w-0">
              {relation ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ead9a8]/65">
                  {relation}
                </p>
              ) : null}
              <h2 className="carnet-display carnet-foil mt-1 break-words text-4xl font-semibold leading-[1.05] sm:text-5xl">
                {contact.name}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#ead9a8]/70">
                {hasPhone ? (
                  <span dir="ltr" className="font-mono tracking-wide">
                    {contact.phone}
                  </span>
                ) : (
                  <span className="italic">{tc("person.noPhone")}</span>
                )}
                {contact.created_at ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-xs text-[#ead9a8]/55">
                      {tc("person.since", { date: date(String(contact.created_at).slice(0, 10)) })}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </div>

          {/* Contact actions */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {hasPhone ? (
              <a href={telLink(contact.phone)} className={coverAction}>
                <Phone className="h-4 w-4" />
                {tc("person.call")}
              </a>
            ) : (
              <span className={coverActionDisabled} title={tc("person.noPhone")}>
                <Phone className="h-4 w-4" />
                {tc("person.call")}
              </span>
            )}
            {hasPhone ? (
              <a
                href={whatsappLink(contact.phone)}
                target="_blank"
                rel="noreferrer"
                className={coverAction}
              >
                <MessageCircle className="h-4 w-4" />
                {tc("person.whatsapp")}
              </a>
            ) : (
              <span className={coverActionDisabled} title={tc("person.noPhone")}>
                <MessageCircle className="h-4 w-4" />
                {tc("person.whatsapp")}
              </span>
            )}
          </div>

          {/* Pinned notes */}
          {contact.notes ? (
            <figure className="relative mt-7 max-w-lg -rotate-[0.6deg] rounded-md bg-[#f6ecc9] px-5 pb-4 pt-5 text-stone-800 shadow-lg shadow-black/30 rtl:rotate-[0.6deg]">
              <span
                aria-hidden="true"
                className="absolute -top-2.5 start-8 h-5 w-16 rotate-[-4deg] rounded-sm bg-white/45 shadow-sm ring-1 ring-black/5 backdrop-blur-sm"
              />
              <figcaption className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">
                {tc("form.contactNotes")}
              </figcaption>
              <blockquote className="carnet-display mt-1 whitespace-pre-line text-[15px] italic leading-relaxed rtl:not-italic">
                {contact.notes}
              </blockquote>
            </figure>
          ) : null}
        </div>

        {/* Big balance */}
        <div className="lg:min-w-[17rem] lg:text-end">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#ead9a8]/65">
            {tc(`balance.${state}`, { name: firstName })}
          </p>
          <p
            className={`carnet-display mt-1.5 text-5xl font-semibold leading-none tabular-nums sm:text-6xl ${COVER_BALANCE_TONE[state]}`}
          >
            {money(Math.abs(balance), false)}
            <span className="ms-2 align-top text-base font-medium text-[#ead9a8]/55">{currency}</span>
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/20 px-3.5 py-1.5 text-xs font-semibold text-[#ead9a8]/80 ring-1 ring-inset ring-[#ead9a8]/15">
            <Wallet className="h-3.5 w-3.5 text-amber-200" />
            {tc("cover.spent")}
            <span className="carnet-display text-sm tabular-nums text-amber-200">{money(spent)}</span>
          </p>
          <p className="mt-3 text-xs text-[#ead9a8]/50">{tc("summary.signHint")}</p>
        </div>
      </div>
    </section>
  );
}

// ==================== Quick actions ====================

function QuickActions({ onPick }) {
  const { tc } = useCarnetT();
  return (
    <section className="carnet-rise grid grid-cols-3 gap-2 sm:gap-4" style={{ animationDelay: "60ms" }}>
      {QUICK_DIRECTIONS.map((direction) => {
        const meta = DIRECTION_META[direction];
        return (
          <button
            type="button"
            key={direction}
            onClick={() => onPick(direction)}
            className="carnet-paper group flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:flex-row sm:gap-4 sm:px-5 sm:text-start"
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105 ${meta.icon}`}
            >
              <meta.Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className={`carnet-display block text-base font-semibold sm:text-lg ${meta.text}`}>
                {tc(`directions.${direction}`)}
              </span>
              <span className="mt-0.5 hidden text-xs text-stone-500 dark:text-stone-400 sm:block">
                {tc(`person.quickHint.${direction}`)}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
}

// ==================== Timeline: toolbar ====================

const FILTER_MARK = {
  gave: <span className="h-2 w-2 rounded-full bg-amber-500" />,
  received: <span className="h-2 w-2 rounded-full bg-teal-600" />,
  note: <span className="h-2 w-2 rounded-full bg-stone-400" />,
  items: <Package className="h-3.5 w-3.5 text-amber-600" />,
  open: <CircleDot className="h-3.5 w-3.5 text-stone-500" />,
  overdue: <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />,
};

function TimelineToolbar({ query, filter, counts, onChange }) {
  const { t, tc } = useCarnetT();
  const searchRef = useRef(null);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder={tc("timeline.search")}
          aria-label={tc("timeline.search")}
          className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pe-10 ps-10 text-sm text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-[#1d3b34] focus:ring-2 focus:ring-[#1d3b34]/15 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-amber-500/60 dark:focus:ring-amber-500/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              onChange({ q: "" });
              searchRef.current?.focus();
            }}
            aria-label={t("common.clear")}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {TIMELINE_FILTERS.map((key) => {
          const active = filter === key;
          const empty = !active && counts[key] === 0;
          return (
            <button
              type="button"
              key={key}
              aria-pressed={active}
              onClick={() => onChange({ f: key })}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${
                active
                  ? "bg-[#1d3b34] text-[#ead9a8] ring-[#1d3b34] dark:bg-[#ead9a8] dark:text-[#10241f] dark:ring-[#ead9a8]"
                  : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-700 dark:hover:bg-stone-800"
              } ${empty ? "opacity-55" : ""}`}
            >
              {FILTER_MARK[key] || null}
              {tc(`timeline.filters.${key}`)}
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  active
                    ? "bg-black/15 dark:bg-black/10"
                    : "bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== Timeline: month group ====================

const statLabel = "text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400";

function MonthGroup({ group, highlightId, busyEntryId, onEdit, onDelete, onToggleReturned }) {
  const { tc, money, date } = useCarnetT();
  const monthLabel = date(`${group.key}-01`, { day: undefined, month: "long", year: "numeric" });
  const closing = group.closing || 0;
  const net = group.net || 0;

  return (
    <section className="carnet-paper carnet-margin overflow-hidden rounded-2xl border shadow-sm [--carnet-margin-x:3.75rem] sm:[--carnet-margin-x:4.75rem]">
      <header className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-[color:var(--carnet-paper-edge)] py-3.5 pe-4 ps-[calc(var(--carnet-margin-x)+0.875rem)] sm:pe-5 sm:ps-[calc(var(--carnet-margin-x)+1.25rem)]">
        <h4 className="carnet-display text-xl font-semibold capitalize leading-tight">{monthLabel}</h4>
        <dl className="flex items-end gap-5 text-end">
          <div>
            <dt className={statLabel}>{tc("timeline.monthNet")}</dt>
            <dd className="carnet-display mt-0.5 text-base font-semibold tabular-nums text-stone-700 dark:text-stone-200">
              {signedMoney(net, money)}
            </dd>
          </div>
          <div>
            <dt className={statLabel}>{tc("timeline.runningBalance")}</dt>
            <dd className={`carnet-display mt-0.5 text-base font-semibold tabular-nums ${balanceTone(closing).text}`}>
              {signedMoney(closing, money)}
            </dd>
          </div>
        </dl>
      </header>

      <ol>
        {group.items.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            highlight={highlightId === entry.id}
            busy={busyEntryId === entry.id}
            locked={Boolean(busyEntryId)}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleReturned={onToggleReturned}
          />
        ))}
      </ol>
    </section>
  );
}

// ==================== Timeline: entry row ====================

const CHIP_TONE = {
  open: "bg-white text-stone-700 ring-stone-300 dark:bg-stone-900 dark:text-stone-200 dark:ring-stone-600",
  partial: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900",
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900",
  overdue: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-200 dark:ring-rose-900",
  dueToday: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-800",
  due: "bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700",
  muted: "bg-transparent text-stone-500 ring-stone-300 ring-dashed dark:text-stone-400 dark:ring-stone-600",
};

/** Status chips of one entry: debt status / loan status, due date, "hors solde". */
const entryChips = (entry, { tc, money, date, today }) => {
  const chips = [];
  if (entry.to_return && entry.direction !== "note") {
    chips.push(
      entry.settled
        ? {
            key: "returned",
            tone: "paid",
            Icon: CheckCircle2,
            text: entry.settled_date
              ? tc("status.returnedOn", { date: date(entry.settled_date) })
              : tc("status.returned"),
          }
        : { key: "toReturn", tone: "partial", Icon: Package, text: tc("status.toReturn") },
    );
  } else if (entry.counts) {
    if (entry.debt_status === "partial") {
      chips.push({
        key: "partial",
        tone: "partial",
        Icon: CircleDot,
        text: tc("status.partial", { amount: money(entry.outstanding) }),
      });
    } else if (entry.debt_status === "open") {
      chips.push({ key: "open", tone: "open", Icon: CircleDot, text: tc("status.open") });
    } else if (entry.debt_status === "paid") {
      chips.push({ key: "paid", tone: "paid", Icon: CheckCircle2, text: tc("status.paid") });
    }
  }

  if (entry.is_open && entry.due_date) {
    if (entry.is_overdue) {
      chips.push({
        key: "due",
        tone: "overdue",
        Icon: AlertTriangle,
        text: tc("status.overdueDays", { count: Math.max(1, daysBetween(entry.due_date, today)) }),
      });
    } else if (entry.due_date === today) {
      chips.push({ key: "due", tone: "dueToday", Icon: CalendarClock, text: tc("status.dueToday") });
    } else {
      chips.push({
        key: "due",
        tone: "due",
        Icon: CalendarClock,
        text: tc("status.due", { date: date(entry.due_date) }),
      });
    }
  }

  if (entry.direction !== "note" && !entry.counts && entry.amount > 0) {
    chips.push({ key: "notCounted", tone: "muted", Icon: null, text: tc("timeline.notCounted") });
  }
  return chips;
};

const rowIconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-900/5 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-white";

function EntryRow({ entry, highlight, busy, locked, onEdit, onDelete, onToggleReturned }) {
  const { tc, money, date } = useCarnetT();
  const today = localToday();
  const meta = DIRECTION_META[entry.direction] || DIRECTION_META.note;
  const isNote = entry.direction === "note";
  const isLoan = Boolean(entry.to_return) && !isNote;

  const eyebrow = isNote ? tc("directions.note") : entryLabel(entry, tc);
  const title = isNote
    ? entry.description || entry.notes || tc("directions.note")
    : entry.description || tc(`kinds.${entry.kind}`);
  const notes = isNote && !entry.description ? null : entry.notes;
  const chips = entryChips(entry, { tc, money, date, today });

  const day = date(entry.entry_date, { day: "2-digit", month: undefined, year: undefined });
  const weekday = date(entry.entry_date, {
    weekday: "short",
    day: undefined,
    month: undefined,
    year: undefined,
  });

  return (
    <li
      id={`carnet-entry-${entry.id}`}
      className={`group relative grid grid-cols-[var(--carnet-margin-x)_minmax(0,1fr)] border-b border-[color:var(--carnet-paper-edge)] transition-colors last:border-b-0 hover:bg-amber-50/50 dark:hover:bg-white/[0.025] ${
        entry.settled || entry.debt_status === "paid" ? "[&_.entry-main]:opacity-75" : ""
      }`}
    >
      {highlight ? <span className="carnet-flash" aria-hidden="true" /> : null}

      {/* Date in the margin */}
      <div className="flex flex-col items-center pt-4 text-center">
        <span className="carnet-display text-2xl font-semibold leading-none tabular-nums text-stone-800 dark:text-stone-100">
          {day}
        </span>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
          {weekday}
        </span>
      </div>

      <div className="min-w-0 px-3 py-3.5 sm:px-5">
        <div className="entry-main flex items-start gap-3">
          <DirectionIcon direction={entry.direction} kind={entry.kind} className="mt-0.5 h-10 w-10" />

          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${meta.text}`}>{eyebrow}</p>
            <p className="carnet-display mt-0.5 break-words text-[17px] font-semibold leading-snug text-stone-900 dark:text-stone-50">
              {title}
            </p>
            {notes ? (
              <p className="mt-1 whitespace-pre-line break-words text-sm italic text-stone-600 rtl:not-italic dark:text-stone-400">
                {notes}
              </p>
            ) : null}
          </div>

          {/* Amount + running balance */}
          <div className="shrink-0 text-end">
            {entry.counts ? (
              <>
                <p className={`carnet-display text-lg font-semibold leading-tight tabular-nums sm:text-xl ${meta.text}`}>
                  {signedMoney(entry.signed, money)}
                </p>
                <p className="mt-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  {tc("timeline.runningBalance")}{" "}
                  <span className={`font-bold tabular-nums ${balanceTone(entry.running_balance).text}`}>
                    {signedMoney(entry.running_balance, money)}
                  </span>
                </p>
              </>
            ) : !isNote && entry.amount > 0 ? (
              <p className="text-sm font-medium tabular-nums text-stone-500 line-through decoration-stone-300 decoration-1 dark:text-stone-400 dark:decoration-stone-600">
                {tc("timeline.value", { amount: money(entry.amount) })}
              </p>
            ) : null}
          </div>
        </div>

        {/* Chips + actions */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 sm:ps-[3.25rem]">
          {chips.map(({ key, tone, Icon, text }) => (
            <span key={key} className={`${chipBase} ring-1 ring-inset ${CHIP_TONE[tone]}`}>
              {Icon ? <Icon className="h-3 w-3" /> : null}
              {text}
            </span>
          ))}

          <div className="ms-auto flex items-center gap-0.5">
            {isLoan ? (
              <button
                type="button"
                onClick={() => onToggleReturned(entry)}
                disabled={locked}
                className={`me-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-inset transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  entry.settled
                    ? "text-stone-600 ring-stone-300 hover:bg-stone-100 dark:text-stone-300 dark:ring-stone-600 dark:hover:bg-stone-800"
                    : "bg-[#1d3b34] text-[#ead9a8] ring-[#1d3b34] hover:brightness-125"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : entry.settled ? (
                  <Undo2 className="h-3.5 w-3.5 rtl:-scale-x-100" />
                ) : (
                  <PackageCheck className="h-3.5 w-3.5" />
                )}
                {tc(entry.settled ? "timeline.markNotReturned" : "timeline.markReturned")}
              </button>
            ) : null}
            <div className="flex items-center gap-0.5 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onEdit(entry)}
                disabled={locked}
                className={rowIconButton}
                aria-label={tc("timeline.edit")}
                title={tc("timeline.edit")}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(entry)}
                disabled={locked}
                className={`${rowIconButton} hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50 dark:hover:text-rose-300`}
                aria-label={tc("timeline.delete")}
                title={tc("timeline.delete")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

// ==================== Timeline: empty states ====================

function TimelineEmpty({ kind, onClear }) {
  const { tc } = useCarnetT();
  const isEmpty = kind === "empty";
  return (
    <div className="carnet-paper carnet-margin relative flex flex-col items-center overflow-hidden rounded-2xl border px-6 py-14 text-center [--carnet-margin-x:2.5rem]">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--carnet-cover)] text-[color:var(--carnet-foil)] shadow-md">
        {isEmpty ? <NotebookPen className="h-6 w-6" /> : <Search className="h-6 w-6" />}
      </span>
      <p className="carnet-display mt-5 text-xl font-semibold">
        {tc(isEmpty ? "timeline.empty" : "timeline.noResults")}
      </p>
      {isEmpty ? (
        <p className="mt-2 max-w-sm text-sm text-stone-600 dark:text-stone-400">{tc("timeline.emptyHint")}</p>
      ) : (
        <button
          type="button"
          onClick={onClear}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-700 ring-1 ring-inset ring-stone-300 transition hover:bg-white/70 dark:text-stone-200 dark:ring-stone-600 dark:hover:bg-stone-800"
        >
          <X className="h-4 w-4" />
          {tc("timeline.clearFilters")}
        </button>
      )}
    </div>
  );
}

// ==================== Skeleton ====================

function PersonSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="carnet-cover h-56 animate-pulse rounded-[1.75rem]" />
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="carnet-paper h-20 animate-pulse rounded-2xl border" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="carnet-paper h-96 animate-pulse rounded-2xl border" />
        <div className="carnet-paper h-72 animate-pulse rounded-2xl border" />
      </div>
    </div>
  );
}
