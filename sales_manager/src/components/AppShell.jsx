// The till's account book: same navy "cloth" spine + index tabs as finance_manager (desktop),
// a top bar + bottom tabs + "Nouvelle vente" FAB + "Plus" sheet on mobile.
// Theme ("darkMode") and language ("language") use the same localStorage keys as index.html's pre-paint script.
// "N" anywhere (outside a field / dialog, not on the scanner pages) opens a new sale.
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  Boxes,
  ChartColumn,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  Lock,
  Moon,
  NotebookPen,
  PackageX,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Sun,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CONNECTION_STATUS, FINANCE_APP_URL, PRODUCTS_MANAGER_API, buildUrl } from "../config/integration.js";
import { cn } from "../lib/utils";
import inventoryService from "../services/inventoryIntegration.js";

const QR_CART_KEY = "salesManager.qrCart"; // same key as QrSale.jsx
const NEW_SALE_PATH = "/add-sale";
// Pages driven by a USB / phone scanner: no single-key shortcut there (a scanned "N" must not navigate).
const NO_SHORTCUT_PATHS = ["/qr-sale", "/qr-labels"];

/** Index tabs, grouped like the shop's day: till, stock, people, figures. Folios run across groups. */
const GROUPS = [
  {
    key: "till",
    items: [
      { id: "dashboard", to: "/", icon: LayoutDashboard, label: "nav.dashboard", exact: ["/", "/dashboard"] },
      { id: "qr-sale", to: "/qr-sale", icon: ScanLine, label: "nav.qrSale", badge: "cart" },
      { id: "sales-list", to: "/sales-list", icon: ReceiptText, label: "nav.salesHistory" },
      { id: "estimates", to: "/estimates", icon: FileText, label: "nav.estimates" },
    ],
  },
  {
    key: "stock",
    items: [
      { id: "inventory", to: "/inventory", icon: Boxes, label: "nav.inventory" },
      { id: "outofstock", to: "/outofstock", icon: PackageX, label: "nav.outOfStock", badge: "outOfStock" },
      { id: "qr-labels", to: "/qr-labels", icon: QrCode, label: "nav.qrLabels" },
    ],
  },
  {
    key: "contacts",
    items: [
      { id: "customers", to: "/customers", icon: Users, label: "nav.customers", prefix: ["/customers", "/customer-wishlist"] },
      { id: "suppliers", to: "/suppliers", icon: Truck, label: "nav.suppliers", prefix: ["/suppliers"] },
      { id: "carnet", to: "/carnet", icon: NotebookPen, label: "nav.carnet", prefix: ["/carnet"] },
    ],
  },
  {
    key: "analysis",
    items: [
      { id: "reports", to: "/reports", icon: ChartColumn, label: "nav.reports" },
      { id: "finances", href: FINANCE_APP_URL, icon: Wallet, label: "nav.finances", external: true },
    ],
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const NAV_GROUPS = (() => {
  let n = 0;
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      n += 1;
      return { ...item, folio: ROMAN[n - 1] };
    }),
  }));
})();
const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const findItem = (id) => ALL_ITEMS.find((item) => item.id === id);

/** Mobile bottom bar: 2 tabs, the FAB, 1 tab, "Plus". */
const MOBILE_TABS = [
  { id: "dashboard", short: "shell.short.dashboard" },
  { id: "qr-sale", short: "shell.short.qrSale" },
  { id: "sales-list", short: "shell.short.salesHistory" },
];

const isItemActive = (item, pathname) => {
  if (item.external) return false;
  if (item.exact) return item.exact.includes(pathname);
  const prefixes = item.prefix || [item.to];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
};

const isTyping = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

// ---------------------------------------------------------------- preferences

const readDark = () => {
  try {
    return JSON.parse(localStorage.getItem("darkMode") || "false") === true;
  } catch {
    return false;
  }
};

/** Dark mode lives on <html> so Radix portals, dialogs and toasts follow it too. */
const useTheme = () => {
  const [isDark, setIsDark] = useState(readDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#041a33" : "#07294D");
    try {
      localStorage.setItem("darkMode", JSON.stringify(isDark));
    } catch {
      /* private mode */
    }
  }, [isDark]);
  const toggle = useCallback(() => setIsDark((d) => !d), []);
  return { isDark, toggle };
};

