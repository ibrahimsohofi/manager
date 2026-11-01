import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";

const SalesList = ({ onEditSale }) => {
  const { t } = useTranslation();
  const [sales, setSales] = useState([]);
  const [filteredSales, setFilteredSales] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const categories = [
    "Outils manuels",
    "Outils électriques",
    "Quincaillerie",
    "Plomberie",
    "Électricité",
    "Peinture & Décoration",
    "Jardinage",
    "Ménage & Entretien",
    "Sécurité",
    "Autre",
  ];

  const filterSales = useCallback(() => {
    let filtered = [...sales];

    if (searchTerm) {
      filtered = filtered.filter((sale) =>
        sale.productName.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    if (categoryFilter) {
      filtered = filtered.filter((sale) => sale.category === categoryFilter);
    }

    if (dateFilter) {
      filtered = filtered.filter((sale) => sale.date === dateFilter);
    }

    setFilteredSales(filtered);
  }, [sales, searchTerm, categoryFilter, dateFilter]);

  useEffect(() => {
    fetchSales();
  }, []);

  useEffect(() => {
    filterSales();
  }, [filterSales]);

  const fetchSales = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/sales");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const salesData = await response.json();
      setSales(salesData);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching sales:", error);
      // Fallback to empty array if API fails
      setSales([]);
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t("sales.confirmDelete"))) {
      try {
        const response = await fetch(`http://localhost:3001/api/sales/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Remove from local state after successful deletion
        setSales((prev) => prev.filter((sale) => sale.id !== id));
      } catch (error) {
        console.error("Error deleting sale:", error);
        alert(t("common.saleDeleteError"));
      }
    }
  };

  const handleExportAggregated = async () => {
    try {
      setExporting(true);

      // Build query params based on current filters
      const params = new URLSearchParams();
      if (categoryFilter) params.append('category', categoryFilter);
      if (dateFilter) params.append('startDate', dateFilter);

      // Fetch aggregated data from database
      const response = await fetch(`http://localhost:3001/api/sales/aggregated?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const aggregatedData = await response.json();

      if (!aggregatedData || aggregatedData.length === 0) {
        alert('No data to export');
        return;
      }

      // Prepare data for Excel export with exact column names
      const excelData = aggregatedData.map(item => ({
        'product_id': item.product_id || '',
        'product_name': item.product_name,
        'category_name': item.category,
        'number_of_all_sold_items': item.total_product_sold,
        'price_unit': Number.parseFloat(item.price).toFixed(2),
        'total_price': Number.parseFloat(item.total_prices).toFixed(2)
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Aggregated Sales');

      // Auto-size columns
      const maxWidth = 50;
      const columnWidths = Object.keys(excelData[0]).map(key => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map(row => String(row[key]).length)
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      worksheet['!cols'] = columnWidths;

      // Generate filename with current date
      const filename = `aggregated_sales_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);

      console.log(`✅ Exported ${aggregatedData.length} aggregated sales records`);

    } catch (error) {
      console.error('Error exporting aggregated sales:', error);
      alert('Failed to export aggregated sales. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const getTotalRevenue = () => {
    const total = filteredSales.reduce((total, sale) => {
      const price = Number.parseFloat(sale.totalPrice) || 0;
      return total + price;
    }, 0);
    return total.toFixed(2);
  };

  const getTotalQuantity = () => {
    return filteredSales.reduce((total, sale) => {
      const quantity = Number.parseInt(sale.quantity) || 0;
      return total + quantity;
    }, 0);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 md:mb-0">
          {t("salesList.title")}
        </h3>

        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
          <input
            type="text"
            placeholder={t("salesList.searchProduct")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">{t("salesList.allCategories")}</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={handleExportAggregated}
            disabled={exporting}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export Aggregated Sales to Excel"
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {t("dashboard.totalSales")}
          </h4>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {filteredSales.length}
          </p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-green-600 dark:text-green-400">
            {t("dashboard.totalRevenue")}
          </h4>
          <p className="text-2xl font-bold text-green-900 dark:text-green-100">
            {getTotalRevenue()} {t("currency")}
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-purple-600 dark:text-purple-400">
            {t("salesList.productsSold")}
          </h4>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {getTotalQuantity()}
          </p>
        </div>
      </div>

      {/* Sales Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.date")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.product")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.category")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.price")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.quantity")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.total")}
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                {t("salesList.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="text-center py-8 text-gray-500 dark:text-gray-400"
                >
                  {t("salesList.noSalesFound")}
                </td>
              </tr>
            ) : (
              filteredSales.map((sale) => (
                <tr
                  key={sale.id}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {new Date(sale.date).toLocaleDateString("es-ES")}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                    {sale.productName}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                      {sale.category}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {Number.parseFloat(sale.price || 0).toFixed(2)}{" "}
                    {t("currency")}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {sale.quantity}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-semibold">
                    {Number.parseFloat(sale.totalPrice || 0).toFixed(2)}{" "}
                    {t("currency")}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEditSale(sale)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title={t("tooltips.edit")}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(sale.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        title={t("tooltips.delete")}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SalesList;
