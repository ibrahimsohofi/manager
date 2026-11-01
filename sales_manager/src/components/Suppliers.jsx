import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const Suppliers = () => {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
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

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const url = "http://localhost:3001/api/suppliers?";
      const params = new URLSearchParams();

      if (debouncedSearchTerm) params.append("search", debouncedSearchTerm);

      const response = await fetch(url + params.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setSuppliers(data);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      setError(t("suppliersPage.errorFetchSuppliers"));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, t]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3001/api/suppliers/top");
      if (response.ok) {
        const data = await response.json();
        setStats({ topSuppliers: data });
      }
    } catch (error) {
      console.error("Error fetching supplier stats:", error);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleAddSupplier = async (supplierData) => {
    try {
      const response = await fetch("http://localhost:3001/api/suppliers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(supplierData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setShowAddForm(false);
      fetchSuppliers();
    } catch (error) {
      console.error("Error adding supplier:", error);
      setError(t("suppliersPage.errorAddSupplier"));
    }
  };

  const handleEditSupplier = async (supplierData) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/suppliers/${editingSupplier.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(supplierData),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setEditingSupplier(null);
      fetchSuppliers();
    } catch (error) {
      console.error("Error updating supplier:", error);
      setError(t("suppliersPage.errorUpdateSupplier"));
    }
  };

  const handleDeleteSupplier = async (supplierId) => {
    if (!window.confirm(t("suppliersPage.confirmDeleteSupplier"))) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/suppliers/${supplierId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      fetchSuppliers();
    } catch (error) {
      console.error("Error deleting supplier:", error);
      setError(t("suppliersPage.errorDeleteSupplier"));
    }
  };

  const SupplierForm = ({ supplier, onSubmit, onCancel }) => {
    const [formData, setFormData] = useState({
      name: supplier?.name || "",
      contact_person: supplier?.contact_person || "",
      email: supplier?.email || "",
      phone: supplier?.phone || "",
      address: supplier?.address || "",
      city: supplier?.city || "",
      postal_code: supplier?.postal_code || "",
      payment_terms: supplier?.payment_terms || "Net 30",
      notes: supplier?.notes || "",
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSubmit(formData);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
            {supplier
              ? t("suppliersPage.editSupplierTitle")
              : t("suppliersPage.addSupplierTitle")}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.companyName")} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.companyNamePlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.contactPerson")}
                </label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) =>
                    setFormData({ ...formData, contact_person: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.contactPersonPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.email")}
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.emailPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.phone")}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.phonePlaceholder")}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("suppliersPage.form.address")}
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder={t("suppliersPage.form.addressPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.city")}
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.cityPlaceholder")}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t("suppliersPage.form.postalCode")}
                </label>
                <input
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) =>
                    setFormData({ ...formData, postal_code: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder={t("suppliersPage.form.postalCodePlaceholder")}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("suppliersPage.form.paymentTerms")}
              </label>
              <select
                value={formData.payment_terms}
                onChange={(e) =>
                  setFormData({ ...formData, payment_terms: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="Net 15">
                  {t("suppliersPage.paymentTerms.net15")}
                </option>
                <option value="Net 30">
                  {t("suppliersPage.paymentTerms.net30")}
                </option>
                <option value="Net 45">
                  {t("suppliersPage.paymentTerms.net45")}
                </option>
                <option value="Net 60">
                  {t("suppliersPage.paymentTerms.net60")}
                </option>
                <option value="COD">
                  {t("suppliersPage.paymentTerms.cod")}
                </option>
                <option value="Prepaid">
                  {t("suppliersPage.paymentTerms.prepaid")}
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t("suppliersPage.form.notes")}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder={t("suppliersPage.form.notesPlaceholder")}
              />
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500"
              >
                {t("suppliersPage.form.cancel")}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                {supplier
                  ? t("suppliersPage.form.updateSupplier")
                  : t("suppliersPage.form.addSupplier")}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

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
          {t("suppliersPage.title")}
        </h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center space-x-2"
        >
          <span>+</span>
          <span>{t("suppliersPage.addSupplierButton")}</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("suppliersPage.searchLabel")}
            </label>
            <input
              type="text"
              placeholder={t("suppliersPage.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t("suppliersPage.totalSuppliers")}
            </label>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {suppliers.length}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t("suppliersPage.table.company")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t("suppliersPage.table.contact")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t("suppliersPage.table.location")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t("suppliersPage.table.paymentTerms")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t("suppliersPage.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {supplier.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {supplier.contact_person}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {supplier.email}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {supplier.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {supplier.city && `${supplier.city}, `}
                      {supplier.postal_code}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {supplier.address}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {t(
                        `suppliersPage.paymentTerms.${supplier.payment_terms.replace(/ /g, "").toLowerCase()}`,
                        { defaultValue: supplier.payment_terms },
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => setEditingSupplier(supplier)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                    >
                      {t("suppliersPage.table.edit")}
                    </button>
                    <button
                      onClick={() => handleDeleteSupplier(supplier.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      {t("suppliersPage.table.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {suppliers.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t("suppliersPage.noSuppliersFound")}
            {searchTerm && ` ${t("suppliersPage.noSuppliersSearchHint")}`}
          </div>
        )}
      </div>

      {showAddForm && (
        <SupplierForm
          onSubmit={handleAddSupplier}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {editingSupplier && (
        <SupplierForm
          supplier={editingSupplier}
          onSubmit={handleEditSupplier}
          onCancel={() => setEditingSupplier(null)}
        />
      )}
    </div>
  );
};

export default Suppliers;
