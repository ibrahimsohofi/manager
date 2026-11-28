// Client field helpers for the frontend (till, receipt, client pages).
// Parsing rules come from the server so both sides always agree on what a typed text means.
import {
  isAutoCustomerName,
  numericCodeValue,
  parseCustomerLabel,
} from "../../server/utils/customerLabel.js";

export { isAutoCustomerName, numericCodeValue, parseCustomerLabel };

// Text shown on the receipt / success screen:
//   auto-named client          -> "N° 009"
//   named client with a number -> "Ahmed (N° 12)"
//   named client               -> "Ahmed"
export const customerDisplay = (customer) => {
  if (!customer) return "";
  const name = String(customer.name || "").trim();
  const code = String(customer.code || "").trim();
  if (!code) return name;
  if (!name || isAutoCustomerName(name, code)) return `N° ${code}`;
  return `${name} (N° ${code})`;
};

// Same client number? "9", "009" and "N° 9" are equal; other codes compare exactly.
export const sameClientNumber = (a, b) => {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left || !right) return false;
  if (left.toLowerCase() === right.toLowerCase()) return true;
  const leftNumber = numericCodeValue(left);
  return leftNumber !== null && leftNumber === numericCodeValue(right);
};

// Does the typed text point exactly at this customer (number, name or ID)?
export const isExactCustomerMatch = (customer, text) => {
  if (!customer) return false;
  const query = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!query) return false;
  const parsed = parseCustomerLabel(query);
  if (parsed?.kind === "code" && sameClientNumber(customer.code, parsed.code)) return true;
  if (String(customer.name || "").toLowerCase() === query.toLowerCase()) return true;
  return /^#\d+$/.test(query) && String(customer.id) === query.slice(1);
};
