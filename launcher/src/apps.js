// The three SOHOFI BRICO apps. Each one runs its own Vite dev server on a fixed port (see its vite.config).
// By default the URL reuses the hostname the launcher was opened with, so it also works from another
// device on the shop network (e.g. http://192.168.1.20:5170 -> http://192.168.1.20:5174).
// Override per app with VITE_PRODUCTS_URL / VITE_SALES_URL / VITE_FINANCE_URL in launcher/.env.
// `apiPort` is informational only (help panel): each app's `bun run dev` starts its page and its API.

const { protocol, hostname } = window.location;
// Hosted previews put the port in the subdomain ("5170-abc.preview.host") instead of after ":".
const portSubdomain = /^\d{2,5}-(.+)$/.exec(hostname);

function appUrl(override, port) {
  if (override) return override.replace(/\/+$/, "");
  const scheme = protocol === "https:" ? "https:" : "http:";
  if (portSubdomain) return `${scheme}//${port}-${portSubdomain[1]}`;
  return `${scheme}//${hostname || "localhost"}:${port}`;
}

export const APPS = [
  {
    id: "products",
    digit: 1,
    port: 5173,
    apiPort: 5000,
    folder: "products_manager",
    url: appUrl(import.meta.env.VITE_PRODUCTS_URL, 5173),
  },
  {
    id: "sales",
    digit: 2,
    port: 5174,
    apiPort: 3001,
    folder: "sales_manager",
    url: appUrl(import.meta.env.VITE_SALES_URL, 5174),
  },
  {
    id: "finance",
    digit: 3,
    port: 5175,
    apiPort: 3002,
    folder: "finance_manager",
    url: appUrl(import.meta.env.VITE_FINANCE_URL, 5175),
  },
];
