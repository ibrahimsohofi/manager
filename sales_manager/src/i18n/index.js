import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import arTranslations from "./locales/ar.json";
import frTranslations from "./locales/fr.json";

const resources = {
  fr: {
    translation: frTranslations,
  },
  ar: {
    translation: arTranslations,
  },
};

// Start in the saved language (same "language" key as index.html's pre-paint script) -> no French flash.
const savedLanguage = (() => {
  try {
    return localStorage.getItem("language") === "ar" ? "ar" : "fr";
  } catch {
    return "fr";
  }
})();

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "fr",
  debug: false,

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
