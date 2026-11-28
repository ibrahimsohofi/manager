// Display preferences: theme (light / dark), language (fr / ar + RTL) and the "discreet" mode that blurs
// amounts. Stored in localStorage; index.html applies theme + lang before the first paint (same keys).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import i18n from "../i18n";

const KEYS = { theme: "finance.theme", lang: "finance.lang", discreet: "finance.discreet" };

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

const initialTheme = () => {
  const stored = read(KEYS.theme);
  if (stored === "dark" || stored === "light") return stored;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
};

const PreferencesContext = createContext(null);

export const PreferencesProvider = ({ children }) => {
  const [theme, setThemeState] = useState(initialTheme);
  const [lang, setLangState] = useState(() => (read(KEYS.lang) === "ar" ? "ar" : "fr"));
  const [discreet, setDiscreet] = useState(() => read(KEYS.discreet) === "1");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    // Browser chrome in brand navy (matches the sidebar / PIN cover).
    if (meta) meta.setAttribute("content", theme === "dark" ? "#041a33" : "#07294D");
    write(KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    if (i18n.language !== lang) i18n.changeLanguage(lang);
    write(KEYS.lang, lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.classList.toggle("discreet", discreet);
    write(KEYS.discreet, discreet ? "1" : "0");
  }, [discreet]);

  const toggleTheme = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);
  const setTheme = useCallback((value) => setThemeState(value === "dark" ? "dark" : "light"), []);
  const setLang = useCallback((value) => setLangState(value === "ar" ? "ar" : "fr"), []);
  const toggleLang = useCallback(() => setLangState((l) => (l === "ar" ? "fr" : "ar")), []);
  const toggleDiscreet = useCallback(() => setDiscreet((d) => !d), []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, lang, setLang, toggleLang, discreet, toggleDiscreet, isRtl: lang === "ar" }),
    [theme, setTheme, toggleTheme, lang, setLang, toggleLang, discreet, toggleDiscreet],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside <PreferencesProvider>");
  return context;
};
