// Turns an API error into a sentence for the user. Server codes (INVALID_AMOUNT, ALREADY_PAID...) have
// their own `errors.*` key; an unknown 4xx shows the server message, anything else a generic line.
import i18n from "../i18n";

export const errorMessage = (error) => {
  if (!error) return "";
  const code = error.code;
  // A known server code wins over "API down": e.g. 503 STOCK_UNAVAILABLE = the products API, not ours.
  if (code && i18n.exists(`errors.${code}`)) return i18n.t(`errors.${code}`);
  if (error.isApiDown) return i18n.t("errors.NETWORK");
  if (error.status >= 400 && error.status < 500 && error.message) return error.message;
  return i18n.t("errors.generic");
};
