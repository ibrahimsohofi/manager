import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import Carnet from "./components/Carnet.jsx";
import CarnetPerson from "./components/CarnetPerson.jsx";
import CustomerDetails from "./components/CustomerDetails.jsx";
import CustomerWishlist from "./components/CustomerWishlist.jsx";
import Customers from "./components/Customers.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Estimates from "./components/Estimates.jsx";
import Inventory from "./components/Inventory.jsx";
import OutOfStock from "./components/OutOfStock.jsx";
import QrLabels from "./components/QrLabels.jsx";
import QrSale from "./components/QrSale.jsx";
import Reports from "./components/Reports.jsx";
import SalesForm from "./components/SalesForm.jsx";
import SalesList from "./components/SalesList.jsx";
import SupplierLedgerEntry from "./components/SupplierLedgerEntry.jsx";
import Suppliers from "./components/Suppliers.jsx";
import "./i18n";

const CustomerWishlistRedirect = () => {
  const { customerId } = useParams();

  if (!customerId) {
    return <Navigate to="/customers" replace />;
  }

  return <Navigate to={`/customers/${customerId}/wishlist`} replace />;
};

function App() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [editingSale, setEditingSale] = useState(null);

  // Direction, language, and the RTL body class follow the active language.
  useEffect(() => {
    const apply = (lng) => {
      const isAr = lng === "ar";
      document.documentElement.dir = isAr ? "rtl" : "ltr";
      document.documentElement.lang = isAr ? "ar" : "fr";
      document.body.classList.toggle("rtl", isAr);
    };

    apply(i18n.language);
    i18n.on("languageChanged", apply);

    return () => i18n.off("languageChanged", apply);
  }, [i18n]);

  const handleEditSale = (sale) => {
    setEditingSale(sale);
    navigate("/add-sale");
  };

  const handleEditComplete = () => {
    setEditingSale(null);
    navigate("/sales-list");
  };

  // "Nouvelle vente" always opens an empty form.
  const handleNewSale = () => setEditingSale(null);

  const goToOutOfStock = () => navigate("/outofstock");

  return (
    <AppShell onNewSale={handleNewSale}>
      <Routes>
        <Route
          path="/"
          element={<Dashboard onNavigateToOutOfStock={goToOutOfStock} />}
        />
        <Route
          path="/dashboard"
          element={<Dashboard onNavigateToOutOfStock={goToOutOfStock} />}
        />
        <Route
          path="/add-sale"
          element={
            <SalesForm
              key={editingSale?.id ?? "new"}
              editingSale={editingSale}
              onEditComplete={handleEditComplete}
            />
          }
        />
        <Route
          path="/sales-list"
          element={<SalesList onEditSale={handleEditSale} />}
        />
        <Route path="/estimates" element={<Estimates />} />
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
        {/* Supplier operations (purchase, payment, or return) as a full page */}
        <Route
          path="/suppliers/:supplierId/notes"
          element={<SupplierLedgerEntry />}
        />
        <Route
          path="/suppliers/:supplierId/notes/:entryId/edit"
          element={<SupplierLedgerEntry />}
        />
        {/* Carnet: personal ledger (who owes what) */}
        <Route path="/carnet" element={<Carnet />} />
        <Route path="/carnet/:contactId" element={<CarnetPerson />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/outofstock" element={<OutOfStock />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
