// fr + ar (FINANCE_PLAN.md decision 31): small locale files, only the finance app's own keys.
// The active language is chosen in PreferencesContext (localStorage "finance.lang", read before first paint in index.html).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "./locales/ar.json";
import fr from "./locales/fr.json";

const stored = (() => {
  try {
    return localStorage.getItem("finance.lang");
  } catch {
    return null;
  }
})();

i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, ar: { translation: ar } },
  lng: stored === "ar" ? "ar" : "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
