import { Check, Hash, Loader2, UserPlus, UserRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SALES_MANAGER_API, buildUrl } from "../config/integration.js";
import { formatAmount } from "../lib/print.js";

// Customer field for the till.
// - Type a name, phone, client number or ID: matching customers appear as you type.
// - Pick one from the list, or keep the typed text: on checkout the server reuses an
//   exact match or creates the customer automatically.
export default function CustomerPicker({ text, selected, onTextChange, onSelect, disabled }) {
  const { t } = useTranslation();
  const tr = (key, options) => t(`qrSale.customer.${key}`, options);
  const listId = useId();
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Debounced live search
  useEffect(() => {
    const query = text.trim();
    if (selected || !query) {
      setResults([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          buildUrl(
            SALES_MANAGER_API.BASE_URL,
            `${SALES_MANAGER_API.CUSTOMERS}/search?q=${encodeURIComponent(query)}`,
          ),
          { signal: controller.signal },
        );
        const data = await response.json().catch(() => []);
        setResults(Array.isArray(data) ? data : []);
        setActive(0);
      } catch (error) {
        if (error.name !== "AbortError") setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [text, selected]);

  // Close the list when clicking elsewhere
  useEffect(() => {
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const choose = (customer) => {
    onSelect(customer);
    onTextChange(customer.name);
    setOpen(false);
    setResults([]);
  };

  const clear = () => {
    onSelect(null);
    onTextChange("");
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (event) => {
    if (!open || results.length === 0) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const query = text.trim();
  const exactMatch = results.some(
    (c) =>
      c.name?.toLowerCase() === query.toLowerCase() ||
      (c.code && c.code === query) ||
      String(c.id) === query,
  );
  const showList = open && !selected && query.length > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-2.5 dark:bg-gray-900 ${
          selected
            ? "border-emerald-400 ring-2 ring-emerald-500/15"
            : "border-gray-300 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-gray-600"
        }`}
      >
        {selected ? (
          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <UserRound className="h-4 w-4 shrink-0 text-gray-400" />
        )}
        <input
          ref={inputRef}
          value={text}
          disabled={disabled}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          maxLength={120}
          placeholder={tr("placeholder")}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            if (selected) onSelect(null);
            onTextChange(event.target.value);
            setOpen(true);
          }}
          className="min-w-0 flex-1 bg-transparent py-2.5 outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />}
        {selected && (
          <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            #{selected.id}
          </span>
        )}
        {text && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label={tr("clear")}
            className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
        >
          {results.map((customer, index) => (
            <li key={customer.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(customer)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm ${
                  index === active ? "bg-emerald-50 dark:bg-emerald-950/50" : ""
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold uppercase text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                  {String(customer.name || "?").slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{customer.name}</span>
                  <span className="flex flex-wrap gap-x-2 text-xs text-gray-500">
                    <span className="font-mono">#{customer.id}</span>
                    {customer.code && (
                      <span className="inline-flex items-center gap-0.5 font-mono">
                        <Hash className="h-3 w-3" />
                        {customer.code}
                      </span>
                    )}
                    {customer.phone && <span>{customer.phone}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-end text-xs text-gray-500 tabular-nums">
                  {formatAmount(customer.total_spent || 0)} {t("currency")}
                  <span className="block">{tr("purchases", { count: Number(customer.purchases_count || 0) })}</span>
                </span>
              </button>
            </li>
          ))}
          {!loading && !exactMatch && (
            <li className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 dark:text-gray-300">
              <UserPlus className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="min-w-0 truncate">{tr("willCreate", { text: query })}</span>
            </li>
          )}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {selected
          ? tr("linked", { name: selected.name })
          : query
            ? tr("autoCreateHint")
            : tr("hint")}
      </p>
    </div>
  );
}
