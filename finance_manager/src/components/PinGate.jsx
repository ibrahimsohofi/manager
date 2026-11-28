// The closed ledger (FINANCE_PLAN.md §4 #13): nothing of the shop's figures is rendered before the PIN.
//   checking -> spinner · down -> how to start the API · setup -> PIN + confirmation · locked -> unlock
// Keyboard: digits, Backspace, Escape (clear), Enter (submit). Wrong PINs are rate limited by the API (429).
import { ArrowRight, Delete, KeyRound, Loader2, Lock, Moon, RefreshCw, ServerCrash, ShieldCheck, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../context/PreferencesContext";
import { useSession } from "../context/SessionContext";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

const MIN = 4;
const MAX = 8;

/** The navy brand cover of the account book (left on desktop, a band on top on mobile). */
const LedgerCover = ({ compact = false }) => {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "cloth relative isolate flex overflow-hidden text-white/85",
        compact ? "h-44 items-end px-6 pb-6" : "h-full flex-col justify-between p-10 xl:p-14",
      )}
    >
      {/* Hairline frame with an orange inner rule */}
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-sm border border-white/[0.12] sm:inset-5" />
      <div aria-hidden className="pointer-events-none absolute inset-[18px] rounded-sm border border-brand/25 sm:inset-[26px]" />
      {/* Brand orange spine */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-1.5 bg-brand" />
      {compact ? null : (
        <div className="relative flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-brand">
          <span className="h-px w-8 bg-brand/60" />
          <p className="font-bold text-white">{t("app.shop.name")}</p>
          <p className="font-bold ">
             {t("app.shop.slogan")}
          </p>
        </div>
      )}
      <div className="relative">
        {compact ? (
          <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-brand">{t("app.shop")}</p>
        ) : null}
        <h1
          className={cn(
            "font-display italic leading-[0.9] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.45)]",
            compact ? "text-5xl" : "text-7xl xl:text-8xl",
          )}
        >
          {t("app.name")}
        </h1>
        <p className={cn("mt-3 max-w-xs text-white/70", compact ? "text-sm" : "text-lg")}>{t("app.tagline")}</p>
      </div>
      {compact ? null : (
        <div className="relative flex items-end justify-between gap-6 text-xs text-white/55">
          <p className="max-w-[16rem] leading-relaxed">{t("pin.privacy")}</p>
          <span className="figure text-brand/85">N° {new Date().getFullYear()}</span>
        </div>
      )}
    </div>
  );
};

const Dots = ({ length, shake }) => {
  // Always MIN empty slots; longer PINs only add filled dots (no extra "ghost" empty circle).
  const slots = Math.min(MAX, Math.max(MIN, length));
  return (
    <div dir="ltr" className={cn("flex h-6 items-center justify-center gap-3", shake && "animate-shake")} aria-hidden>
      {Array.from({ length: slots }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed slots
          key={i}
          className={cn(
            "size-3.5 rounded-full border-2 transition-all duration-150",
            i < length ? "scale-110 border-primary bg-primary" : "border-rule bg-transparent",
          )}
        />
      ))}
    </div>
  );
};

const Keypad = ({ onDigit, onErase, onSubmit, disabled, canSubmit, submitLabel, eraseLabel }) => {
  const key =
    "flex h-14 items-center justify-center rounded-xl border border-input bg-paper text-2xl font-medium shadow-[0_1px_0_hsl(var(--rule)),inset_0_-2px_0_hsl(var(--rule)/0.5)] transition-all hover:border-foreground/25 hover:bg-secondary/50 active:translate-y-px active:shadow-none disabled:pointer-events-none disabled:opacity-40 sm:h-[3.75rem]";
  return (
    <div dir="ltr" className="grid grid-cols-3 gap-2.5">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
        <button key={digit} type="button" className={cn(key, "figure")} disabled={disabled} onClick={() => onDigit(digit)}>
          {digit}
        </button>
      ))}
      <button type="button" className={cn(key, "text-muted-foreground")} disabled={disabled} onClick={onErase} aria-label={eraseLabel}>
        <Delete className="size-6" />
      </button>
      <button type="button" className={cn(key, "figure")} disabled={disabled} onClick={() => onDigit(0)}>
        0
      </button>
      <button
        type="button"
        className={cn(
          key,
          "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary/90",
          !canSubmit && "opacity-40",
        )}
        disabled={disabled || !canSubmit}
        onClick={onSubmit}
        aria-label={submitLabel}
      >
        <ArrowRight className="size-6 rtl:rotate-180" />
      </button>
    </div>
  );
};

