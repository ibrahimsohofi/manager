import {
  Wrench,
  ShoppingCart,
  Package,
  Store,
  Menu,
  Settings,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./theme-toggle";
import { Link } from "react-router-dom";

export function Navbar() {
  const { t } = useTranslation();

  return (
    <nav className="relative border-b bg-gradient-to-r from-blue-800 to-blue-900 dark:from-gray-900 dark:to-gray-800 shadow-xl backdrop-blur-sm">
      <div className="container mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo Section */}
          <div className="flex items-center group">
            <Link to="/" className="flex items-center space-x-3 transition-all duration-300 hover:scale-105">
             
              <div className="text-white">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight transition-all duration-300 hover:text-orange-100">
                  SOHOFIBRICO
                </h1>
                <p className="text-xs text-blue-200 hidden md:block">
                  {t("business.tagline", "Solutions Pro")}
                </p>
              </div>
            </Link>
          </div>

          {/* Center Navigation */}
          <div className="hidden lg:flex items-center space-x-8">
            <div className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-orange-400/30">
              <ShoppingCart className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-medium text-white">
                {t("nav.inventory", "Inventaire")}
              </span>
              <div className="ml-2 px-2 py-0.5 bg-orange-400 text-blue-900 text-xs font-semibold rounded-full">
                {t("nav.active", "Actif")}
              </div>
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-3">
            {/* Mobile menu button */}
            <button className="md:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200">
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop status indicator */}
            <div className="hidden md:flex items-center space-x-1 px-3 py-2 bg-green-500/20 border border-green-400/30 rounded-lg  ">
              <div className="h-2 w-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-green-300 font-medium">
               {t("nav.enligne")}
              </span>
            </div>

            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-white/10 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm text-white">
                <ShoppingCart className="h-4 w-4 text-orange-400" />
                <span>{t("nav.inventory", "Inventaire")}</span>
              </div>
            </div>
            <div className="text-xs text-blue-200">
              {t("business.tagline", "Solutions Pro")}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