const useLanguage = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language === "ar" ? "ar" : "fr";
  const toggle = useCallback(() => {
    const next = lang === "ar" ? "fr" : "ar";
    i18n.changeLanguage(next);
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = next;
    document.body.classList.toggle("rtl", next === "ar");
    try {
      localStorage.setItem("language", next);
    } catch {
      /* private mode */
    }
  }, [i18n, lang]);
  return { lang, isRtl: lang === "ar", toggle };
};

// ---------------------------------------------------------------- live data

/** Inventory API health. Periodic re-checks don't flicker the dot back to "checking". */
const useInventoryStatus = () => {
  const [status, setStatus] = useState(CONNECTION_STATUS.CHECKING);
  useEffect(
    () =>
      inventoryService.onConnectionChange((next) => {
        setStatus((prev) => (next === CONNECTION_STATUS.CHECKING && prev !== CONNECTION_STATUS.CHECKING ? prev : next));
      }),
    [],
  );
  const retry = useCallback(() => {
    setStatus(CONNECTION_STATUS.CHECKING);
    inventoryService.healthCheck();
  }, []);
  return { status, retry };
};

const useOutOfStockCount = () => {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch(buildUrl(PRODUCTS_MANAGER_API.BASE_URL, "/api/outofstock"));
        const data = await response.json();
        if (alive) setCount(Array.isArray(data?.data) ? data.data.length : null);
      } catch {
        if (alive) setCount(null);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return count;
};

const readCartLines = () => {
  try {
    const data = JSON.parse(localStorage.getItem(QR_CART_KEY) || "[]");
    return Array.isArray(data) ? data.filter((line) => line && Number(line.product_id) > 0).length : 0;
  } catch {
    return 0;
  }
};

/** Lines waiting in the Vente QR cart (it is kept in localStorage between pages). */
const useQrCartLines = (pathname) => {
  const [lines, setLines] = useState(readCartLines);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read when the page changes
  useEffect(() => {
    setLines(readCartLines());
  }, [pathname]);
  useEffect(() => {
    const refresh = () => setLines(readCartLines());
    const timer = setInterval(refresh, 4000);
    window.addEventListener("storage", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return lines;
};

// ---------------------------------------------------------------- small parts

const Tip = ({ label, children, side = "bottom" }) => {
  if (!label) return children;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium leading-snug text-background shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
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

const STATUS_TONE = {
  [CONNECTION_STATUS.CONNECTED]: "bg-gain shadow-[0_0_0_3px_hsl(var(--gain)/0.25)]",
  [CONNECTION_STATUS.CHECKING]: "bg-white/50 animate-pulse",
  [CONNECTION_STATUS.DISCONNECTED]: "bg-loss shadow-[0_0_0_3px_hsl(var(--loss)/0.3)]",
  [CONNECTION_STATUS.ERROR]: "bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.3)]",
};
const statusKey = (status) =>
  [CONNECTION_STATUS.CONNECTED, CONNECTION_STATUS.DISCONNECTED, CONNECTION_STATUS.ERROR].includes(status)
    ? status
    : CONNECTION_STATUS.CHECKING;
const isDown = (status) => status === CONNECTION_STATUS.DISCONNECTED || status === CONNECTION_STATUS.ERROR;

/** Inventory API line: dot + label (+ retry when it is down). */
const StatusLine = ({ inventory, tone = "cloth", className }) => {
  const { t } = useTranslation();
  const key = statusKey(inventory.status);
  const paperDot = key === CONNECTION_STATUS.CHECKING ? "bg-muted-foreground/50 animate-pulse" : STATUS_TONE[key];
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-[0.7rem]",
        tone === "cloth" ? "text-white/60" : "text-muted-foreground",
        className,
      )}
      aria-live="polite"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone === "cloth" ? STATUS_TONE[key] : paperDot)} aria-hidden />
      <span className="truncate">{t(`shell.status.${key}`)}</span>
      {isDown(inventory.status) ? (
        <button
          type="button"
          onClick={inventory.retry}
          className={cn(
            "ms-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold transition-colors",
            tone === "cloth" ? "text-brand hover:bg-white/10" : "text-primary hover:bg-secondary",
          )}
        >
          <RefreshCw className="size-3" />
          {t("shell.status.retry")}
        </button>
      ) : null}
    </div>
  );
};

