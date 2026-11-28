export const validateSale = (req, res, next) => {
  const { date, productName, price, quantity, category } = req.body;

  const errors = [];

  if (!date) errors.push('Date is required');
  if (!productName || productName.trim().length === 0) errors.push('Product name is required');
  if (!price || price <= 0) errors.push('Price must be greater than 0');
  if (!quantity || quantity <= 0) errors.push('Quantity must be greater than 0');
  if (!category || category.trim().length === 0) errors.push('Category is required');

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};
