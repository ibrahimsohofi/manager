import { useTranslation } from "react-i18next";
import AnimatedLogo from "./AnimatedLogo";

// Loading state used across the app: the animated SOHOFI BRICO logo instead of a spinner.
// - `width`: max logo width in px (it shrinks to fit narrow containers)
// - `label`: optional visible text under the logo (screen readers always get one)
// - `onDark`: keep a light plate behind the logo on dark surfaces (camera view, ...).
//   In dark mode the plate is always shown so the navy letters stay readable.
export default function LogoLoader({ width = 320, label, className = "", onDark = false }) {
  const { t } = useTranslation();
  const compact = width < 200;
  const plate = onDark ? "bg-white/95" : "dark:bg-white/95";

  return (
    <output
      className={`flex w-full flex-col items-center justify-center ${compact ? "gap-1.5" : "gap-3"} ${className}`}
      aria-live="polite"
    >
      <div
        className={`w-full ${compact ? "rounded-lg px-1.5 py-1" : "rounded-2xl px-4 py-2"} ${plate}`}
        style={{ maxWidth: width }}
      >
        <AnimatedLogo width={width} />
      </div>
      {label ? (
        <p
          className={`text-center font-medium ${compact ? "text-xs" : "text-sm"} ${
            onDark ? "text-gray-300" : "text-gray-600 dark:text-gray-400"
          }`}
        >
          {label}
        </p>
      ) : (
        <span className="sr-only">{t("common.loading")}</span>
      )}
    </output>
  );
}
