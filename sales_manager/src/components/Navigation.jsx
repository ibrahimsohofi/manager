import { AlertTriangle, QrCode, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from 'react';
import IntegrationStatusWidget from "./IntegrationStatusWidget.jsx";
import { PRODUCTS_MANAGER_API, buildUrl } from "../config/integration.js";

const Navigation = ({ activeTab, setActiveTab }) => {
  const { t } = useTranslation();
  const [outOfStockProducts, setOutOfStockProducts] = useState([]);

  useEffect(() => {
    const fetchOutOfStockProducts = async () => {
      try {
        const url = buildUrl(PRODUCTS_MANAGER_API.BASE_URL, '/api/outofstock');
        const response = await fetch(url);
        const data = await response.json();
        setOutOfStockProducts(data.data || []);
      } catch (err) {
        console.log("Error fetching out of stock products:", err);
      }
    };

    fetchOutOfStockProducts();
    // Refresh every 30 seconds
    const interval = setInterval(fetchOutOfStockProducts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleNavigateToOutOfStock = () => {
    setActiveTab("outofstock");
  };

  const tabs = [
    {
      id: "dashboard",
      name: t("nav.dashboard"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      id: "add-sale",
      name: t("nav.newSale"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      ),
    },
    {
      id: "qr-sale",
      name: t("nav.qrSale"),
      icon: <ScanLine className="w-5 h-5" />,
    },
    {
      id: "qr-labels",
      name: t("nav.qrLabels"),
      icon: <QrCode className="w-5 h-5" />,
    },
    {
      id: "sales-list",
      name: t("nav.salesHistory"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
    },
    {
      id: "inventory",
      name: t("nav.inventory"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      ),
    },
    {
      id: "customers",
      name: t("nav.customers"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
          />
        </svg>
      ),
    },
    {
      id: "suppliers",
      name: t("nav.suppliers"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
    },
    {
      id: "reports",
      name: t("nav.reports"),
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      id: "outofstock",
      name: `${t("nav.outOfStock", "Produits Épuisés")} (${outOfStockProducts.length})`,
      icon: (
        <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
      ),
    },
  ];

  return (
    <nav className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-1 p-1">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.name}</span>
            </button>
          ))}
        </div>

        {/* Integration Status Widget - visible on larger screens */}
        <div className="hidden lg:block">
          <IntegrationStatusWidget
            variant="compact"
            onNavigateToOutOfStock={handleNavigateToOutOfStock}
          />
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
