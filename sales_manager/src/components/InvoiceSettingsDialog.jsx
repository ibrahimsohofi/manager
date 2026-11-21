// "Paramètres facture": shop details printed on the VIP A4 invoice (VIP_INVOICE_PLAN.md, chunk 6).
//
// Loads / saves GET / PUT /api/settings/invoice. "Prévisualiser" prints a sample invoice with the
// values currently typed (saved or not) through the same buildInvoiceHtml as the till, so what
// the shop sees here is exactly what a VIP client gets.
import {
  AlertTriangle,
  FileCog,
  ImageOff,
  Loader2,
  Printer,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SALES_MANAGER_API, buildUrl } from "../config/integration.js";
import {
  DEFAULT_INVOICE_NOTE,
  buildInvoiceHtml,
  localizeInvoiceNote,
  printHtml,
} from "../lib/print.js";
import { ModalShell, Notice } from "./SupplierLedgerShared.jsx";

const SETTINGS_URL = buildUrl(
  SALES_MANAGER_API.BASE_URL,
  SALES_MANAGER_API.INVOICE_SETTINGS,
);
const REQUEST_TIMEOUT_MS = 8000;

// Same colours as INVOICE_NAVY / INVOICE_ACCENT in lib/print.js (SOHOFIBRICO logo navy + orange).
const NAVY = "#082447";
const ACCENT = "#ea580c";
const DEFAULT_LOGO = "/sohofibrico_logo.svg";

// Same defaults and limits as server/utils/invoice.js (INVOICE_SETTINGS_FIELDS).
// Empty name / subtitle -> app.title / app.subtitle; empty address / phone -> line hidden.
const DEFAULT_SETTINGS = {
  store_name: "",
  store_subtitle: "",
  logo_url: DEFAULT_LOGO,
  store_address: "",
  store_phone: "",
  thank_you_note: DEFAULT_INVOICE_NOTE,
};
const FIELDS = Object.keys(DEFAULT_SETTINGS);
const MAX_LENGTH = {
  store_name: 120,
  store_subtitle: 160,
  logo_url: 500,
  store_address: 300,
  store_phone: 60,
  thank_you_note: 500,
};

// Same rule as the server: same-site path ("/logo.png") or http(s) URL, or nothing.
const isAllowedLogoUrl = (url) =>
  url === "" || /^\/(?!\/)/.test(url) || /^https?:\/\/\S+$/i.test(url);

const pickSettings = (data) =>
  Object.fromEntries(
    FIELDS.map((key) => [
      key,
      typeof data?.[key] === "string" ? data[key] : DEFAULT_SETTINGS[key],
    ]),
  );

// Sample lines for "Prévisualiser". Product names are catalogue data (French), whatever the UI language.
const SAMPLE_LINES = [
  { product_id: 12, productName: "Perceuse à percussion 750 W", price: 450, quantity: 1 },
  { product_id: 145, productName: "Vis à bois 4 × 40 mm (boîte de 200)", price: 35, quantity: 3 },
  { product_id: 87, productName: "Peinture acrylique blanche 10 L", price: 289, quantity: 2 },
  { product_id: 203, productName: "Ruban de masquage 48 mm", price: 18.5, quantity: 4 },
].map((line) => ({ ...line, totalPrice: line.price * line.quantity }));

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
};

const firstLine = (value) => String(value ?? "").trim().split(/\r?\n/)[0] || "";

// ---------- styles ----------

const labelClass =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400";
const fieldClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500";
const hintClass = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const ghostButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-orange-300 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-orange-800 dark:hover:text-orange-300";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-orange-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none dark:disabled:bg-gray-700 dark:disabled:text-gray-400";

function SectionTitle({ children }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-700 dark:text-orange-400">
        {children}
      </h3>
      <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
    </div>
  );
}

function CharCount({ value, max }) {
  return (
    <span className="shrink-0 tabular-nums" dir="ltr">
      {value.length}/{max}
    </span>
  );
}

// ---------- miniature letterhead (live, always "paper" white) ----------

