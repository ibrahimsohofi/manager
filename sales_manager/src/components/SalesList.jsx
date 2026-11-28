import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";
import { SALES_MANAGER_API } from "../config/integration.js";
import LogoLoader from "./LogoLoader";
import { Pagination } from "./ui/Pagination";

const SALES_API = `${SALES_MANAGER_API.BASE_URL}/api/sales`;
const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;
// The logo overlay only shows when a page takes longer than this (no flash on fast loads)
const OVERLAY_DELAY_MS = 300;

const pad = (n) => String(n).padStart(2, "0");

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
};

// "2026-11" -> ["2026-11-01", "2026-11-30"] (both included, for the Excel export)
const monthBounds = (month) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return [`${month}-01`, `${month}-${pad(lastDay)}`];
};

const formatMonth = (month, locale) => {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Date(year, monthNumber - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

// Current month when it has sales, otherwise the newest month that has some
const pickDefaultMonth = (months) => {
  const now = currentMonth();
  if (months.some((item) => item.month === now)) return now;
  return months[0]?.month ?? now;
};


const SalesList = ({ onEditSale }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "ar" ? "ar-MA" : "fr-FR";

  // Filters
  const [months, setMonths] = useState([]);
  const [categories, setCategories] = useState([]);
  const [month, setMonth] = useState(null); // null = not picked yet, "" = all months
  const [dateFilter, setDateFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Data
  const [data, setData] = useState(null); // { items, page, pageSize, total, totalPages, summary }
  const [refreshing, setRefreshing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const tableTopRef = useRef(null);

  const loadMonths = useCallback(async (signal) => {
    const response = await fetch(`${SALES_API}/months`, { signal });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const list = await response.json();
    const safeList = Array.isArray(list)
      ? list.filter((item) => item?.month)
      : [];
    setMonths(safeList);
    return safeList;
  }, []);

  // Months + categories first (both small), then the first page of the picked month
  useEffect(() => {
    const controller = new AbortController();

    loadMonths(controller.signal)
      .then((list) => setMonth((prev) => prev ?? pickDefaultMonth(list)))
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("Error fetching sales months:", error);
        setMonth((prev) => prev ?? currentMonth());
      });

    fetch(`${SALES_API}/categories`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((list) =>
        setCategories(
          Array.isArray(list)
            ? list.filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"))
            : [],
        ),
      )
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("Error fetching sales categories:", error);
      });

    return () => controller.abort();
  }, [loadMonths]);

  // Debounced search: one request when typing stops, not one per key
  useEffect(() => {
    const value = searchInput.trim();
    if (value === searchTerm) return;
    const timer = setTimeout(() => {
      setSearchTerm(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, searchTerm]);

  // One page of sales (+ totals of every matching sale) from the server
  useEffect(() => {
    if (month === null) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (month) params.set("month", month);
    if (dateFilter) params.set("date", dateFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (searchTerm) params.set("search", searchTerm);

    setRefreshing(true);

    fetch(`${SALES_API}/page?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((result) => {
        setData(result);
        setLoadError(false);
        // The server falls back to the last page when the asked one no longer exists
        if (result?.page && result.page !== page) {
          setPage(result.page);
        }
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        console.error("Error fetching sales:", error);
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false);
      });

    return () => controller.abort();
  }, [
    month,
    dateFilter,
    categoryFilter,
    searchTerm,
    page,
    pageSize,
    reloadKey,
  ]);

  useEffect(() => {
    if (!refreshing) {
      setShowOverlay(false);
      return;
    }
    const timer = setTimeout(() => setShowOverlay(true), OVERLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [refreshing]);

  // The picked month always has an option, even when it has no sales (e.g. picked through the date)
  const monthOptions = useMemo(() => {
    if (!month || months.some((item) => item.month === month)) return months;
    return [{ month, count: 0, revenue: 0 }, ...months].sort((a, b) =>
      b.month.localeCompare(a.month),
    );
  }, [months, month]);

  const handleMonthChange = (value) => {
    setMonth(value);
    if (dateFilter && !dateFilter.startsWith(value)) setDateFilter("");
    setPage(1);
  };

  const handleDateChange = (value) => {
    setDateFilter(value);
    if (value) setMonth(value.slice(0, 7));
    setPage(1);
  };

  const handleCategoryChange = (value) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value) => {
    setPageSize(Number(value) || DEFAULT_PAGE_SIZE);
    setPage(1);
  };

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    tableTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hasExtraFilters = Boolean(dateFilter || categoryFilter || searchInput);

  const clearFilters = () => {
    setDateFilter("");
    setCategoryFilter("");
    setSearchInput("");
    setSearchTerm("");
    setPage(1);
  };

  const retry = () => {
    setLoadError(false);
    setReloadKey((key) => key + 1);
  };

  const handleDelete = async (id) => {
    if (window.confirm(t("sales.confirmDelete"))) {
      try {
        const response = await fetch(`${SALES_API}/${id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Reload the page from the server so the totals stay right
        if (data?.items?.length === 1 && page > 1) {
          setPage((current) => current - 1);
        } else {
          setReloadKey((key) => key + 1);
        }
        // Month counts changed too (quiet refresh, the picked month stays)
        loadMonths().catch((error) =>
          console.error("Error refreshing sales months:", error),
        );
      } catch (error) {
        console.error("Error deleting sale:", error);
        alert(t("common.saleDeleteError"));
      }
    }
  };

  const handleExportAggregated = async () => {
    try {
      setExporting(true);

      // Build query params based on current filters (same period as the list)
      const params = new URLSearchParams();
      if (categoryFilter) params.append("category", categoryFilter);
      if (dateFilter) {
        params.append("startDate", dateFilter);
        params.append("endDate", dateFilter);
      } else if (month) {
        const [startDate, endDate] = monthBounds(month);
        params.append("startDate", startDate);
        params.append("endDate", endDate);
      }

      // Fetch aggregated data from database
      const response = await fetch(`${SALES_API}/aggregated?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const aggregatedData = await response.json();

      if (!aggregatedData || aggregatedData.length === 0) {
        alert("No data to export");
        return;
      }

      // Prepare data for Excel export with exact column names
      const excelData = aggregatedData.map((item) => ({
        product_id: item.product_id || "",
        product_name: item.product_name,
        category_name: item.category,
        number_of_all_sold_items: item.total_product_sold,
        price_unit: Number.parseFloat(item.price).toFixed(2),
        total_price: Number.parseFloat(item.total_prices).toFixed(2),
      }));

      // Create workbook and worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Aggregated Sales");

      // Auto-size columns
      const maxWidth = 50;
      const columnWidths = Object.keys(excelData[0]).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map((row) => String(row[key]).length),
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      worksheet["!cols"] = columnWidths;

      // Generate filename with current date
      const filename = `aggregated_sales_${new Date().toISOString().split("T")[0]}.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);

      console.log(`Exported ${aggregatedData.length} aggregated sales records`);
    } catch (error) {
      console.error("Error exporting aggregated sales:", error);
      alert("Failed to export aggregated sales. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // First load: the animated logo instead of a spinner
  if (!data && !loadError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="py-10">
          <LogoLoader width={420} label={t("salesList.loading")} />
        </div>
      </div>
    );
  }

  // First load failed: say so instead of an empty list
  if (!data && loadError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <p className="text-gray-700 dark:text-gray-300">
            {t("salesList.loadError")}
          </p>
          <button
            type="button"
            onClick={retry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            {t("salesList.retry")}
          </button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const summary = data?.summary ?? { count: 0, revenue: 0, quantity: 0 };
  const inputClass =
    "px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {t("salesList.title")}
        </h3>

        <div className="flex flex-col md:flex-row md:flex-wrap xl:justify-end gap-3 w-full xl:w-auto">
          <select
            value={month ?? ""}
            onChange={(e) => handleMonthChange(e.target.value)}
            className={inputClass}
            aria-label={t("salesList.month")}
          >
            <option value="">{t("salesList.allMonths")}</option>
            {monthOptions.map((item) => (
              <option key={item.month} value={item.month}>
                {`${formatMonth(item.month, locale)} (${t("salesList.salesCount", { count: item.count })})`}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder={t("salesList.searchProduct")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={inputClass}
          />

          <select
            value={categoryFilter}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className={inputClass}
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
            onChange={(e) => handleDateChange(e.target.value)}
            className={inputClass}
          />

          {hasExtraFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
            >
              {t("salesList.clearFilters")}
            </button>
          )}

          <button
            onClick={handleExportAggregated}
            disabled={exporting}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export Aggregated Sales to Excel"
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Refresh failed: keep the last rows, offer a retry */}
      {loadError && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          <span>{t("salesList.loadError")}</span>
          <button
            type="button"
            onClick={retry}
            className="self-start sm:self-auto px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            {t("salesList.retry")}
          </button>
        </div>
      )}

      {/* Summary Cards (every sale matching the filters, not only this page) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {t("dashboard.totalSales")}
          </h4>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {summary.count}
          </p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-green-600 dark:text-green-400">
            {t("dashboard.totalRevenue")}
          </h4>
          <p className="text-2xl font-bold text-green-900 dark:text-green-100">
            {(Number(summary.revenue) || 0).toFixed(2)} {t("currency")}
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-purple-600 dark:text-purple-400">
            {t("salesList.productsSold")}
          </h4>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {summary.quantity}
          </p>
        </div>
      </div>

      {/* Sales Table */}
      <div ref={tableTopRef} className="relative scroll-mt-4" aria-busy={refreshing}>
        {showOverlay && (
          <div className="absolute inset-0 z-10 flex items-start justify-center rounded-lg bg-white/75 pt-12 backdrop-blur-[1px] dark:bg-gray-800/75">
            <LogoLoader width={280} label={t("salesList.loading")} />
          </div>
        )}

        <div
          className={`overflow-x-auto transition-opacity ${refreshing ? "opacity-60" : ""}`}
        >
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
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="text-center py-8 text-gray-500 dark:text-gray-400"
                  >
                    {t("salesList.noSalesFound")}
                  </td>
                </tr>
              ) : (
                items.map((sale) => (
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

      {/* Footer: rows per page + page buttons */}
      <div className="mt-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 shrink-0">
          <span>{t("salesList.perPage")}</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(e.target.value)}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <Pagination
          className="flex-1"
          currentPage={data?.page ?? page}
          totalPages={data?.totalPages ?? 1}
          totalItems={data?.total ?? 0}
          itemsPerPage={data?.pageSize ?? pageSize}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
};

export default SalesList;