/** Language + theme. `tone="cloth"` on the navy sidebar. */
const ShellToggles = ({ theme, language, tone = "paper", className }) => {
  const { t } = useTranslation();
  const btn =
    tone === "cloth"
      ? "text-white/75 hover:bg-white/10 hover:text-white"
      : "text-foreground/75 hover:bg-secondary/80 hover:text-foreground";
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Tip label={t("shell.language")}>
        <button
          type="button"
          onClick={language.toggle}
          aria-label={t("shell.language")}
          className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-semibold transition-colors", btn)}
        >
          {language.lang === "ar" ? "FR" : "ع"}
        </button>
      </Tip>
      <Tip label={t("shell.theme")}>
        <button
          type="button"
          onClick={theme.toggle}
          aria-label={t("shell.theme")}
          aria-pressed={theme.isDark}
          className={cn("inline-flex size-8 items-center justify-center rounded-md transition-colors [&_svg]:size-4", btn)}
        >
          {theme.isDark ? <Sun /> : <Moon />}
        </button>
      </Tip>
    </div>
  );
};

/** Count pill on a tab (cart lines, out-of-stock products). */
const TabBadge = ({ item, counts, active, className }) => {
  const { t } = useTranslation();
  if (item.badge === "cart" && counts.cart > 0) {
    return (
      <span
        className={cn(
          "figure inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full bg-brand px-1.5 text-[0.65rem] font-bold text-brand-foreground shadow-[0_0_0_3px_hsl(var(--brand)/0.18)]",
          className,
        )}
        title={`${counts.cart} · ${t("shell.inProgress")}`}
      >
        {counts.cart}
      </span>
    );
  }
  if (item.badge === "outOfStock" && counts.outOfStock > 0) {
    return (
      <span
        className={cn(
          "figure inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.65rem] font-bold",
          active ? "bg-due-soft text-due" : "bg-white/10 text-white/85 ring-1 ring-inset ring-brand/50",
          className,
        )}
      >
        {counts.outOfStock > 99 ? "99+" : counts.outOfStock}
      </span>
    );
  }
  return null;
};

// ---------------------------------------------------------------- desktop

/** Desktop index tab: the active one is cut from the page colour and joins the sheet. */
const SideTab = ({ item, active, isRtl, counts, index }) => {
  const { t } = useTranslation();
  const Icon = item.icon;
  const corner = (y) => ({
    backgroundImage: `radial-gradient(circle at ${isRtl ? "100%" : "0"} ${y}, transparent 0.75rem, hsl(var(--background)) calc(0.75rem + 0.5px))`,
  });
  const className = cn(
    "group relative flex h-10 animate-tab-in items-center gap-2.5 rounded-s-lg ps-3 pe-4 text-[0.9rem] font-semibold transition-colors",
    active ? "bg-background text-foreground" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
  );
  const body = (
    <>
      {active ? (
        <>
          <span aria-hidden className="pointer-events-none absolute -top-3 end-0 size-3" style={corner("0")} />
          <span aria-hidden className="pointer-events-none absolute -bottom-3 end-0 size-3" style={corner("100%")} />
        </>
      ) : null}
      <span
        className={cn(
          "w-8 shrink-0 text-center font-display text-[0.95rem] italic leading-none",
          active ? "text-brand" : "text-brand/70",
        )}
        aria-hidden
      >
        {item.folio}
      </span>
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-primary" : "opacity-80")} />
      <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
      <TabBadge item={item} counts={counts} active={active} />
      {item.external ? (
        <span className="flex items-center gap-1 text-white/45 group-hover:text-white/70">
          <Lock className="size-3" aria-label={t("shell.pinProtected")} />
          <ExternalLink className="size-3 rtl:-scale-x-100" aria-hidden />
        </span>
      ) : null}
    </>
  );
  const style = { animationDelay: `${80 + index * 35}ms` };
  if (item.external) {
    return (
      <Tip label={t("nav.financesHint")} side={isRtl ? "left" : "right"}>
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} style={style}>
          {body}
        </a>
      </Tip>
    );
  }
  return (
    <Link to={item.to} aria-current={active ? "page" : undefined} className={className} style={style}>
      {body}
    </Link>
  );
};

