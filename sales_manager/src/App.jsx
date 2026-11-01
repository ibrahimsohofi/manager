import { createContext, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import CustomerDetails from "./components/CustomerDetails.jsx";
import CustomerWishlist from "./components/CustomerWishlist.jsx";
import Customers from "./components/Customers.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Inventory from "./components/Inventory.jsx";
import LanguageSwitcher from "./components/LanguageSwitcher.jsx";
import Navigation from "./components/Navigation.jsx";
import Reports from "./components/Reports.jsx";
import SalesForm from "./components/SalesForm.jsx";
import SalesList from "./components/SalesList.jsx";
import QrSale from "./components/QrSale.jsx";
import QrLabels from "./components/QrLabels.jsx";
import Suppliers from "./components/Suppliers.jsx";
import IntegrationStatusWidget from "./components/IntegrationStatusWidget.jsx";
import "./i18n";
import OutOfStock from "./components/OutOfStock.jsx";
import ConnectionStatus from "./components/ConnectionStatus.jsx"

// Dark mode context
const DarkModeContext = createContext();

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) {
    throw new Error("useDarkMode must be used within a DarkModeProvider");
  }
  return context;
};

const DarkModeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });

  const toggleDarkMode = () => {
    const newMode = !isDark;
    setIsDark(newMode);
    localStorage.setItem("darkMode", JSON.stringify(newMode));
  };

  return (
    <DarkModeContext.Provider value={{ isDark, toggleDarkMode }}>
      <div className={isDark ? "dark" : ""}>{children}</div>
    </DarkModeContext.Provider>
  );
};

const DarkModeToggle = () => {
  const { isDark, toggleDarkMode } = useDarkMode();

  return (
    <button
      onClick={toggleDarkMode}
      className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200"
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
};

const CustomerWishlistRedirect = () => {
  const { customerId } = useParams();
  if (!customerId) {
    return <Navigate to="/customers" replace />;
  }
  return <Navigate to={`/customers/${customerId}/wishlist`} replace />;
};

function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [editingSale, setEditingSale] = useState(null);

  // Get active tab from URL
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === "/") return "dashboard";
    if (path.startsWith("/customers/")) return "customers";
    return path.substring(1);
  };

  const activeTab = getActiveTab();

  // Initialize language and direction on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem("language") || "fr";
    i18n.changeLanguage(savedLanguage);

    // Set document direction for RTL support
    document.dir = savedLanguage === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = savedLanguage;

    // Add/remove RTL class to body for Tailwind CSS support
    if (savedLanguage === "ar") {
      document.body.classList.add("rtl");
    } else {
      document.body.classList.remove("rtl");
    }
  }, [i18n]);

  const handleEditSale = (sale) => {
    setEditingSale(sale);
    navigate("/add-sale");
  };

  const handleEditComplete = () => {
    setEditingSale(null);
    navigate("/sales-list");
  };

  const handleSaleAdded = () => {
    // Refresh data or trigger re-fetch
    console.log("Sale added successfully");
  };

  const setActiveTab = (tab) => {
    navigate(`/${tab === "dashboard" ? "" : tab}`);
  };

  return (
    <DarkModeProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="container mx-auto px-4 py-8">
          <header className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                  {t("app.title")}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <ConnectionStatus />
                <LanguageSwitcher />
                <DarkModeToggle />
              </div>
            </div>
          </header>

          <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

          <main>
            <Routes>
              <Route path="/" element={<Dashboard onNavigateToOutOfStock={() => navigate('/outofstock')} />} />
              <Route path="/dashboard" element={<Dashboard onNavigateToOutOfStock={() => navigate('/outofstock')} />} />
              <Route
                path="/add-sale"
                element={
                  <SalesForm
                    onSaleAdded={handleSaleAdded}
                    editingSale={editingSale}
                    onEditComplete={handleEditComplete}
                  />
                }
              />
              <Route
                path="/sales-list"
                element={<SalesList onEditSale={handleEditSale} />}
              />
              <Route path="/qr-sale" element={<QrSale />} />
              <Route path="/qr-labels" element={<QrLabels />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/customers" element={<Customers />} />
              <Route
                path="/customers/:customerId"
                element={<CustomerDetails />}
              />
              <Route
                path="/customers/:customerId/wishlist"
                element={<CustomerWishlist />}
              />
              <Route
                path="/customer-wishlist/:customerId"
                element={<CustomerWishlistRedirect />}
              />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/outofstock" element={<OutOfStock />} />
            </Routes>
          </main>
        </div>
      </div>
    </DarkModeProvider>
  );
}

export default App;
