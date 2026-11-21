import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const ProductForm = ({ product, onSave, onCancel, suppliers, categories }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    purchase_price: "",
    selling_price: "",
    stock_quantity: "",
    min_stock_level: "",
    supplier_id: "",
    image_url: "",
    sku: "",
    barcode: "",
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        description: product.description || "",
        category: product.category || "",
        purchase_price: product.purchase_price || "",
        selling_price: product.selling_price || "",
        stock_quantity: product.stock_quantity || "",
        min_stock_level: product.min_stock_level || "",
        supplier_id: product.supplier_id || "",
        image_url: product.image_url || "",
        sku: product.sku || "",
        barcode: product.barcode || "",
      });
    }
  }, [product]);

  // Calculate profit margin
  const profitMargin = formData.purchase_price && formData.selling_price
    ? (((Number.parseFloat(formData.selling_price) - Number.parseFloat(formData.purchase_price)) / Number.parseFloat(formData.purchase_price)) * 100).toFixed(2)
    : 0;

  const profitAmount = formData.purchase_price && formData.selling_price
    ? (Number.parseFloat(formData.selling_price) - Number.parseFloat(formData.purchase_price)).toFixed(2)
    : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleClear = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      purchase_price: "",
      selling_price: "",
      stock_quantity: "",
      min_stock_level: "",
      supplier_id: "",
      image_url: "",
      sku: "",
      barcode: "",
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {product ? t("inventory.editProduct") : t("inventory.addProduct")}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Product Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("inventory.productName")}
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder={t("inventory.productNamePlaceholder")}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("inventory.description")}
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder={t("inventory.descriptionPlaceholder")}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          {/* Category & Supplier Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.category")}
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("inventory.categoryPlaceholder")}</option>
                {categories?.map((cat) => (
                  <option key={cat.id || cat.category} value={cat.category}>
                    {cat.name || cat.category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.supplier")}
              </label>
              <select
                name="supplier_id"
                value={formData.supplier_id}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">{t("inventory.supplierPlaceholder")}</option>
                {suppliers?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Purchase Price & Selling Price Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.purchasePrice")}
              </label>
              <input
                type="number"
                name="purchase_price"
                value={formData.purchase_price}
                onChange={handleChange}
                placeholder={t("inventory.purchasePricePlaceholder")}
                step="0.01"
                min="0"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.sellingPrice")}
              </label>
              <input
                type="number"
                name="selling_price"
                value={formData.selling_price}
                onChange={handleChange}
                placeholder={t("inventory.sellingPricePlaceholder")}
                step="0.01"
                min="0"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Profit Margin Calculator */}
          {formData.purchase_price && formData.selling_price && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Profit Amount:</span>
                  <p className={`text-lg font-semibold ${Number.parseFloat(profitAmount) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {profitAmount} MAD
                  </p>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Profit Margin:</span>
                  <p className={`text-lg font-semibold ${Number.parseFloat(profitMargin) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {profitMargin}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Stock Quantity & Min Stock Level Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.quantity")}
              </label>
              <input
                type="number"
                name="stock_quantity"
                value={formData.stock_quantity}
                onChange={handleChange}
                placeholder={t("inventory.quantityPlaceholder")}
                min="0"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.minStock")}
              </label>
              <input
                type="number"
                name="min_stock_level"
                value={formData.min_stock_level}
                onChange={handleChange}
                placeholder={t("inventory.minStockPlaceholder")}
                min="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* SKU & Barcode Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.sku")}
              </label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                placeholder={t("inventory.skuPlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t("inventory.barcode")}
              </label>
              <input
                type="text"
                name="barcode"
                value={formData.barcode}
                onChange={handleChange}
                placeholder={t("inventory.barcodePlaceholder")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>

          {/* Image URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t("inventory.imageUrl")}
            </label>
            <input
              type="url"
              name="image_url"
              value={formData.image_url}
              onChange={handleChange}
              placeholder={t("inventory.imageUrlPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            />
            {/* Image Preview */}
            {formData.image_url && (
              <div className="mt-3 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Preview:</p>
                <img
                  src={formData.image_url}
                  alt="Product preview"
                  className="w-32 h-32 object-cover rounded-md border border-gray-200 dark:border-gray-600"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
                <p className="text-sm text-red-500 dark:text-red-400 mt-2" style={{display: 'none'}}>
                  ⚠️ Failed to load image
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4">
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Clear Form
            </button>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t("inventory.cancel")}
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {t("inventory.save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductForm;
