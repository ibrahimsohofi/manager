import React, { useEffect, useState } from "react";

const OutOfStock = () => {
  const [outOfStockProducts, setOutOfStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchOutOfStockProducts = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/outofstock`);
      const data = await response.json();
      setLoading(true);
      setOutOfStockProducts(data.data);
      setLoading(false);
    } catch (err) {
      console.log("Something wrong happend ", err);
    }
  };
  const getCategoryName = (categoryId) => {
    const categoryMap = {
      1: "Droguerie",
      2: "Sanitaire",
      3: "Peinture",
      4: "Quincaillerie",
      5: "Outillage",
      6: "Électricité",
      7: "Visserie et boulonnerie",
    };
    return categoryMap[categoryId] || "Autres";
  };
  useEffect(() => {
    fetchOutOfStockProducts();
  }, []);

  return (
    <div className="w-full">
      {loading ? (
        <div className="bg-white min-h-96 dark:bg-gray-800 rounded-lg shadow-lg p-6 items-center justify-center flex">
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </div>
      ) : (
        <table className="w-full border dark:border-gray-700 ">
          <thead className="w-full table-auto">
            <tr className="border-b border-gray-200 dark:border-gray-700 ">
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                ID
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                Nom du Produit
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                Categotie
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                Prix d'achat
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                Prix de vente
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">
                Image
              </th>
            </tr>
          </thead>

          <tbody>
            {outOfStockProducts.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="text-center py-8 text-gray-500 dark:text-gray-400"
                >
                  error
                </td>
              </tr>
            ) : (
              outOfStockProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {product.id}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                    {product.name}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200">
                      {getCategoryName(product.category_id)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {Number.parseFloat(product.purchase_price || 0).toFixed(2)}
                    MAD
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">
                    {product.selling_price}
                  </td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-semibold">
                    <img
                      src={product.image_url}
                      alt=""
                      className="rounded-sm h-18 w-12"
                    />
                    {}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default OutOfStock;
