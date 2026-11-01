import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Edit,
  FileText,
  Mail,
  MapPin,
  Package,
  Phone,
  ShoppingBag,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

const CustomerDetails = () => {
  const { t } = useTranslation();
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (amount) => {
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

  const calculateBalance = (customer) => {
    const productsTotal = Number(customer.products_total) || 0;
    const totalPaid = Number(customer.total_paid) || 0;
    return productsTotal - totalPaid;
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

  const fetchCustomer = useCallback(async () => {
    try {
      setLoading(true);
      const url = `http://localhost:3001/api/customers/${customerId}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const customerData = await response.json();

      // Fetch totals
      try {
        const [paymentsRes, productsRes] = await Promise.all([
          fetch(
            `http://localhost:3001/api/customers/${customerId}/payments/total`,
          ),
          fetch(
            `http://localhost:3001/api/customers/${customerId}/products/total`,
          ),
        ]);

        const paymentsData = paymentsRes.ok
          ? await paymentsRes.json()
          : { total: customerData.total_paid || 0 };
        const productsData = productsRes.ok
          ? await productsRes.json()
          : { total: customerData.products_total || 0 };

        setCustomer({
          ...customerData,
          total_paid: paymentsData.total || customerData.total_paid || 0,
          products_total:
            productsData.total || customerData.products_total || 0,
        });
      } catch (err) {
        setCustomer({
          ...customerData,
          total_paid: customerData.total_paid || 0,
          products_total: customerData.products_total || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching customer:", error);
      navigate("/customers");
    } finally {
      setLoading(false);
    }
  }, [customerId, navigate]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

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

  if (!customer) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          {t("customers.noCustomersFound")}
        </p>
        <button
          onClick={() => navigate("/customers")}
          className="mt-4 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-medium transition-all"
        >
          {t("common.close")}
        </button>
      </div>
    );
  }

  const balance = calculateBalance(customer);
  const balancePercentage =
    customer.products_total > 0
      ? (customer.total_paid / customer.products_total) * 100
      : 0;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-br from-cyan-600 via-cyan-600 to-cyan-700 dark:from-cyan-700 dark:via-cyan-700 dark:to-cyan-800 p-6 rounded-3xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full -mr-32 -mt-32" />
        <div className="flex justify-between items-start relative z-10">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/customers")}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
              aria-label={t("common.close")}
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div className="w-16 h-16 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">{customer.name}</h2>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mt-2 ${getCustomerTypeColor(customer.customer_type)}`}
              >
                {getCustomerTypeLabel(customer.customer_type)}
              </span>
            </div>
          </div>
          <button
            onClick={() => navigate(`/customers?edit=${customer.id}`)}
            className="px-5 py-2.5 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-xl flex items-center space-x-2 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
          >
            <Edit className="w-4 h-4" />
            <span>{t("customers.edit")}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <Phone className="w-5 h-5 mr-2 text-cyan-600" />
            {t("customers.contactInfo")}
          </h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <Mail className="w-4 h-4 mr-3 mt-1 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("customers.email")}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {customer.email || "N/A"}
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <Phone className="w-4 h-4 mr-3 mt-1 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("customers.phone")}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {customer.phone || "N/A"}
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <MapPin className="w-4 h-4 mr-3 mt-1 text-gray-500" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("customers.address")}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {customer.address || "N/A"}
                  {customer.city && `, ${customer.city}`}
                  {customer.postal_code && ` ${customer.postal_code}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Summary */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-green-600" />
            {t("customers.financialSummary")}
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-600">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t("customers.totalPurchases")}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {formatCurrency(customer.products_total)}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-600">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t("customers.totalPaid")}
              </span>
              <span className="text-sm font-bold text-green-600">
                {formatCurrency(customer.total_paid)}
              </span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200 dark:border-gray-600">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t("customers.remainingBalance")}
              </span>
              <span
                className={`text-sm font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}
              >
                {formatCurrency(balance)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t("customers.creditLimitLabel")}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {formatCurrency(customer.credit_limit || 0)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="pt-3">
              <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>{t("customers.paymentProgress")}</span>
                <span>{balancePercentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(balancePercentage, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Purchase History */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ShoppingBag className="w-5 h-5 mr-2 text-orange-600" />
            {t("customers.purchaseHistory")}
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-600 rounded-lg">
              <div className="flex items-center">
                <Package className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t("customers.orderCount")}
                </span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                -
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-600 rounded-lg">
              <div className="flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t("customers.averageAmount")}
                </span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                -
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-600 rounded-lg">
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t("customers.lastOrder")}
                </span>
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                -
              </span>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-gray-600" />
            {t("customers.additionalInfo")}
          </h3>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {t("customers.creationDate")}
              </p>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {customer.created_at
                    ? new Date(customer.created_at).toLocaleDateString(
                        t("currency") === "د.م." ? "ar-MA" : "fr-FR",
                      )
                    : "N/A"}
                </p>
              </div>
            </div>
            {customer.notes && (
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t("customers.notes")}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 p-3 rounded-lg">
                  {customer.notes}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
        <button
          onClick={() => navigate(`/customers?edit=${customer.id}`)}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white rounded-xl flex items-center space-x-2 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
        >
          <Edit className="w-4 h-4" />
          <span>{t("customers.edit")}</span>
        </button>
        <button
          onClick={() => navigate(`/customers/${customer.id}/wishlist`)}
          className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-xl flex items-center space-x-2 transition-all duration-300 shadow-md hover:shadow-lg font-medium"
        >
          <ShoppingBag className="w-4 h-4" />
          <span>{t("customers.wishlistTitle")}</span>
        </button>
      </div>
    </div>
  );
};

export default CustomerDetails;
