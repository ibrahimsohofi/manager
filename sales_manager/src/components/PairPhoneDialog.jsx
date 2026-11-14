// Pair phones with the Vente QR page (PHONE_SCANNER_PLAN.md, chunk 5).
//
// Shows the pairing QR (https://<pc-ip>:3443/phone/#t=<code>), the PC network to use,
// the connected phones and what to check when a phone cannot connect.
// The live link itself lives in `useRemoteScanner` (QrSale passes its state as `remote`).
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchRemoteScannerInfo } from "../hooks/useRemoteScanner.js";
import { ModalShell, fieldLabel, ghostButton, inputClass } from "./SupplierLedgerShared.jsx";

const ADDRESS_KEY = "salesManager.remoteScanner.address";
const CONFIRM_MS = 4000;
const COPIED_MS = 2000;

// ---------- status helpers (shared with the QrSale header button) ----------

/** idle | busy | online | phones | offline | error */
export const remoteTone = ({ status, phones, busy, error }) => {
  if (busy || status === "connecting") return "busy";
  if (status === "online") return phones.length > 0 ? "phones" : "online";
  if (status === "offline") return "offline";
  return error ? "error" : "idle";
};

export const remoteLabel = ({ status, phones, busy }, t) => {
  const state = (key, options) => t(`qrSale.remote.state.${key}`, options);
  if (busy) return state("pairing");
  if (status === "online") {
    return phones.length > 0 ? state("phones", { count: phones.length }) : state("online");
  }
  if (status === "connecting") return state("connecting");
  if (status === "offline") return state("offline");
  return state("unpaired");
};

const DOT_TONE = {
  idle: "bg-gray-300 dark:bg-gray-500",
  busy: "bg-amber-400 animate-pulse",
  online: "bg-emerald-500",
  phones: "bg-emerald-500",
  offline: "bg-red-500",
  error: "bg-amber-500",
};

