import { Crown } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

const BADGE_SIZES = {
  sm: "gap-0.5 px-1.5 py-0.5 text-[10px]",
  md: "gap-1 px-2 py-1 text-xs",
};

// Gold "VIP" chip shown next to the client type (list, client page, till picker).
export function VipBadge({ size = "md", className = "" }) {
  const { t } = useTranslation();
  return (
    <span
      title={t("customers.vip.label")}
      className={`inline-flex shrink-0 items-center rounded-md bg-gradient-to-r from-amber-300 to-amber-500 font-bold uppercase tracking-wide text-amber-950 shadow-sm ring-1 ring-amber-600/30 ${BADGE_SIZES[size] || BADGE_SIZES.md} ${className}`}
    >
      <Crown className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      {t("customers.vip.badge")}
    </span>
  );
}

// On / off switch for the client forms. VIP clients get the A4 invoice at the till.
export function VipSwitch({ checked, onChange, disabled = false }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${
        checked
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            checked
              ? "bg-amber-400 text-amber-950"
              : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          }`}
        >
          <Crown className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">
            {t("customers.vip.label")}
          </label>
          <p className="text-xs text-gray-600 dark:text-gray-400">{t("customers.vip.hint")}</p>
        </div>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[1.375rem] rtl:-translate-x-[1.375rem]" : "translate-x-0.5 rtl:-translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
