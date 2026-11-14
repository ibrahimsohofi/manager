import {
  Clock,
  DollarSign,
  Edit,
  Filter,
  Hash,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  TrendingUp,
  User,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SALES_MANAGER_API } from "../config/integration.js";
import AnimatedLogo from "./AnimatedLogo";

const Customers = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [stats, setStats] = useState({});
  const debounceTimerRef = useRef(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Debounce search term (500ms delay)
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchTerm]);

  // Check for edit parameter in URL
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && customers.length > 0) {
      const customer = customers.find((c) => c.id === Number(editId));
      if (customer) {
        setEditingCustomer(customer);
        setSearchParams({}); // Clear the edit parameter
      }
    }
  }, [searchParams, customers, setSearchParams]);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const url = `${SALES_MANAGER_API.BASE_URL}/api/customers?`;
      const params = new URLSearchParams();

      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);
      if (typeFilter) params.append("customer_type", typeFilter);

      const response = await fetch(url + params.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();

      // Totals come with each row (till sales + credit + payments received)
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching customers:", error);
      setError("Failed to fetch customers");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, typeFilter]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Save a customer. Returns null on success, or { field, message } so the form can
  // show the error inline (and keep what was typed).
  const saveCustomer = async (url, method, customerData, fallbackKey) => {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerData),
      });
      if (response.ok) return null;
      const data = await response.json().catch(() => ({}));
      if (response.status === 409 && data.field === "code" && data.owner) {
        return {
          field: "code",
          message: t("customers.codeDuplicate", {
            code: customerData.code,
            name: data.owner.name,
            id: data.owner.id,
          }),
        };
      }
      return { field: null, message: data.error || t(fallbackKey) };
    } catch (error) {
      console.error("Error saving customer:", error);
      return { field: null, message: t(fallbackKey) };
    }
  };

  const handleAddCustomer = async (customerData) => {
    const error = await saveCustomer(
      `${SALES_MANAGER_API.BASE_URL}/api/customers`,
      "POST",
      customerData,
      "customers.errorAdd",
    );
    if (error) return error;
    setShowAddForm(false);
    fetchCustomers();
    return null;
  };

  const handleEditCustomer = async (customerData) => {
    const error = await saveCustomer(
      `${SALES_MANAGER_API.BASE_URL}/api/customers/${editingCustomer.id}`,
      "PUT",
      customerData,
      "customers.errorUpdate",
    );
    if (error) return error;
    setEditingCustomer(null);
    fetchCustomers();
    return null;
  };

  const handleDeleteCustomer = async (customerId) => {
    if (!window.confirm(t("customers.confirmDelete"))) return;

    try {
      const response = await fetch(
        `${SALES_MANAGER_API.BASE_URL}/api/customers/${customerId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer:", error);
      alert(t("customers.errorDelete"));
    }
  };

  const getCustomerTypeColor = (type) => {
    switch (type) {
      case "retail":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "wholesale":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300";
      case "commercial":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getCustomerTypeLabel = (type) => {
    switch (type) {
      case "retail":
        return t("customers.customerTypeRetailBilingual");
      case "wholesale":
        return t("customers.customerTypeWholesaleBilingual");
      case "commercial":
        return t("customers.customerTypeCommercialBilingual");
      default:
        return type;
    }
  };

  const formatCurrency = (amount) => {
    // Handle null/undefined/NaN values
    if (
      amount === null ||
      amount === undefined ||
      Number.isNaN(Number(amount))
    ) {
      return `0,00 ${t("currency")}`;
    }
    const locale = t("currency") === "د.م." ? "ar-MA" : "fr-MA";
    return `${new Intl.NumberFormat(locale, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(amount))} ${t("currency")}`;
  };

  const formatShortDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(i18n.language?.startsWith("ar") ? "ar-MA" : "fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Total purchases = till sales + order list; Paid = non-credit sales + payments received
  const getTotalPurchases = (customer) =>
    Number(customer.total_purchases) ||
    (Number(customer.total_spent) || 0) + (Number(customer.products_total) || 0);

  const getTotalPaid = (customer) => Number(customer.total_paid) || 0;

  // > 0: the client owes me, < 0: I owe the client (advance), 0: settled
  const calculateBalance = (customer) =>
    getTotalPurchases(customer) - getTotalPaid(customer);

  // "owesMe" | "iOwe" | "settled" | "none" (no purchase and no payment yet)
  const getAccountState = (customer) => {
    const balance = calculateBalance(customer);
    if (balance > 0.005) return "owesMe";
    if (balance < -0.005) return "iOwe";
    return getTotalPurchases(customer) > 0 || getTotalPaid(customer) > 0
      ? "settled"
      : "none";
  };

  const ACCOUNT_STYLES = {
    owesMe: {
      badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      amount: "text-red-600 dark:text-red-400",
      badgeKey: "customers.statusUnpaid",
      labelKey: "customers.owesMe",
    },
    iOwe: {
      badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
      amount: "text-amber-600 dark:text-amber-400",
      badgeKey: "customers.statusAdvance",
      labelKey: "customers.iOwe",
    },
    settled: {
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
      amount: "text-emerald-600 dark:text-emerald-400",
      badgeKey: "customers.statusPaid",
      labelKey: "customers.settled",
    },
    none: {
      badge: "",
      amount: "text-gray-500 dark:text-gray-400",
      badgeKey: null,
      labelKey: "customers.settled",
    },
  };

  const calculateStats = () => {
    const totalCustomers = customers.length;
    const totalRevenue = customers.reduce(
      (sum, c) => sum + getTotalPaid(c),
      0,
    );
    // Money clients still owe me (advances I owe them are not subtracted)
    const totalPending = customers.reduce(
      (sum, c) => sum + Math.max(calculateBalance(c), 0),
      0,
    );
    const avgPerCustomer =
      totalCustomers > 0 ? totalRevenue / totalCustomers : 0;

    return {
      totalCustomers,
      totalRevenue,
      totalPending,
      avgPerCustomer,
      retailCount: customers.filter((c) => c.customer_type === "retail").length,
      wholesaleCount: customers.filter((c) => c.customer_type === "wholesale")
        .length,
      commercialCount: customers.filter((c) => c.customer_type === "commercial")
        .length,
    };
  };

  const statsData = calculateStats();

  // Customer Form Component
  const CustomerForm = ({ customer, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
      name: customer?.name || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
      city: customer?.city || "",
      postal_code: customer?.postal_code || "",
      customer_type: customer?.customer_type || "retail",
      credit_limit: customer?.credit_limit || 0,
      notes: customer?.notes || "",
      code: customer?.code || "",
    });
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      setSaving(true);
      setFormError(null);
      // Empty client number = no number (null clears it on the server)
      const error = await onSubmit({ ...formData, code: formData.code.trim() || null });
      if (error) {
        setFormError(error);
        setSaving(false);
      }
    };

    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onCancel();
          }
        }}
      >
        <div
          className="bg-white dark:bg-gray-800 overflow-auto rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] h-full  border border-gray-200 dark:border-gray-700 animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-br from-cyan-600 via-cyan-600 to-cyan-700 dark:from-cyan-700 dark:via-cyan-700 dark:to-cyan-800 p-5  rounded-t-3xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -mr-32 -mt-32" />
            <div className="flex justify-between items-center">
              <h3 className="text-2xl font-bold text-white flex items-center">
                <User className="w-6 h-6 mr-2" />
                {customer
                  ? t("customers.editCustomer")
                  : t("customers.newCustomer")}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancel();
                }}
                className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors z-10 relative"
                aria-label={t("common.close")}
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                {t("customers.basicInfo")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("customers.name")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                    placeholder={t("customers.nameExample")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("customers.customerType")} *
                  </label>
                  <select
                    value={formData.customer_type}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customer_type: e.target.value,
                      })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                  >
                    <option value="retail">
                      {t("customers.customerTypeRetailBilingual")}
                    </option>
                    <option value="wholesale">
                      {t("customers.customerTypeWholesaleBilingual")}
                    </option>
                    <option value="commercial">
                      {t("customers.customerTypeCommercialBilingual")}
                    </option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="customer-code"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    {t("customers.code")}
                  </label>
                  <div className="relative">
                    <Hash className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      id="customer-code"
                      type="text"
                      maxLength={50}
                      autoComplete="off"
                      value={formData.code}
                      aria-invalid={formError?.field === "code"}
                      onChange={(e) => {
                        setFormData({ ...formData, code: e.target.value });
                        if (formError?.field === "code") setFormError(null);
                      }}
                      className={`w-full ps-9 pe-4 py-2.5 border rounded-lg font-mono focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-white transition-all ${
                        formError?.field === "code"
                          ? "border-red-400 focus:ring-red-500"
                          : "border-gray-300 dark:border-gray-600 focus:ring-cyan-500"
                      }`}
                      placeholder={t("customers.codePlaceholder")}
                    />
                  </div>
                  <p
                    className={`mt-1.5 text-xs ${
                      formError?.field === "code"
                        ? "font-semibold text-red-600 dark:text-red-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {formError?.field === "code" ? formError.message : t("customers.codeHint")}
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                {t("customers.contactDetails")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("customers.email")}
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                    placeholder={t("customers.emailPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("customers.phone")}
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                    placeholder={t("customers.phonePlaceholder")}
                  />
                </div>
              </div>
            </div>

            {/* Address Info */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                {t("customers.addressInfo")}
              </h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t("customers.fullAddress")}
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                    placeholder={t("customers.addressPlaceholder")}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("customers.city")}
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                      placeholder={t("customers.cityExample")}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("customers.postalCode")}
                    </label>
                    <input
                      type="text"
                      value={formData.postal_code}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          postal_code: e.target.value,
                        })
                      }
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                      placeholder={t("customers.postalCodePlaceholder")}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Info */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
                {t("customers.financialInfo")}
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t("customers.creditLimit")}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.credit_limit}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      credit_limit: Number.parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                  placeholder="5000.00"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("customers.notes")}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows="3"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white transition-all"
                placeholder={t("customers.notesAdditionalPlaceholder")}
              />
            </div>

            {formError && formError.field !== "code" && (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {formError.message}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 -mx-6  px-6  rounded-b-3xl">
              <button
                type="button"
                onClick={onCancel}
                className="px-6 py-2.5 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 font-medium"
              >
                {t("customers.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-xl transition-all duration-300 font-semibold transform hover:-translate-y-0.5 disabled:opacity-60 disabled:transform-none"
              >
                {customer ? t("customers.update") : t("customers.addCustomer")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-cyan-200 dark:border-cyan-900" />
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-cyan-600 absolute top-0 left-0" />
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-medium">
          {t("customers.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white tracking-tight">
                {t("customers.title")}
              </h1>
              
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-6 py-3.5 bg-gradient-to-r from-cyan-600 via-cyan-500 to-cyan-600 hover:from-cyan-700 hover:via-cyan-600 hover:to-cyan-700 text-white rounded-xl flex items-center space-x-2 transition-all duration-300  transform hover:-translate-y-0.5 font-medium"
        >
          <Plus className="w-5 h-5" />
          <span>{t("customers.newCustomer")}</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="group relative bg-gradient-to-br from-cyan-500 via-cyan-500 to-cyan-600 p-6 rounded-2xl shadow-xl text-white overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-cyan-100 text-sm font-semibold uppercase tracking-wide mb-1">
                {t("customers.totalCustomers")}
              </p>
              <p className="text-4xl font-bold mt-2 drop-shadow-lg">
                {statsData.totalCustomers}
              </p>
            </div>
            <div className="w-16 h-16 bg-white bg-opacity-25 rounded-2xl flex items-center justify-center backdrop-blur-sm transform group-hover:rotate-12 transition-transform duration-300">
              <Users className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-emerald-500 via-green-500 to-emerald-600 p-6 rounded-2xl shadow-xl text-white overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wide mb-1">
                {t("customers.totalRevenue")}
              </p>
              <p className="text-2xl font-bold mt-2 drop-shadow-lg">
                {formatCurrency(statsData.totalRevenue)}
              </p>
            </div>
            <div className="w-16 h-16 bg-white bg-opacity-25 rounded-2xl flex items-center justify-center backdrop-blur-sm transform group-hover:rotate-12 transition-transform duration-300">
              <DollarSign className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 p-6 rounded-2xl shadow-xl text-white overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm font-semibold uppercase tracking-wide mb-1">
                {t("customers.pending")}
              </p>
              <p className="text-2xl font-bold mt-2 drop-shadow-lg">
                {formatCurrency(statsData.totalPending)}
              </p>
            </div>
            <div className="w-16 h-16 bg-white bg-opacity-25 rounded-2xl flex items-center justify-center backdrop-blur-sm transform group-hover:rotate-12 transition-transform duration-300">
              <Clock className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="group relative bg-gradient-to-br from-violet-500 via-purple-500 to-violet-600 p-6 rounded-2xl shadow-xl text-white overflow-hidden transform transition-all duration-300 hover:scale-105 hover:shadow-2xl">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full -ml-12 -mb-12" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-violet-100 text-sm font-semibold uppercase tracking-wide mb-1">
                {t("customers.averagePerCustomer")}
              </p>
              <p className="text-2xl font-bold mt-2 drop-shadow-lg">
                {formatCurrency(statsData.avgPerCustomer)}
              </p>
            </div>
            <div className="w-16 h-16 bg-white bg-opacity-25 rounded-2xl flex items-center justify-center backdrop-blur-sm transform group-hover:rotate-12 transition-transform duration-300">
              <TrendingUp className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder={t("customers.searchPlaceholderDetailed")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          <div className="sm:w-64 relative">
            <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all appearance-none cursor-pointer"
            >
              <option value="">{t("customers.allTypes")}</option>
              <option value="retail">
                {t("customers.customerTypeRetailBilingual")}
              </option>
              <option value="wholesale">
                {t("customers.customerTypeWholesaleBilingual")}
              </option>
              <option value="commercial">
                {t("customers.customerTypeCommercialBilingual")}
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers.map((customer) => {
          const balance = calculateBalance(customer);
          const accountState = getAccountState(customer);
          const accountStyle = ACCOUNT_STYLES[accountState];
          return (
            <div
              key={customer.id}
              className="group bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-200 dark:border-gray-700 transform hover:-translate-y-1"
            >
              {/* Card Header */}
              <div className="relative bg-gradient-to-br from-cyan-50 via-blue-50 to-cyan-100 dark:from-gray-700 dark:via-gray-700 dark:to-gray-800 p-6 border-b border-gray-200 dark:border-gray-600">
                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-200 dark:bg-cyan-900 opacity-20 rounded-full -mr-12 -mt-12" />
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="relative">
                      <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-lg transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                        {customer.name}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {customer.code && (
                          <span
                            dir="ltr"
                            className="inline-flex items-baseline gap-1 rounded-lg bg-gray-900 px-2 py-1 font-mono text-xs font-bold tabular-nums text-white dark:bg-white dark:text-gray-900"
                            title={t("customers.code")}
                            aria-label={`${t("customers.code")} ${customer.code}`}
                          >
                            <span className="text-[10px] font-semibold opacity-70">N°</span>
                            {customer.code}
                          </span>
                        )}
                        <span
                          className={`inline-block px-3 py-1 rounded-lg text-xs font-semibold ${getCustomerTypeColor(customer.customer_type)}`}
                        >
                          {getCustomerTypeLabel(customer.customer_type)}
                        </span>
                        {accountStyle.badgeKey && (
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${accountStyle.badge}`}
                          >
                            {t(accountStyle.badgeKey)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-6 space-y-5">
                {/* Contact Info */}
                <div className="space-y-3">
                  {customer.email && (
                    <div className="flex items-center text-sm text-gray-700 dark:text-gray-300 group/item">
                      <div className="p-2 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg mr-3">
                        <Mail className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <span className="truncate font-medium">
                        {customer.email}
                      </span>
                    </div>
                  )}
                  {customer.phone && (
                    <div className="flex items-center text-sm text-gray-700 dark:text-gray-300 group/item">
                      <div className="p-2 bg-green-50 dark:bg-green-900/30 rounded-lg mr-3">
                        <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <span className="font-medium">{customer.phone}</span>
                    </div>
                  )}
                  {customer.city && (
                    <div className="flex items-center text-sm text-gray-700 dark:text-gray-300 group/item">
                      <div className="p-2 bg-orange-50 dark:bg-orange-900/30 rounded-lg mr-3">
                        <MapPin className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="font-medium">{customer.city}</span>
                    </div>
                  )}
                </div>

                {/* Till (QR sale) totals */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Receipt className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                        {t("customers.tillSpent")}
                      </p>
                      <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                        {Number(customer.purchases_count) > 0
                          ? customer.last_purchase
                            ? `${t("customers.tillPurchases", { count: Number(customer.purchases_count) })} · ${t(
                                "customers.lastPurchase",
                                { date: formatShortDate(customer.last_purchase) },
                              )}`
                            : t("customers.tillPurchases", { count: Number(customer.purchases_count) })
                          : t("customers.noPurchase")}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(customer.total_spent || 0)}
                  </span>
                </div>

                {/* Financial Summary */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 p-5 rounded-xl space-y-3 border border-gray-200 dark:border-gray-600">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {t("customers.totalPurchases")}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white text-sm">
                      {formatCurrency(getTotalPurchases(customer))}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {t("customers.paid")}
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                      {formatCurrency(getTotalPaid(customer))}
                    </span>
                  </div>
                  <div className="pt-3 border-t-2 border-gray-200 dark:border-gray-600">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t(accountStyle.labelKey)}
                      </span>
                      <span className={`font-bold text-base tabular-nums ${accountStyle.amount}`}>
                        {formatCurrency(Math.abs(balance))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Actions */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  {t("customers.details")}
                </button>
                <button
                  onClick={() => setEditingCustomer(customer)}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md"
                  title={t("customers.edit")}
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCustomer(customer.id)}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md"
                  title={t("customers.delete")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {customers.length === 0 && (
        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full mb-6">
            <Users className="w-10 h-10 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {t("customers.noCustomersFound")}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            {searchTerm || typeFilter
              ? t("customers.noCustomersFoundMessage")
              : t("customers.noCustomersStartMessage")}
          </p>
          {!searchTerm && !typeFilter && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 inline-flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>{t("customers.addCustomer")}</span>
            </button>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddForm && (
        <CustomerForm
          onSubmit={handleAddCustomer}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingCustomer && (
        <CustomerForm
          customer={editingCustomer}
          onSubmit={handleEditCustomer}
          onCancel={() => setEditingCustomer(null)}
        />
      )}
    </div>
  );
};

export default Customers;