const PreferenceToggles = () => {
  const { t } = useTranslation();
  const { theme, toggleTheme, lang, toggleLang } = usePreferences();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={toggleLang} className="font-semibold">
        {lang === "ar" ? "FR" : "العربية"}
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label={t("common.theme")}>
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
};

const ApiDown = ({ onRetry }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <div className="animate-rise-in space-y-5">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-loss-soft text-loss">
        <ServerCrash className="size-6" />
      </span>
      <div>
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{t("pin.apiDownTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("pin.apiDownText")}</p>
      </div>
      <pre dir="ltr" className="figure overflow-x-auto rounded-lg border border-dashed border-rule bg-background/70 p-4 text-left text-[0.8rem] leading-relaxed">
        <span className="text-muted-foreground"># MySQL</span>
        {"\n"}cd finance_manager && bun run dev{"\n\n"}
        <span className="text-muted-foreground"># .env</span>
        {"\n"}cd finance_manager/server && bun run setup-env --check
      </pre>
      <Button
        onClick={async () => {
          setBusy(true);
          await onRetry();
          setBusy(false);
        }}
        disabled={busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {t("common.retry")}
      </Button>
    </div>
  );
};

export const PinGate = () => {
  const { t } = useTranslation();
  const { status, reason, idleMinutes, unlock, setup, check } = useSession();
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState(null); // setup: the PIN typed once, waiting for confirmation
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pinRef = useRef(pin);
  pinRef.current = pin;

  const waiting = retryUntil > now;
  const seconds = Math.max(0, Math.ceil((retryUntil - now) / 1000));

  useEffect(() => {
    if (!retryUntil) return undefined;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) {
        setRetryUntil(0);
        setError("");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  // Reset the form when the gate changes state (setup -> locked after another browser created the PIN...).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on status change only
  useEffect(() => {
    setPin("");
    setFirst(null);
    setError("");
  }, [status]);

  const fail = useCallback((message) => {
    setError(message);
    setPin("");
    setShake(true);
    window.setTimeout(() => setShake(false), 450);
  }, []);

  const submit = useCallback(async () => {
    const value = pinRef.current;
    if (busy || waiting) return;
    if (value.length < MIN || value.length > MAX) {
      fail(t("pin.invalid"));
      return;
    }
    if (status === "setup" && first === null) {
      setFirst(value);
      setPin("");
      setError("");
      return;
    }
    if (status === "setup" && first !== value) {
      setFirst(null);
      fail(t("pin.mismatch"));
      return;
    }
    setBusy(true);
    try {
      if (status === "setup") await setup(value);
      else await unlock(value);
    } catch (err) {
      const body = err?.body ?? {};
      if (err?.code === "TOO_MANY_ATTEMPTS") {
        const until = Date.now() + (Number(body.retry_after) || 60) * 1000;
        setNow(Date.now());
        setRetryUntil(until);
        setPin("");
        setError("");
      } else if (err?.code === "WRONG_PIN") {
        fail(body.attempts_left !== undefined ? t("pin.wrong", { count: body.attempts_left }) : t("pin.wrongShort"));
      } else if (err?.code === "PIN_ALREADY_SET" || err?.code === "PIN_NOT_SET") {
        await check();
      } else if (err?.code === "INVALID_PIN") {
        fail(t("pin.invalid"));
      } else if (err?.isApiDown) {
        await check();
      } else {
        fail(t("errors.generic"));
      }
    } finally {
      setBusy(false);
    }
  }, [busy, waiting, status, first, setup, unlock, check, fail, t]);

  const onDigit = useCallback(
    (digit) => {
      if (busy || waiting) return;
      setError("");
      setPin((current) => (current.length >= MAX ? current : current + digit));
    },
    [busy, waiting],
  );
  const onErase = useCallback(() => setPin((current) => current.slice(0, -1)), []);

  useEffect(() => {
    if (status !== "setup" && status !== "locked") return undefined;
    const handler = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) onDigit(event.key);
      else if (event.key === "Backspace") onErase();
      else if (event.key === "Escape") setPin("");
      else if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else return;
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [status, onDigit, onErase, submit]);

  const confirming = status === "setup" && first !== null;
  const title =
    status === "setup" ? t(confirming ? "pin.confirmTitle" : "pin.setupTitle") : t("pin.lockedTitle");
  const text = status === "setup" ? t(confirming ? "pin.confirmText" : "pin.setupText") : t("pin.lockedText");
  const reasonText =
    status === "locked" && reason
      ? reason === "idle"
        ? t("pin.idle", { minutes: idleMinutes })
        : t(`pin.${reason}`)
      : "";
  const submitLabel = status === "setup" ? t(confirming ? "pin.create" : "pin.continue") : t("pin.unlock");

  return (
    <div className="relative z-[1] grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="hidden lg:block">
        <LedgerCover />
      </div>
      <div className="lg:hidden">
        <LedgerCover compact />
      </div>

      <main className="ledger-margin relative flex flex-col bg-paper/60">
        <div className="flex items-center justify-between px-5 pt-4 ps-12 sm:px-8 sm:ps-14">
          <span className="eyebrow">{t("app.internal").split("—")[0].trim()}</span>
          <PreferenceToggles />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 ps-12 sm:px-8 sm:ps-16">
          <div className="w-full max-w-sm">
            {status === "checking" ? (
              <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
                <Loader2 className="size-7 animate-spin" />
                <span className="text-sm">{t("common.loading")}</span>
              </div>
            ) : status === "down" ? (
              <ApiDown onRetry={check} />
            ) : (
              <div key={`${status}-${confirming}`} className="animate-rise-in">
                <span
                  className={cn(
                    "inline-flex size-12 items-center justify-center rounded-full",
                    status === "setup" ? "bg-accent text-accent-foreground" : "bg-secondary text-foreground",
                  )}
                >
                  {status === "setup" ? (
                    confirming ? (
                      <ShieldCheck className="size-6" />
                    ) : (
                      <KeyRound className="size-6" />
                    )
                  ) : (
                    <Lock className="size-6" />
                  )}
                </span>
                <h2 className="mt-5 font-display text-4xl leading-[1.05] tracking-tight">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                {reasonText ? (
                  <p className="mt-3 inline-flex rounded-md bg-due-soft px-2.5 py-1 text-xs font-medium text-due">
                    {reasonText}
                  </p>
                ) : null}

                <div className="mt-8 space-y-3">
                  <Dots length={pin.length} shake={shake} />
                  <p className="h-5 text-center text-sm font-medium text-loss" aria-live="polite">
                    {waiting ? t("pin.tooMany", { seconds }) : error}
                  </p>
                </div>

                <div className="mt-4">
                  <Keypad
                    onDigit={onDigit}
                    onErase={onErase}
                    onSubmit={submit}
                    disabled={busy || waiting}
                    canSubmit={pin.length >= MIN}
                    submitLabel={submitLabel}
                    eraseLabel={t("pin.erase")}
                  />
                </div>

                <Button
                  size="lg"
                  className="mt-4 w-full"
                  onClick={submit}
                  disabled={busy || waiting || pin.length < MIN}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {submitLabel}
                </Button>
                {confirming ? (
                  <Button variant="link" className="mt-3 w-full" onClick={() => {
                    setFirst(null);
                    setPin("");
                    setError("");
                  }}>
                    {t("pin.back")}
                  </Button>
                ) : null}
                <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground lg:hidden">{t("pin.privacy")}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
