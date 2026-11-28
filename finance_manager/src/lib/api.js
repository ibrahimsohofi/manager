// Finance API client. Every call goes through the Vite /api proxy (server on 127.0.0.1:3002).
// The PIN session token lives in sessionStorage: it survives a reload of the tab, not a new browser.
// A 401 LOCKED answer (idle timeout, PIN changed elsewhere) notifies the session context.

const TOKEN_KEY = "finance.token";

let token = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch {
  token = null;
}

const lockListeners = new Set();

export const getToken = () => token;

export const setToken = (value) => {
  token = value || null;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: keep it in memory only */
  }
};

/** Called with no argument when the API says the session is locked. Returns an unsubscribe function. */
export const onLocked = (listener) => {
  lockListeners.add(listener);
  return () => lockListeners.delete(listener);
};

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{status: number, code?: string, body?: object}} info
   */
  constructor(message, { status, code, body }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? (status === 0 ? "NETWORK" : `HTTP_${status}`);
    this.body = body ?? {};
  }

  /** The API process is not answering (Vite proxy error or no network). */
  get isApiDown() {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

const buildUrl = (path, params) => {
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
};

const request = async (method, path, { params, body, signal } = {}) => {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("API unreachable", { status: 0 });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // The Vite proxy answers 500 with an HTML / empty body when the API process is down.
    const proxyFailure = response.status === 500 && (data === null || data.code === undefined);
    const status = proxyFailure ? 502 : response.status;
    const error = new ApiError(data?.error || response.statusText || "Request failed", {
      status,
      code: data?.code,
      body: data ?? {},
    });
    if (status === 401 && data?.code === "LOCKED") {
      setToken(null);
      for (const listener of lockListeners) listener();
    }
    throw error;
  }
  return data;
};

export const api = {
  get: (path, params, options = {}) => request("GET", path, { ...options, params }),
  post: (path, body, options = {}) => request("POST", path, { ...options, body: body ?? {} }),
  put: (path, body, options = {}) => request("PUT", path, { ...options, body: body ?? {} }),
  del: (path, options = {}) => request("DELETE", path, options),
};

// ---------- Typed helpers (FINANCE_PLAN.md §7, server/routes/*.js) ----------

export const sessionApi = {
  status: () => api.get("/session"),
  setup: (pin) => api.post("/session/setup", { pin }),
  unlock: (pin) => api.post("/session/unlock", { pin }),
  lock: () => api.post("/session/lock"),
  changePin: (currentPin, newPin) => api.put("/session/pin", { current_pin: currentPin, new_pin: newPin }),
};

export const financeApi = {
  health: () => api.get("/health"),
  salesStatus: (refresh = false) => api.get("/finance/sales-status", refresh ? { refresh: 1 } : undefined),
  summary: (period, options) => api.get("/finance/summary", { period }, options),
  monthly: (year, options) => api.get("/finance/monthly", { year }, options),
  yearly: (options) => api.get("/finance/yearly", undefined, options),
  daily: (period, options) => api.get("/finance/daily", { period }, options),
  expensesByCategory: (period, options) => api.get("/finance/expenses-by-category", { period }, options),
  // `paging` / `flags` may be omitted (undefined) while still passing `options` after them.
  unknownCostLines: (period, paging, options) => {
    const { page, limit } = paging ?? {};
    return api.get("/finance/unknown-cost-lines", { period, page, limit }, options);
  },
  // Stock & purchases (§8.1): the finance API reads products_manager GET /api/stats* for us.
  stock: (period, flags, options) =>
    api.get("/finance/stock", { period, refresh: flags?.refresh ? 1 : undefined }, options),
  stockSpending: (year, options) => api.get("/finance/stock/spending", { year }, options),
  stockSpendingEntries: ({ year, month, source, page, limit }, options) =>
    api.get("/finance/stock/spending/entries", { year, month, source, page, limit }, options),
};

export const expensesApi = {
  list: (filters, options) => api.get("/expenses", filters, options),
  get: (id) => api.get(`/expenses/${id}`),
  create: (body) => api.post("/expenses", body),
  update: (id, body) => api.put(`/expenses/${id}`, body),
  pay: (id, body) => api.put(`/expenses/${id}/pay`, body),
  remove: (id) => api.del(`/expenses/${id}`),
  restore: (id) => api.put(`/expenses/${id}/restore`),
  pending: (limit) => api.get("/expenses/pending", { limit }),
};

export const categoriesApi = {
  list: (includeArchived = false) =>
    api.get("/expenses/categories", includeArchived ? { archived: 1 } : undefined),
  create: (body) => api.post("/expenses/categories", body),
  update: (id, body) => api.put(`/expenses/categories/${id}`, body),
  remove: (id) => api.del(`/expenses/categories/${id}`),
};

export const settingsApi = {
  get: () => api.get("/settings"),
  update: (body) => api.put("/settings", body),
};
