// The account book itself: a navy brand spine with index tabs (desktop) or a top bar + bottom tabs (mobile).
// The period (?p=) is carried from tab to tab. "N" anywhere (outside a field) opens the quick add.
import {
  BookOpenText,
  ChartColumn,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutDashboard,
  Lock,
  Moon,
  Plus,
  ReceiptText,
  Settings2,
  Sun,
} from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { useExpenseActions } from "../context/ExpenseActions";
import { usePreferences } from "../context/PreferencesContext";
import { useSession } from "../context/SessionContext";
import { useResource } from "../hooks/useResource";
import { settingsApi } from "../lib/api";
import { formatDate } from "../lib/format";
import { todayISO } from "../lib/period";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tip } from "./ui/tooltip";

const NAV = [
  { to: "/", key: "overview", icon: LayoutDashboard, folio: "I", end: true },
  { to: "/expenses", key: "expenses", icon: ReceiptText, folio: "II" },
  { to: "/reports", key: "reports", icon: ChartColumn, folio: "III" },
  { to: "/settings", key: "settings", icon: Settings2, folio: "IV" },
];

/** Keeps only the period when moving between tabs (filters belong to one page). */
const useNavSearch = () => {
  const { search } = useLocation();
  const p = new URLSearchParams(search).get("p");
  return p ? `?p=${p}` : "";
};

const isTyping = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

const Kbd = ({ children, className }) => (
  <kbd
    className={cn(
      "figure inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 text-[0.65rem] font-semibold leading-none",
      className,
    )}
  >
    {children}
  </kbd>
);

/** Theme, language, discreet mode, lock. `tone="cloth"` on the navy sidebar. */
const ShellToggles = ({ tone = "paper", className }) => {
  const { t } = useTranslation();
  const { theme, toggleTheme, lang, toggleLang, discreet, toggleDiscreet } = usePreferences();
  const { lock } = useSession();
  const btn =
    tone === "cloth"
      ? "text-white/75 hover:bg-white/10 hover:text-white"
      : "text-foreground/75 hover:bg-secondary/70 hover:text-foreground";
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Tip label={t("common.language")}>
        <Button variant="ghost" size="sm" onClick={toggleLang} className={cn("px-2 font-semibold", btn)}>
          {lang === "ar" ? "FR" : "ع"}
        </Button>
      </Tip>
      <Tip label={t("common.theme")}>
        <Button variant="ghost" size="icon-sm" onClick={toggleTheme} className={btn} aria-label={t("common.theme")}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </Button>
      </Tip>
      <Tip label={t("common.discreetHint")}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleDiscreet}
          className={cn(btn, discreet && (tone === "cloth" ? "bg-white/15 text-white" : "bg-secondary"))}
          aria-label={t("common.discreet")}
          aria-pressed={discreet}
        >
          {discreet ? <EyeOff /> : <Eye />}
        </Button>
      </Tip>
      <Tip label={t("common.lock")}>
        <Button variant="ghost" size="icon-sm" onClick={() => lock("manual")} className={btn} aria-label={t("common.lock")}>
          <Lock />
        </Button>
      </Tip>
    </div>
  );
};

/** Desktop index tab: the active one is cut from the page colour and joins the sheet. */
const SideTab = ({ item, search, isRtl }) => {
  const { t } = useTranslation();
  const Icon = item.icon;
  const corner = (y) => ({
    backgroundImage: `radial-gradient(circle at ${isRtl ? "100%" : "0"} ${y}, transparent 0.75rem, hsl(var(--background)) calc(0.75rem + 0.5px))`,
  });
  return (
    <NavLink
      to={{ pathname: item.to, search }}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "group relative flex h-12 items-center gap-3 rounded-s-lg ps-4 pe-5 text-[0.92rem] font-semibold transition-colors",
          isActive ? "bg-background text-foreground" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <>
              <span aria-hidden className="pointer-events-none absolute -top-3 end-0 size-3" style={corner("0")} />
              <span aria-hidden className="pointer-events-none absolute -bottom-3 end-0 size-3" style={corner("100%")} />
            </>
          ) : null}
          <span
            className={cn(
              "w-6 text-center font-display text-base italic leading-none",
              isActive ? "text-brand" : "text-brand/75",
            )}
          >
            {item.folio}
          </span>
          <Icon className={cn("size-[1.05rem] shrink-0", isActive ? "text-primary" : "opacity-80")} />
          <span className="truncate">{t(`nav.${item.key}`)}</span>
        </>
      )}
    </NavLink>
  );
};