const Sidebar = ({ pathname, counts, inventory, theme, language, onNewSale, ctaRef }) => {
  const { t } = useTranslation();
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat(language.lang === "ar" ? "ar-MA" : "fr-MA", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [language.lang],
  );
  const onNewSalePage = pathname === NEW_SALE_PATH;
  let index = 0;
  return (
    <aside className="cloth no-print fixed inset-y-0 start-0 z-30 hidden w-[16.5rem] flex-col text-white/85 lg:flex">
      {/* hairline frame + brand orange spine */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-3 start-3 end-0 rounded-s-sm border-y border-s border-white/[0.08]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-1 bg-brand" />

      <div className="relative px-7 pb-5 pt-7 [@media(max-height:760px)]:pb-4 [@media(max-height:760px)]:pt-5">
        <p className="flex items-center text-[0.62rem] font-bold uppercase tracking-[0.32em] text-brand rtl:gap-1.5 rtl:text-[0.75rem] rtl:tracking-normal">
          <span aria-hidden className="me-2 h-px w-5 bg-brand/60" />
          <span className="text-white">{t("shell.shop.name")}</span>
          <span>{t("shell.shop.slogan")}</span>
        </p>
        <h1 className="mt-2 font-display text-[2.7rem] italic leading-[0.9] text-white [text-shadow:0_1px_0_rgba(0,0,0,0.45)] [@media(max-height:760px)]:text-[2.2rem]">
          {t("shell.appName")}
        </h1>
        <p className="mt-2 text-xs text-white/55 first-letter:uppercase [@media(max-height:760px)]:hidden">{today}</p>
      </div>

      <div className="relative px-6">
        <Tip label={t("shell.newSaleHint")} side={language.isRtl ? "left" : "right"}>
          <Link
            ref={ctaRef}
            to={NEW_SALE_PATH}
            onClick={onNewSale}
            aria-current={onNewSalePage ? "page" : undefined}
            className={cn(
              "group flex h-11 w-full items-center justify-between gap-2 rounded-md border border-white/15 bg-brand px-3.5 text-sm font-semibold text-brand-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.18),0_8px_22px_-8px_hsl(var(--brand)/0.65)] transition-[filter,transform] hover:brightness-110 active:translate-y-px",
              onNewSalePage && "ring-2 ring-white/70 ring-offset-2 ring-offset-navy",
            )}
          >
            <span className="flex items-center gap-2">
              <Plus className="size-4" strokeWidth={2.6} />
              {t("nav.newSale")}
            </span>
            <Kbd className="border-white/30 bg-white/15 text-white/90">N</Kbd>
          </Link>
        </Tip>
      </div>

      <nav
        className="relative mt-4 min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-3 ps-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("shell.navigation")}
      >
        {NAV_GROUPS.map((group) => (
          // biome-ignore lint/a11y/useSemanticElements: a labelled link group inside <nav>; <fieldset> is for form controls
          <div key={group.key} role="group" aria-labelledby={`nav-group-${group.key}`} className="mb-2 last:mb-0">
            <p
              id={`nav-group-${group.key}`}
              className="flex items-center gap-2 pb-1.5 pe-6 ps-3 pt-2 text-[0.6rem] font-semibold uppercase tracking-[0.26em] text-white/40 rtl:text-[0.7rem] rtl:tracking-normal"
            >
              {t(`shell.groups.${group.key}`)}
              <span className="h-px flex-1 bg-white/10" aria-hidden />
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                index += 1;
                return (
                  <SideTab
                    key={item.id}
                    item={item}
                    index={index}
                    active={isItemActive(item, pathname)}
                    isRtl={language.isRtl}
                    counts={counts}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="relative space-y-3 px-6 pb-5 pt-3">
        <StatusLine inventory={inventory} />
        <div className="h-px bg-white/10" />
        <ShellToggles tone="cloth" theme={theme} language={language} className="-mx-2" />
      </div>
    </aside>
  );
};

// ---------------------------------------------------------------- mobile

const MobileTopBar = ({ inventory, theme, language }) => {
  const { t } = useTranslation();
  const key = statusKey(inventory.status);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-rule/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-[1.75rem] italic leading-none">{t("shell.appName")}</span>
          <span className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground rtl:tracking-normal">
            {t("shell.shop.full")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tip label={t(`shell.status.${key}`)}>
            <button
              type="button"
              onClick={isDown(inventory.status) ? inventory.retry : undefined}
              aria-label={t(`shell.status.${key}`)}
              className="inline-flex size-8 items-center justify-center rounded-md"
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  key === CONNECTION_STATUS.CHECKING ? "bg-muted-foreground/50 animate-pulse" : STATUS_TONE[key],
                )}
              />
            </button>
          </Tip>
          <ShellToggles theme={theme} language={language} className="-me-2" />
        </div>
      </div>
    </header>
  );
};

const MobileTabBar = ({ pathname, counts, onNewSale, onOpenMore, moreOpen }) => {
  const { t } = useTranslation();
  const bottomIds = MOBILE_TABS.map((tab) => tab.id);
  const elsewhere =
    pathname !== NEW_SALE_PATH && !ALL_ITEMS.some((item) => bottomIds.includes(item.id) && isItemActive(item, pathname));

  const tab = ({ id, short }) => {
    const item = findItem(id);
    const Icon = item.icon;
    const active = isItemActive(item, pathname);
    return (
      <Link
        key={id}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 pt-1 text-[0.65rem] font-semibold transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden /> : null}
        <span className="relative">
          <Icon className="size-5" />
          <TabBadge item={item} counts={counts} className="absolute -end-3 -top-2 h-4 min-w-4 px-1 text-[0.6rem]" />
        </span>
        <span className="max-w-full truncate px-1">{t(short)}</span>
      </Link>
    );
  };

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label={t("shell.navigation")}
    >
      <div className="grid h-16 grid-cols-5">
        {MOBILE_TABS.slice(0, 2).map(tab)}
        <div className="relative flex items-start justify-center">
          <Link
            to={NEW_SALE_PATH}
            onClick={onNewSale}
            aria-label={t("nav.newSale")}
            aria-current={pathname === NEW_SALE_PATH ? "page" : undefined}
            className={cn(
              "-mt-5 inline-flex size-14 items-center justify-center rounded-full border-4 border-background bg-brand text-brand-foreground shadow-[0_10px_24px_-8px_hsl(var(--brand)/0.7),inset_0_-3px_0_hsl(0_0%_0%/0.2)] transition-transform active:scale-95",
              pathname === NEW_SALE_PATH && "ring-2 ring-brand/40 ring-offset-2 ring-offset-paper",
            )}
          >
            <Plus className="size-6" strokeWidth={2.6} />
          </Link>
        </div>
        {MOBILE_TABS.slice(2).map(tab)}
        <button
          type="button"
          onClick={onOpenMore}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "relative flex flex-col items-center justify-center gap-1 pt-1 text-[0.65rem] font-semibold transition-colors",
            elsewhere || moreOpen ? "text-primary" : "text-muted-foreground",
          )}
        >
          {elsewhere ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary" aria-hidden /> : null}
          <span className="relative">
            <LayoutGrid className="size-5" />
            {counts.outOfStock > 0 ? (
              <span className="absolute -end-1 -top-1 size-2 rounded-full bg-brand ring-2 ring-paper" aria-hidden />
            ) : null}
          </span>
          <span className="max-w-full truncate px-1">{t("shell.more")}</span>
        </button>
      </div>
    </nav>
  );
};

