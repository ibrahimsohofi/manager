import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import ReactCountryFlag from "react-country-flag";

const languages = [
  { code: 'fr', name: 'Français', flag: <ReactCountryFlag countryCode="FR" svg style={{ width: '20px', height: '13px' }} /> },
  { code: 'ar', name: 'العربية', flag: <ReactCountryFlag countryCode="MA" svg style={{ width: '20px', height: '13px' }} />}
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (languageCode: string) => {
    i18n.changeLanguage(languageCode);

    // Set document direction for RTL support
    document.dir = languageCode === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = languageCode;

    // Add/remove RTL class to body for Tailwind CSS support
    if (languageCode === 'ar') {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  };

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <Select value={i18n.language} onValueChange={changeLanguage}>
      <SelectTrigger className="w-40 border-white/30 text-white hover:bg-white/10 focus:ring-orange-400 focus:border-orange-400">
        <SelectValue>
          <div className="flex items-center gap-2">
            <span>{currentLanguage.flag}</span>
            <span className="hidden sm:inline">{currentLanguage.name}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-white   border-blue-200 dark:bg-gray-900">
        {languages.map((language) => (
          <SelectItem key={language.code} value={language.code} className="hover:bg-blue-50 dark:focus:bg-accent dark:hover:bg-accent">
            <div className="flex items-center gap-2">
              <span>{language.flag}</span>
              <span>{language.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
