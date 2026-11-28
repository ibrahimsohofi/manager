// Full page (no modal): create or edit a supplier ledger entry (purchase / payment / return).
//   /suppliers/:supplierId/notes?type=purchase|payment|return
//   /suppliers/:supplierId/notes/:entryId/edit
import { AlertTriangle, ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { LEDGER_TYPES, SUPPLIERS_PATH, ledgerApi } from "../lib/supplierLedger.js";
import { EntryForm, card, ghostButton, useLedgerT } from "./SupplierLedgerShared.jsx";

function Skeleton() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]" aria-busy="true">
      <div className={`${card} space-y-6 p-6`}>
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-6 w-56 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-700/60" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60" />
          <div className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60" />
        </div>
        <div className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/60" />
      </div>
      <div className={`${card} h-56 animate-pulse`} />
    </div>
  );
}

export default function SupplierLedgerEntry() {
  const { supplierId, entryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tr, money } = useLedgerT();

  const isEdit = Boolean(entryId);
  const typeParam = searchParams.get("type");
  const initialType = LEDGER_TYPES.includes(typeParam) ? typeParam : "purchase";

  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({
    status: "loading", // loading | ready | error
    supplier: null,
    entry: null,
    balance: 0,
    errorKey: "",
  });

  // Supplier + full-history balance (+ the entry when editing) in a single call
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional trigger so "Retry" refetches
  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading", errorKey: "" }));

    ledgerApi
      .ledger(supplierId)
      .then((data) => {
        if (cancelled) return;
        const entry = isEdit
          ? (data?.entries || []).find((e) => String(e.id) === String(entryId)) || null
          : null;
        if (isEdit && !entry) {
          setState({ status: "error", supplier: data?.supplier || null, entry: null, balance: 0, errorKey: "entryNotFound" });
          return;
        }
        setState({
          status: "ready",
          supplier: data.supplier,
          entry,
          balance: Number(data?.summary?.balance) || 0,
          errorKey: "",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        let errorKey = "load";
        if (err.code === "network") errorKey = "network";
        else if (err.status === 404 || err.status === 400) errorKey = "supplierNotFound";
        setState({ status: "error", supplier: null, entry: null, balance: 0, errorKey });
      });

    return () => {
      cancelled = true;
    };
  }, [supplierId, entryId, isEdit, reloadKey]);

  // Back to where the user came from; direct link / new tab -> suppliers list
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(SUPPLIERS_PATH, { replace: true });
  };

  const handleSaved = (saved, wasEdit) => {
    const supplierName = state.supplier?.name || "";
    const text = wasEdit
      ? tr("page.savedEdit", { supplier: supplierName })
      : tr(`page.savedNew.${saved?.type || "purchase"}`, {
          amount: money(saved?.amount ?? 0),
          supplier: supplierName,
        });
    navigate(SUPPLIERS_PATH, { replace: true, state: { ledgerNotice: { tone: "ok", text } } });
  };

  const { status, supplier, entry, balance, errorKey } = state;
  const pageTitle = isEdit ? tr("page.editEntry") : tr("page.newEntry");

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Top bar: back + breadcrumb */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={goBack} className={ghostButton}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {tr("page.back")}
        </button>
        <nav aria-label="breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            <li className="shrink-0">
              <Link
                to={SUPPLIERS_PATH}
                className="font-medium hover:text-emerald-700 dark:hover:text-emerald-400"
              >
                {tr("page.suppliers")}
              </Link>
            </li>
            {supplier?.name ? (
              <>
                <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
                <li className="truncate font-medium text-gray-700 dark:text-gray-200">{supplier.name}</li>
              </>
            ) : null}
            <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
            <li className="shrink-0 font-semibold text-gray-900 dark:text-white" aria-current="page">
              {pageTitle}
            </li>
          </ol>
        </nav>
      </div>

      {status === "loading" ? <Skeleton /> : null}

      {status === "error" ? (
        <div className={`${card} mx-auto max-w-lg p-8 text-center`}>
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
            {tr(`errors.${errorKey || "load"}`)}
          </h2>
          <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Link to={SUPPLIERS_PATH} className={ghostButton}>
              {tr("page.suppliers")}
            </Link>
            {errorKey === "network" || errorKey === "load" ? (
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
              >
                <RefreshCw className="h-4 w-4" />
                {tr("page.retry")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status === "ready" && supplier ? (
        <EntryForm
          // Remount when switching supplier / entry so the form starts from fresh values
          key={`${supplier.id}-${entry?.id ?? `new-${initialType}`}`}
          supplier={supplier}
          entry={entry}
          initialType={initialType}
          currentBalance={balance}
          onCancel={goBack}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
