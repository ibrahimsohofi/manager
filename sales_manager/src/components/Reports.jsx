import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const Reports = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0], // 30 days ago
    endDate: new Date().toISOString().split("T")[0], // today
  });
  const [salesData, setSalesData] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalSales: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    topCategories: [],
    topProducts: [],
    salesByDay: [],
    customerAnalytics: {},
    productAnalytics: {},
  });

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch sales data for the date range
      const salesResponse = await fetch(
        `http://localhost:3001/api/sales?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`,
      );
      if (!salesResponse.ok) throw new Error("Failed to fetch sales data");
      const sales = await salesResponse.json();
      setSalesData(sales);

      // Calculate analytics
      const totalRevenue = sales.reduce(
        (sum, sale) => sum + (Number(sale.totalPrice) || 0),
        0,
      );
      const totalSales = sales.length;
      const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

      // Top categories
      const categoryTotals = {};
      for (const sale of sales) {
        const category = sale.category || t("common.uncategorized");
        categoryTotals[category] =
          (categoryTotals[category] || 0) + (Number(sale.totalPrice) || 0);
      }
      const topCategories = Object.entries(categoryTotals)
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Top products
      const productTotals = {};
      for (const sale of sales) {
        const product = sale.productName || t("common.unknown");
        if (!productTotals[product]) {
          productTotals[product] = { name: product, quantity: 0, revenue: 0 };
        }
        productTotals[product].quantity += sale.quantity || 0;
        productTotals[product].revenue += Number(sale.totalPrice) || 0;
      }
      const topProducts = Object.values(productTotals)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Sales by day
      const dailySales = {};
      for (const sale of sales) {
        const date = sale.date
          ? sale.date.split("T")[0]
          : new Date().toISOString().split("T")[0];
        if (!dailySales[date]) {
          dailySales[date] = { date, sales: 0, revenue: 0 };
        }
        dailySales[date].sales += 1;
        dailySales[date].revenue += Number(sale.totalPrice) || 0;
      }
      const salesByDay = Object.values(dailySales).sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );

      setAnalytics({
        totalSales,
        totalRevenue,
        averageOrderValue,
        topCategories,
        topProducts,
        salesByDay,
      });
    } catch (error) {
      console.error("Error fetching report data:", error);
      setError("Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDate, dateRange.endDate, t]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) {
      alert(t("common.noDataToExport"));
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            // Escape commas and quotes in values
            if (
              typeof value === "string" &&
              (value.includes(",") || value.includes('"'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "MAD",
    }).format(amount);
  };

  const StatCard = ({ title, value, subtitle, color = "blue" }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <div className="flex items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p
            className={`text-3xl font-bold text-${color}-600 dark:text-${color}-400`}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t("reportsPage.title")}
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => exportToCSV(salesData, "sales_report")}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            {t("reportsPage.exportCSV")}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Date Range Filter */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t("reportsPage.dateRange")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("reportsPage.startDate")}
            </label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, startDate: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("reportsPage.endDate")}
            </label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) =>
                setDateRange({ ...dateRange, endDate: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title={t("reportsPage.totalSalesLabel")}
          value={analytics.totalSales.toLocaleString()}
          subtitle={t("reportsPage.transactionsCount")}
          color="blue"
        />
        <StatCard
          title={t("reportsPage.totalRevenueLabel")}
          value={formatCurrency(analytics.totalRevenue)}
          subtitle={t("reportsPage.grossSales")}
          color="green"
        />
        <StatCard
          title={t("reportsPage.averageOrderValue")}
          value={formatCurrency(analytics.averageOrderValue)}
          subtitle={t("reportsPage.perTransaction")}
          color="purple"
        />
      </div>

      {/* Charts and Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("reportsPage.topCategories")}
            </h3>
            <button
              onClick={() =>
                exportToCSV(analytics.topCategories, "top_categories")
              }
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {t("reportsPage.export")}
            </button>
          </div>
          <div className="space-y-3">
            {analytics.topCategories.map((category, index) => (
              <div
                key={category.category}
                className="flex items-center justify-between"
              >
                <div className="flex items-center space-x-3">
                  <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center text-xs font-semibold">
                    {index + 1}
                  </span>
                  <span className="text-gray-900 dark:text-white">
                    {category.category}
                  </span>
                </div>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(category.revenue)}
                </span>
              </div>
            ))}
          </div>
          {analytics.topCategories.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              {t("reportsPage.noDataAvailable")}
            </p>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t("reportsPage.topProducts")}
            </h3>
            <button
              onClick={() => exportToCSV(analytics.topProducts, "top_products")}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              {t("reportsPage.export")}
            </button>
          </div>
          <div className="space-y-3">
            {analytics.topProducts.map((product, index) => (
              <div
                key={product.name}
                className="border-b border-gray-200 dark:border-gray-700 pb-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {product.name}
                    </span>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(product.revenue)}
                  </span>
                </div>
                <div className="ml-9 text-sm text-gray-500 dark:text-gray-400">
                  {t("reportsPage.quantitySold")} {product.quantity}
                </div>
              </div>
            ))}
          </div>
          {analytics.topProducts.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              {t("reportsPage.noDataAvailable")}
            </p>
          )}
        </div>
      </div>

      {/* Sales Timeline */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t("reportsPage.dailySalesTrend")}
          </h3>
          <button
            onClick={() => exportToCSV(analytics.salesByDay, "daily_sales")}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {t("reportsPage.export")}
          </button>
        </div>

        {analytics.salesByDay.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("reportsPage.date")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("reportsPage.transactions")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t("reportsPage.revenue")}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {analytics.salesByDay.map((day) => (
                  <tr key={day.date}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(day.date).toLocaleDateString("fr-Fr")}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {day.sales}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatCurrency(day.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            {t("reportsPage.noSalesData")}
          </p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {t("reportsPage.quickReports")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              setDateRange({ startDate: today, endDate: today });
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            {t("reportsPage.todaySales")}
          </button>
          <button
            onClick={() => {
              const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0];
              const today = new Date().toISOString().split("T")[0];
              setDateRange({ startDate: lastWeek, endDate: today });
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
          >
            {t("reportsPage.last7Days")}
          </button>
          <button
            onClick={() => {
              const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0];
              const today = new Date().toISOString().split("T")[0];
              setDateRange({ startDate: lastMonth, endDate: today });
            }}
            className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
          >
            {t("reportsPage.last30Days")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reports;