/** One page tile in the "Plus" sheet (folio, icon, label, badge / external mark). */
const MoreTile = ({ item, active, counts }) => {
  const { t } = useTranslation();
  const Icon = item.icon;
  const className = cn(
    "relative flex min-h-[5.25rem] flex-col justify-between gap-2 rounded-lg border p-3 text-start transition-colors",
    active
      ? "border-brand/60 bg-brand-soft text-foreground shadow-[inset_0_0_0_1px_hsl(var(--brand)/0.35)]"
      : "border-border bg-paper hover:border-rule hover:bg-secondary/60",
  );
  const content = (
    <>
      <span className="flex items-start justify-between gap-2">
        <Icon className={cn("size-5", active ? "text-brand" : "text-primary")} />
        <span className="font-display text-sm italic leading-none text-brand/80">{item.folio}</span>
      </span>
      <span className="flex items-end justify-between gap-1">
        <span className="text-[0.8rem] font-semibold leading-tight">{t(item.label)}</span>
        {item.external ? (
          <ExternalLink className="size-3 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
        ) : (
          <TabBadge item={item} counts={counts} active />
        )}
      </span>
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link to={item.to} aria-current={active ? "page" : undefined} className={className}>
      {content}
    </Link>
  );
};

/** "Plus": every page, grouped like the sidebar, as a bottom sheet. */
const MoreSheet = ({ open, onClose, pathname, counts, inventory }) => {
  const { t } = useTranslation();
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: custom bottom sheet (focus + Escape + scroll lock handled above), not a native <dialog>
    <div className="no-print fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title">
      <button
        type="button"
        aria-label={t("shell.close")}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 animate-fade-in bg-navy-deep/55 backdrop-blur-[2px]"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl">
        <div className="cloth relative shrink-0 px-5 pb-4 pt-3 text-white">
          <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-brand rtl:tracking-normal">
                {t("shell.shop.full")}
              </p>
              <h2 id="more-sheet-title" className="mt-1 font-display text-[1.9rem] italic leading-none">
                {t("shell.allPages")}
              </h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t("shell.close")}
              className="inline-flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          {NAV_GROUPS.map((group) => (
            <section key={group.key} className="mb-5 last:mb-3">
              <h3 className="eyebrow mb-2 flex items-center gap-2 px-1">
                {t(`shell.groups.${group.key}`)}
                <span className="h-px flex-1 bg-rule/70" aria-hidden />
              </h3>
              <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
                {group.items.map((item) => (
                  <MoreTile key={item.id} item={item} active={isItemActive(item, pathname)} counts={counts} />
                ))}
              </div>
            </section>
          ))}
          <StatusLine inventory={inventory} tone="paper" className="mt-2 rounded-md border border-dashed border-rule px-3 py-2.5" />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- shell

