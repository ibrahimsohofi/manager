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

i18n.use(initReactI18next).init({
  resources,
  lng: "fr",
  fallbackLng: "fr",
  debug: false,

  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