function Letterhead({ form, logoSrc, logoBroken, onLogoError, lang, t, tr }) {
  const rtl = lang === "ar";
  const storeName = form.store_name.trim() || t("app.title");
  const storeSubtitle = form.store_subtitle.trim() || t("app.subtitle");
  const note = firstLine(localizeInvoiceNote(form.thank_you_note, t("qrSale.invoice.thanks")));
  const contact = [
    form.store_address.trim().replace(/\s*\r?\n\s*/g, ", "),
    form.store_phone.trim() ? `${t("qrSale.invoice.phone")} ${form.store_phone.trim()}` : "",
  ].filter(Boolean);
  const year = new Date().getFullYear();
  const today = new Date().toLocaleDateString("fr-FR");

  return (
    <figure
      aria-label={tr("letterhead")}
      className="relative overflow-hidden rounded-xl border border-stone-200 bg-[#fdfcfa] text-gray-900 shadow-[0_1px_0_#e7e5e4,0_10px_24px_-14px_rgba(28,25,23,0.35)]"
      style={{
        fontFamily: rtl
          ? "Tahoma, 'Segoe UI', Arial, sans-serif"
          : "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <span
        className="absolute inset-y-0 start-0 w-1"
        style={{ background: ACCENT }}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          {logoSrc && !logoBroken ? (
            <img
              key={logoSrc}
              src={logoSrc}
              alt=""
              onError={onLogoError}
              className="h-11 w-11 shrink-0 object-contain"
            />
          ) : (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-300 text-stone-400">
              <ImageOff className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <p
              className={`truncate text-[15px] font-extrabold leading-tight ${rtl ? "" : "tracking-wide"}`}
            >
              <bdi>{storeName}</bdi>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-stone-500">
              <bdi>{storeSubtitle}</bdi>
            </p>
          </div>
        </div>
        {/* Number + date card (no document title, same as the printed invoice) */}
        <dl className="flex shrink-0 overflow-hidden rounded-md border border-stone-200 text-start">
          <div className="bg-slate-50 px-2.5 py-1.5">
            <dt
              className={`text-[8px] font-bold uppercase text-stone-500 ${rtl ? "" : "tracking-[0.14em]"}`}
            >
              {t("qrSale.invoice.number")}
            </dt>
            <dd
              className="mt-0.5 whitespace-nowrap font-mono text-[10px] font-bold"
              style={{ color: NAVY }}
              dir="ltr"
            >
              FAC-{year}-00000
            </dd>
          </div>
          <div className="border-s border-stone-200 px-2.5 py-1.5">
            <dt
              className={`text-[8px] font-bold uppercase text-stone-500 ${rtl ? "" : "tracking-[0.14em]"}`}
            >
              {t("qrSale.invoice.date")}
            </dt>
            <dd
              className="mt-0.5 whitespace-nowrap text-[10px] font-bold tabular-nums"
              style={{ color: NAVY }}
              dir="ltr"
            >
              {today}
            </dd>
          </div>
        </dl>
      </div>

      {/* Body sketch: two-tone rule, client card, table head + rows, total band */}
      <div className="px-5" aria-hidden="true">
        <div
          className="h-[2px]"
          style={{
            background: `linear-gradient(to ${rtl ? "left" : "right"}, ${ACCENT} 0 22%, ${NAVY} 22% 100%)`,
          }}
        />
        <div className="mt-2.5 h-4 border-s-2 bg-slate-100" style={{ borderColor: ACCENT }} />
        <div className="mt-2.5 h-2 rounded-[2px]" style={{ background: NAVY }} />
        <div className="space-y-1.5 py-2">
          <div className="flex gap-2">
            <span className="h-1.5 w-8 rounded-full bg-stone-200" />
            <span className="h-1.5 flex-1 rounded-full bg-stone-200" />
            <span className="h-1.5 w-12 rounded-full bg-stone-200" />
          </div>
          <div className="flex gap-2">
            <span className="h-1.5 w-8 rounded-full bg-stone-100" />
            <span className="h-1.5 w-2/3 rounded-full bg-stone-100" />
            <span className="ms-auto h-1.5 w-12 rounded-full bg-stone-100" />
          </div>
        </div>
        <div className="flex justify-end">
          <span
            className="relative h-3.5 w-28 overflow-hidden rounded-[3px]"
            style={{ background: NAVY }}
          >
            <span className="absolute inset-y-0 start-0 w-1" style={{ background: ACCENT }} />
          </span>
        </div>
      </div>

      <div className="mx-5 mt-3 border-t border-stone-200 pb-3 pt-2 text-center">
        {note ? (
          <p className="truncate text-[11px] font-semibold text-stone-800">
            <bdi>{note}</bdi>
          </p>
        ) : null}
        {contact.length > 0 ? (
          <p className="truncate text-[10px] text-stone-500">
            {contact.map((part, index) => (
              <span key={part}>
                {index > 0 ? <span className="mx-1.5">·</span> : null}
                <bdi>{part}</bdi>
              </span>
            ))}
          </p>
        ) : null}
        {!note && contact.length === 0 ? (
          <p className="text-[10px] italic text-stone-400">—</p>
        ) : null}
      </div>
    </figure>
  );
}

// ---------- dialog ----------

/**
 * @param {object} props
 * @param {() => void} props.onClose
 */
export default function InvoiceSettingsDialog({ onClose }) {
  const { t, i18n } = useTranslation();
  const tr = useCallback((key, options) => t(`invoiceSettings.${key}`, options), [t]);
  const lang = i18n.language === "ar" ? "ar" : "fr";
  const baseId = useId();
  const idFor = (key) => `${baseId}-${key}`;

  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [saved, setSaved] = useState(DEFAULT_SETTINGS);
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [logoBroken, setLogoBroken] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    setNotice(null);
    try {
      const { response, data } = await fetchJson(SETTINGS_URL);
      if (!mountedRef.current) return;
      if (response.ok && data && typeof data === "object" && !Array.isArray(data)) {
        const values = pickSettings(data);
        setSaved(values);
        setForm(values);
        setLogoBroken(false);
        setStatus("ready");
        return;
      }
      setStatus("error");
    } catch {
      if (mountedRef.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = FIELDS.some((key) => form[key] !== saved[key]);
  const logoValue = form.logo_url.trim();
  const logoValid = isAllowedLogoUrl(logoValue);
  const logoSrc = logoValid ? logoValue : "";
  // Fields stay locked until the saved values are loaded: nothing can be saved before that,
  // and a successful "Réessayer" would overwrite whatever was typed meanwhile.
  const disabled = status !== "ready" || saving;
  const canSave = status === "ready" && dirty && logoValid && !saving;

  const setField = (key) => (event) => {
    const { value } = event.target;
    if (key === "logo_url") setLogoBroken(false);
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const resetLogo = () => {
    setLogoBroken(false);
    setForm((previous) => ({ ...previous, logo_url: DEFAULT_LOGO }));
  };

  const dismissNotice = useCallback(() => setNotice(null), []);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm(tr("discardConfirm"))) return;
    onClose();
  }, [saving, dirty, tr, onClose]);

  const save = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setNotice(null);
    try {
      const { response, data } = await fetchJson(SETTINGS_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logo_url: logoValue }),
      });
      if (!mountedRef.current) return;
      if (response.ok && data && typeof data === "object" && !Array.isArray(data)) {
        // The server trims / limits the values: show what was really saved
        const values = pickSettings(data);
        setSaved(values);
        setForm(values);
        setNotice({ tone: "ok", text: tr("saved") });
      } else {
        setNotice({
          tone: "error",
          text: data?.code === "INVALID_LOGO_URL" ? tr("logoInvalid") : tr("saveError"),
        });
      }
    } catch {
      if (mountedRef.current) setNotice({ tone: "error", text: tr("unreachable") });
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  // Sample invoice with the typed values; labels and fallbacks are the same as QrSale.printInvoice.
  const preview = () => {
    const label = (key) => t(`qrSale.invoice.${key}`);
    printHtml(
      buildInvoiceHtml(
        {
          invoice_number: `FAC-${new Date().getFullYear()}-00000`,
          issued_at: new Date().toISOString(),
          customer_name: tr("sample.customer"),
          customer_phone: "06 12 34 56 78",
          customer_code: "001",
          items: SAMPLE_LINES,
        },
        {
          lang,
          currency: label("currency"),
          settings: {
            ...form,
            logo_url: logoBroken ? "" : logoSrc,
            store_name: form.store_name.trim() || t("app.title"),
            store_subtitle: form.store_subtitle.trim() || t("app.subtitle"),
            thank_you_note: localizeInvoiceNote(form.thank_you_note, label("thanks")),
          },
          labels: {
            number: label("number"),
            date: label("date"),
            phone: label("phone"),
            customerNumber: label("customerNumber"),
            colRef: label("colRef"),
            colName: label("colName"),
            colUnitPrice: label("colUnitPrice"),
            colQty: label("colQty"),
            colTotal: label("colTotal"),
            items: label("items"),
            total: label("total"),
          },
        },
      ),
    );
  };

  return (
    <ModalShell onClose={requestClose} locked={saving} labelledBy={idFor("title")} wide>
      <form onSubmit={save} noValidate>
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 pb-4 pt-5 dark:border-gray-700">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900">
            <FileCog className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={idFor("title")} className="text-lg font-bold text-gray-900 dark:text-white">
              {tr("title")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{tr("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            aria-label={t("common.close")}
            className="-me-1 rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <Letterhead
            form={form}
            logoSrc={logoSrc}
            logoBroken={logoBroken}
            onLogoError={() => setLogoBroken(true)}
            lang={lang}
            t={t}
            tr={tr}
          />

          {status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {tr("loading")}
            </p>
          )}

          {status === "error" && (
            <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center dark:border-red-900 dark:bg-red-950/60 dark:text-red-100">
              <AlertTriangle className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{tr("loadError")}</p>
                <p className="text-xs opacity-80">{tr("loadErrorHint")}</p>
              </div>
              <button
                type="button"
                onClick={load}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {tr("retry")}
              </button>
            </div>
          )}

          {/* Store */}
          <section>
            <SectionTitle>{tr("sectionStore")}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={idFor("store_name")} className={labelClass}>
                  {tr("storeName")}
                </label>
                <input
                  id={idFor("store_name")}
                  type="text"
                  value={form.store_name}
                  onChange={setField("store_name")}
                  maxLength={MAX_LENGTH.store_name}
                  placeholder={t("app.title")}
                  disabled={disabled}
                  className={fieldClass}
                />
                <p className={hintClass}>{tr("fallbackHint", { value: t("app.title") })}</p>
              </div>
              <div>
                <label htmlFor={idFor("store_subtitle")} className={labelClass}>
                  {tr("storeSubtitle")}
                </label>
                <input
                  id={idFor("store_subtitle")}
                  type="text"
                  value={form.store_subtitle}
                  onChange={setField("store_subtitle")}
                  maxLength={MAX_LENGTH.store_subtitle}
                  placeholder={t("app.subtitle")}
                  disabled={disabled}
                  className={fieldClass}
                />
                <p className={hintClass}>{tr("fallbackHint", { value: t("app.subtitle") })}</p>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={idFor("logo_url")} className={labelClass}>
                  {tr("logoUrl")}
                </label>
                <div className="flex gap-2">
                  <span
                    className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white ${
                      logoSrc && !logoBroken
                        ? "border-gray-300 dark:border-gray-600"
                        : "border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:bg-gray-900"
                    }`}
                    aria-hidden="true"
                  >
                    {logoSrc && !logoBroken ? (
                      <img key={logoSrc} src={logoSrc} alt="" className="h-8 w-8 object-contain" />
                    ) : (
                      <ImageOff className="h-4 w-4" />
                    )}
                  </span>
                  <input
                    id={idFor("logo_url")}
                    type="text"
                    dir="ltr"
                    inputMode="url"
                    spellCheck={false}
                    value={form.logo_url}
                    onChange={setField("logo_url")}
                    maxLength={MAX_LENGTH.logo_url}
                    placeholder={DEFAULT_LOGO}
                    disabled={disabled}
                    aria-invalid={!logoValid}
                    aria-describedby={idFor("logo_hint")}
                    className={`${fieldClass} min-w-0 flex-1 font-mono text-[13px] ${
                      logoValid ? "" : "border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-700"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={resetLogo}
                    disabled={disabled || form.logo_url === DEFAULT_LOGO}
                    title={tr("logoDefault")}
                    className={`${ghostButton} shrink-0 px-3`}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">{tr("logoDefault")}</span>
                  </button>
                </div>
                <p id={idFor("logo_hint")} className={hintClass} aria-live="polite">
                  {!logoValid ? (
                    <span className="font-semibold text-red-600 dark:text-red-400">{tr("logoInvalid")}</span>
                  ) : logoSrc && logoBroken ? (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{tr("logoBroken")}</span>
                  ) : (
                    tr("logoHint")
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* Footer of the invoice */}
          <section>
            <SectionTitle>{tr("sectionFooter")}</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor={idFor("thank_you_note")} className={labelClass}>
                  {tr("note")}
                </label>
                <textarea
                  id={idFor("thank_you_note")}
                  rows={2}
                  value={form.thank_you_note}
                  onChange={setField("thank_you_note")}
                  maxLength={MAX_LENGTH.thank_you_note}
                  placeholder={t("qrSale.invoice.thanks")}
                  disabled={disabled}
                  className={`${fieldClass} resize-y`}
                />
                <p className={`${hintClass} flex justify-between gap-3`}>
                  <span>{tr("emptyHidden")}</span>
                  <CharCount value={form.thank_you_note} max={MAX_LENGTH.thank_you_note} />
                </p>
                {form.thank_you_note.trim() === DEFAULT_INVOICE_NOTE && (
                  <p className={hintClass}>{tr("noteDefaultHint")}</p>
                )}
              </div>
              <div>
                <label htmlFor={idFor("store_address")} className={labelClass}>
                  {tr("address")}
                </label>
                <textarea
                  id={idFor("store_address")}
                  rows={2}
                  value={form.store_address}
                  onChange={setField("store_address")}
                  maxLength={MAX_LENGTH.store_address}
                  placeholder={tr("addressPlaceholder")}
                  disabled={disabled}
                  className={`${fieldClass} resize-y`}
                />
                <p className={`${hintClass} flex justify-between gap-3`}>
                  <span>{tr("emptyHidden")}</span>
                  <CharCount value={form.store_address} max={MAX_LENGTH.store_address} />
                </p>
              </div>
              <div>
                <label htmlFor={idFor("store_phone")} className={labelClass}>
                  {tr("phone")}
                </label>
                <input
                  id={idFor("store_phone")}
                  type="tel"
                  dir="ltr"
                  value={form.store_phone}
                  onChange={setField("store_phone")}
                  maxLength={MAX_LENGTH.store_phone}
                  placeholder="05 22 00 00 00"
                  disabled={disabled}
                  className={`${fieldClass} text-start rtl:text-end`}
                />
                <p className={hintClass}>{tr("emptyHidden")}</p>
              </div>
            </div>
          </section>

          <Notice notice={notice} onDismiss={dismissNotice} />
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-gray-700 dark:bg-gray-800/95">
          <button
            type="button"
            onClick={preview}
            disabled={status === "loading"}
            title={tr("previewHint")}
            className={ghostButton}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {tr("preview")}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {dirty && status === "ready" && (
              <span className="flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-700 sm:me-2 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                {tr("unsaved")}
              </span>
            )}
            <button type="button" onClick={requestClose} disabled={saving} className={ghostButton}>
              {t("common.close")}
            </button>
            <button type="submit" disabled={!canSave} className={primaryButton}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {saving ? tr("saving") : tr("save")}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