export function RemoteStatusDot({ tone }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
      {tone === "phones" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${DOT_TONE[tone] || DOT_TONE.idle}`} />
    </span>
  );
}

// ---------- helpers ----------

const readSavedAddress = () => {
  try {
    return localStorage.getItem(ADDRESS_KEY) || "";
  } catch {
    return "";
  }
};

const saveAddress = (value) => {
  try {
    localStorage.setItem(ADDRESS_KEY, value);
  } catch {
    // storage disabled: the choice only lasts while the dialog is open
  }
};

// The Clipboard API needs a secure context (localhost or HTTPS); fall back to a selection copy.
const copyText = async (text, input) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // try the fallback below
  }
  try {
    input?.focus();
    input?.select();
    return document.execCommand("copy");
  } catch {
    return false;
  }
};

const WARNING_TONE = {
  error:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100",
  warn: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
};

// ---------- dialog ----------

export default function PairPhoneDialog({ remote, onClose }) {
  const { t, i18n } = useTranslation();
  const tr = useCallback((key, options) => t(`qrSale.remote.${key}`, options), [t]);
  const { token, status, phones, error, busy, pair, renew, reconnect } = remote;

  const [info, setInfo] = useState(null);
  const [infoState, setInfoState] = useState("loading"); // loading | ready | error
  const [address, setAddress] = useState(readSavedAddress);
  const [qr, setQr] = useState({ url: "", src: "" });
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const linkRef = useRef(null);
  const autoPairRef = useRef(false);
  const wasOnlineRef = useRef(status === "online");

  const loadInfo = useCallback(async () => {
    setInfoState("loading");
    try {
      setInfo(await fetchRemoteScannerInfo());
      setInfoState("ready");
    } catch {
      setInfoState("error");
    }
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  // The API came back (e.g. restarted): its HTTPS state and addresses may have changed.
  const online = status === "online";
  useEffect(() => {
    if (online && !wasOnlineRef.current) loadInfo();
    wasOnlineRef.current = online;
  }, [online, loadInfo]);

  // Opening the dialog without a code means "pair a phone": create one once.
  // After an error (revoked, API offline...) the user decides with the button instead.
  useEffect(() => {
    if (token || error || busy || autoPairRef.current) return;
    autoPairRef.current = true;
    pair();
  }, [token, error, busy, pair]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    if (!confirmNew) return undefined;
    const id = setTimeout(() => setConfirmNew(false), CONFIRM_MS);
    return () => clearTimeout(id);
  }, [confirmNew]);

  const addresses = info?.addresses ?? [];
  const current = addresses.find((entry) => entry.address === address) || addresses[0] || null;
  const port = info?.https.port ?? 3443;
  const pairingUrl =
    token && current
      ? `https://${current.address}:${port}/phone/#t=${encodeURIComponent(token)}`
      : "";

  useEffect(() => {
    if (!pairingUrl) return undefined;
    let cancelled = false;
    QRCode.toDataURL(pairingUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 440,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((src) => {
        if (!cancelled) setQr({ url: pairingUrl, src });
      })
      .catch(() => {
        if (!cancelled) setQr({ url: "", src: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [pairingUrl]);

  const qrSrc = pairingUrl && qr.url === pairingUrl ? qr.src : "";

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString(i18n.language === "ar" ? "ar-MA" : "fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const chooseAddress = (value) => {
    setAddress(value);
    saveAddress(value);
  };

  const handleCopy = async () => {
    if (pairingUrl && (await copyText(pairingUrl, linkRef.current))) setCopied(true);
  };

  const handleNewCode = async () => {
    if (!confirmNew) {
      setConfirmNew(true);
      return;
    }
    setConfirmNew(false);
    await renew();
  };

  // ---------- warnings ----------

  const warnings = [];
  if (error) {
    warnings.push({
      key: "error",
      tone: error === "revoked" || error === "invalid" ? "warn" : "error",
      text: tr(`errors.${error}`),
    });
  }
  if (infoState === "error") {
    warnings.push({ key: "info", tone: "error", text: tr("warnings.infoFailed"), retry: true });
  } else if (info) {
    if (!info.https.enabled) {
      warnings.push({
        key: "https",
        tone: "warn",
        text: tr("warnings.httpsOff"),
        detail: info.https.error ? tr("warnings.httpsReason", { reason: info.https.error }) : null,
      });
    }
    if (addresses.length === 0) {
      warnings.push({ key: "network", tone: "warn", text: tr("warnings.noNetwork") });
    } else if (addresses.every((entry) => entry.virtual)) {
      warnings.push({ key: "virtual", tone: "warn", text: tr("warnings.virtualOnly") });
    }
  }

  const tone = remoteTone(remote);

  return (
    <ModalShell onClose={onClose} labelledBy="pair-phone-title" wide>
      {/* Header */}
      <div className="flex items-start gap-4 border-b border-gray-100 px-6 py-5 dark:border-gray-700">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="pair-phone-title" className="text-lg font-bold tracking-tight">
            {tr("title")}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{tr("subtitle")}</p>
          <p
            className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900/70 dark:text-gray-200"
            aria-live="polite"
          >
            <RemoteStatusDot tone={tone} />
            {remoteLabel(remote, t)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-me-1.5 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Warnings */}
        {warnings.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {warnings.map((warning) => (
              <li
                key={warning.key}
                className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${WARNING_TONE[warning.tone]}`}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{warning.text}</p>
                  {warning.detail && (
                    <p className="mt-0.5 break-words font-mono text-xs opacity-80">{warning.detail}</p>
                  )}
                </div>
                {warning.retry && (
                  <button
                    type="button"
                    onClick={loadInfo}
                    disabled={infoState === "loading"}
                    className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {tr("retry")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {token ? (
          /* ---------- Paired: QR + link ---------- */
          <div className="grid gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <figure className="mx-auto w-44 sm:mx-0">
              <div className="relative aspect-square w-44 overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-sm dark:border-gray-600">
                {qrSrc ? (
                  <img
                    src={qrSrc}
                    alt={tr("scanQr")}
                    className="h-full w-full [image-rendering:pixelated]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-3 text-center text-xs font-medium text-gray-500">
                    {infoState === "loading" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    ) : (
                      tr("noQr")
                    )}
                  </div>
                )}
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/85">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  </div>
                )}
              </div>
              <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                {tr("scanQr")}
              </figcaption>
            </figure>

            <div className="min-w-0 space-y-4">
              {/* PC network */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="pair-phone-address" className={`${fieldLabel} mb-0`}>
                    {tr("address")}
                  </label>
                  <button
                    type="button"
                    onClick={loadInfo}
                    disabled={infoState === "loading"}
                    title={tr("refresh")}
                    aria-label={tr("refresh")}
                    className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-emerald-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-emerald-400"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${infoState === "loading" ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {addresses.length > 1 ? (
                  <>
                    <select
                      id="pair-phone-address"
                      value={current?.address || ""}
                      onChange={(event) => chooseAddress(event.target.value)}
                      dir="ltr"
                      className={`${inputClass} font-mono`}
                    >
                      {addresses.map((entry) => (
                        <option key={entry.address} value={entry.address}>
                          {entry.address} · {entry.iface}
                          {entry.virtual ? ` (${tr("virtual")})` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{tr("addressHint")}</p>
                  </>
                ) : (
                  <p
                    id="pair-phone-address"
                    dir="ltr"
                    className="truncate rounded-lg bg-gray-50 px-3 py-2.5 text-start font-mono text-sm dark:bg-gray-900/60"
                  >
                    {current ? (
                      <>
                        {current.address}{" "}
                        <span className="text-xs text-gray-400">· {current.iface}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </p>
                )}
              </div>

              {/* Link */}
              <div>
                <label htmlFor="pair-phone-link" className={fieldLabel}>
                  {tr("link")}
                </label>
                <div className="flex gap-2">
                  <input
                    id="pair-phone-link"
                    ref={linkRef}
                    readOnly
                    value={pairingUrl}
                    dir="ltr"
                    onFocus={(event) => event.target.select()}
                    className={`${inputClass} min-w-0 flex-1 font-mono text-xs`}
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!pairingUrl}
                    title={copied ? tr("copied") : tr("copy")}
                    className={ghostButton}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="sr-only sm:not-sr-only">{copied ? tr("copied") : tr("copy")}</span>
                  </button>
                </div>
              </div>

              {/* New code */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleNewCode}
                  disabled={busy}
                  className={
                    confirmNew
                      ? "inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-60"
                      : ghostButton
                  }
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {confirmNew ? tr("confirmNewCode") : tr("newCode")}
                </button>
                {status === "offline" && (
                  <button type="button" onClick={reconnect} className={ghostButton}>
                    <RefreshCw className="h-4 w-4" />
                    {tr("retry")}
                  </button>
                )}
                <p className="w-full text-xs text-gray-500 dark:text-gray-400">{tr("newCodeHint")}</p>
              </div>
            </div>
          </div>
        ) : (
          /* ---------- No code yet ---------- */
          <div className="rounded-xl border border-dashed border-gray-300 px-6 py-8 text-center dark:border-gray-600">
            <QrCode className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="mx-auto mt-3 max-w-xs text-sm text-gray-600 dark:text-gray-300">
              {tr("unpairedHint")}
            </p>
            <button
              type="button"
              onClick={pair}
              disabled={busy}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {busy ? tr("state.pairing") : tr("createCode")}
            </button>
          </div>
        )}

        {/* Connected phones */}
        {token && (
          <section>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-bold">
              {tr("phonesTitle")}
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs tabular-nums text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
                {phones.length}
              </span>
            </h4>
            {phones.length === 0 ? (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500 dark:bg-gray-900/50 dark:text-gray-400">
                {tr("noPhones")}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-700 dark:border-gray-700">
                {phones.map((phone) => (
                  <li key={phone.id} className="flex items-center gap-3 px-4 py-2.5 text-sm animate-fade-in">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      <Smartphone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{phone.name || tr("button")}</p>
                      {phone.connectedAt && (
                        <p className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
                          {tr("since", { time: formatTime(phone.connectedAt) })}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {tr("scans", { count: phone.scans })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Checklist */}
        <section className="rounded-xl bg-gray-50 px-4 py-3.5 dark:bg-gray-900/50">
          <h4 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {tr("checklistTitle")}
          </h4>
          <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li className="flex gap-2.5">
              <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {tr("checkWifi")}
            </li>
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {tr("checkFirewall", { port })}
            </li>
            <li className="flex gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              {tr("checkCertificate")}
            </li>
          </ul>
        </section>
      </div>
    </ModalShell>
  );
}
