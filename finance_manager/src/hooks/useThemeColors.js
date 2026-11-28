// Recharts writes colours into SVG attributes, where CSS variables are not reliable. This hook resolves the
// ledger tokens (index.css) to concrete hsl() strings and recomputes them when the theme changes.
import { useMemo } from "react";
import { usePreferences } from "../context/PreferencesContext";

const TOKENS = ["gain", "gain-soft", "loss", "loss-soft", "due", "rule", "muted-foreground", "foreground", "paper", "primary"];

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const useThemeColors = () => {
  const { theme } = usePreferences();
  // biome-ignore lint/correctness/useExhaustiveDependencies: `theme` toggles the .dark class read below.
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const colors = {};
    for (const token of TOKENS) {
      const raw = style.getPropertyValue(`--${token}`).trim();
      colors[camel(token)] = raw ? `hsl(${raw})` : "currentColor";
    }
    return colors;
  }, [theme]);
};