export const AppShell = ({ children, onNewSale }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const language = useLanguage();
  const inventory = useInventoryStatus();
  const outOfStock = useOutOfStockCount();
  const cart = useQrCartLines(pathname);
  const counts = useMemo(() => ({ cart, outOfStock: outOfStock ?? 0 }), [cart, outOfStock]);
  const [moreOpen, setMoreOpen] = useState(false);
  const ctaRef = useRef(null);

  const closeMore = useCallback(() => setMoreOpen(false), []);

  // "N" = new sale. Goes through the CTA link so page guards (unsaved changes) still ask first.
  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key !== "n" && event.key !== "N") return;
      if (isTyping(event.target)) return;
      if (NO_SHORTCUT_PATHS.includes(window.location.pathname)) return;
      if (document.querySelector("[role='dialog'], [role='alertdialog'], .fixed.inset-0")) return;
      event.preventDefault();
      if (ctaRef.current) ctaRef.current.click();
      else {
        onNewSale?.();
        navigate(NEW_SALE_PATH);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, onNewSale]);

  // New page = top of the sheet, sheet closed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on route change only
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMoreOpen(false);
  }, [pathname]);

  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <div className="grain min-h-dvh">
        <div className="relative z-[1] min-h-dvh">
          <Sidebar
            pathname={pathname}
            counts={counts}
            inventory={inventory}
            theme={theme}
            language={language}
            onNewSale={onNewSale}
            ctaRef={ctaRef}
          />
          <MobileTopBar inventory={inventory} theme={theme} language={language} />
          <div className="print-reset lg:ps-[16.5rem]">
            <main className="print-reset mx-auto w-full max-w-[88rem] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
              {children}
            </main>
          </div>
          <MobileTabBar
            pathname={pathname}
            counts={counts}
            onNewSale={onNewSale}
            onOpenMore={() => setMoreOpen(true)}
            moreOpen={moreOpen}
          />
          <MoreSheet open={moreOpen} onClose={closeMore} pathname={pathname} counts={counts} inventory={inventory} />
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
};

export default AppShell;