const Sidebar = ({ onAdd, salesAppUrl }) => {
  const { t, i18n } = useTranslation();
  const { isRtl } = usePreferences();
  const { health } = useSession();
  const search = useNavSearch();
  return (
    <aside className="cloth no-print fixed inset-y-0 start-0 z-30 hidden w-[16.5rem] flex-col text-white/85 lg:flex">
      {/* hairline frame + brand orange spine */}
      <div aria-hidden className="pointer-events-none absolute inset-y-3 start-3 end-0 rounded-s-sm border-y border-s border-white/[0.08]" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-brand" />

      <div className="relative px-7 pb-6 pt-8">
        <p className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-brand">
          <span className="h-px w-5 bg-brand/60" />
        
           <p className="font-bold text-white">
              {t("app.shop.name")}
        </p>
          <p className="font-bold">
          {t("app.shop.slogan")}
        </p>
        </p>
        <h1 className="mt-2 font-display text-[2.9rem] italic leading-[0.9] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.45)]">
          {t("app.name")}
        </h1>
        <p className="mt-2 text-xs text-white/55">{formatDate(todayISO(), i18n.language, { long: true, weekday: true })}</p>
      </div>

      <div className="relative px-6">
        <button
          type="button"
          onClick={() => onAdd()}
          className="group flex h-11 w-full items-center justify-between gap-2 rounded-md border border-white/15 bg-brand px-3.5 text-sm font-semibold text-brand-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_8px_22px_-8px_hsl(var(--brand)/0.65)] transition-[filter,transform] hover:brightness-110 active:translate-y-px"
        >
          <span className="flex items-center gap-2">
            <Plus className="size-4" strokeWidth={2.6} />
            {t("shell.addExpense")}
          </span>
          <Kbd className="border-white/30 bg-white/15 text-white/90">N</Kbd>
        </button>
      </div>

      <nav className="relative mt-7 flex flex-col gap-1.5 ps-4" aria-label={t("shell.navigation")}>
        {NAV.map((item) => (
          <SideTab key={item.key} item={item} search={search} isRtl={isRtl} />
        ))}
      </nav>

      <div className="relative mt-auto space-y-4 px-6 pb-6">
        {salesAppUrl ? (
          <a
            href={salesAppUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs font-medium text-white/65 transition-colors hover:text-white"
          >
            <BookOpenText className="size-3.5" />
            {t("nav.salesApp")}
            <ExternalLink className="size-3 opacity-60 rtl:-scale-x-100" />
          </a>
        ) : null}
        <div className="flex items-center gap-2 text-[0.7rem] text-white/55">
          <span
            className={cn(
              "size-1.5 rounded-full",
              health?.sales_db ? "bg-gain shadow-[0_0_0_3px_hsl(var(--gain)/0.25)]" : "bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.3)]",
            )}
            aria-hidden
          />
          <span className="truncate">
            {t("common.apiMode.mysql")}
            {" · "}
            {t(health?.sales_db ? "shell.salesOk" : "shell.salesDown")}
          </span>
        </div>
        <div className="h-px bg-white/10" />
        <ShellToggles tone="cloth" className="-mx-2" />
      </div>
    </aside>
  );
};

const MobileTopBar = () => {
  const { t } = useTranslation();
  return (
    <header className="no-print sticky top-0 z-30 border-b border-rule/70 bg-background/85 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-[1.75rem] italic leading-none">{t("app.name")}</span>
          <span className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            {t("app.shop")}
          </span>
        </div>
        <ShellToggles className="-me-2" />
      </div>
    </header>
  );
};

const MobileTabBar = ({ onAdd }) => {
  const { t } = useTranslation();
  const search = useNavSearch();
  const tab = (item) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.key}
        to={{ pathname: item.to, search }}
        end={item.end}
        className={({ isActive }) =>
          cn(
            "relative flex flex-col items-center justify-center gap-1 pt-1 text-[0.65rem] font-semibold transition-colors",
            isActive ? "text-primary" : "text-muted-foreground",
          )
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden /> : null}
            <Icon className="size-5" />
            <span className="max-w-full truncate px-1">{t(`nav.${item.key}`)}</span>
          </>
        )}
      </NavLink>
    );
  };
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label={t("shell.navigation")}
    >
      <div className="grid h-16 grid-cols-5">
        {NAV.slice(0, 2).map(tab)}
        <div className="relative flex items-start justify-center">
          <button
            type="button"
            onClick={() => onAdd()}
            aria-label={t("shell.addExpense")}
            className="-mt-5 inline-flex size-14 items-center justify-center rounded-full border-4 border-background bg-brand text-brand-foreground shadow-[0_10px_24px_-8px_hsl(var(--brand)/0.7),inset_0_-3px_0_hsl(0_0%_0%/0.2)] transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.6} />
          </button>
        </div>
        {NAV.slice(2).map(tab)}
      </div>
    </nav>
  );
};

export const AppShell = ({ children }) => {
  const { openAdd } = useExpenseActions();
  const { pathname } = useLocation();
  const { data: settings } = useResource(() => settingsApi.get(), [], { reloadOnChange: false });

  // "N" = new expense (not while typing, not with modifiers, not when a dialog is open).
  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (isTyping(event.target) || document.querySelector("[role='dialog']")) return;
      event.preventDefault();
      openAdd();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openAdd]);

  // New page = top of the sheet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on route change only
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="relative z-[1] min-h-dvh">
      <Sidebar onAdd={openAdd} salesAppUrl={settings?.sales_app_url} />
      <MobileTopBar />
      <div className="lg:ps-[16.5rem]">
        <main className="mx-auto w-full max-w-[80rem] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-10">{children}</main>
      </div>
      <MobileTabBar onAdd={openAdd} />
    </div>
  );
};
