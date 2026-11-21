// Laptop side of the phone scanner (PHONE_SCANNER_PLAN.md, chunk 5).
//
//   phone --POST /scan--> sales API --SSE "scan"--> this hook --onScan()--> QrSale
//   this hook --POST /result (status + cart summary)--> sales API --> phone
//
// The pairing code (token) is issued by the API, only to this PC (POST /pair), and kept in
// localStorage so the Vente QR page reconnects by itself after a reload.
import { useCallback, useEffect, useRef, useState } from "react";
import { SALES_MANAGER_API } from "../config/integration.js";

export const REMOTE_SCANNER_API = `${SALES_MANAGER_API.BASE_URL}/api/remote-scanner`;

const TOKEN_KEY = "salesManager.remoteScanner.token";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const RESULT_ATTEMPTS = 2;
const MAX_REMEMBERED_SCANS = 50;

const readToken = () => {
  try {
    const value = localStorage.getItem(TOKEN_KEY) || "";
    return TOKEN_RE.test(value) ? value : "";
  } catch {
    return "";
  }
};

const writeToken = (value) => {
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage disabled: the code only lives until the page is reloaded
  }
};

const request = async (path, { method = "GET", body } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${REMOTE_SCANNER_API}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
};

const isInvalidToken = ({ response, data }) =>
  response.status === 400 && data?.error === "invalid_token";

const parsePhones = (raw) => {
  try {
    const list = JSON.parse(raw)?.phones;
    if (!Array.isArray(list)) return [];
    return list
      .filter((phone) => phone && typeof phone.id === "string")
      .map((phone) => ({
        id: phone.id,
        name: String(phone.name || ""),
        connectedAt: phone.connectedAt || null,
        lastScanAt: phone.lastScanAt || null,
        scans: Number(phone.scans) || 0,
      }));
  } catch {
    return [];
  }
};

/** LAN addresses + HTTPS state, used to build the phone link (GET /info). */
export const fetchRemoteScannerInfo = async () => {
  const { response, data } = await request("/info");
  if (!response.ok || !data?.success) throw new Error(`info_${response.status}`);
  return {
    https: {
      enabled: Boolean(data.https?.enabled),
      port: Number(data.https?.port) || 3443,
      error: data.https?.error ? String(data.https.error) : null,
    },
    addresses: Array.isArray(data.addresses) ? data.addresses : [],
  };
};

/**
 * @param {object} options
 * @param {(code: string, meta: {phone: {id: string, name: string|null}}) => Promise<{status: string, ok: boolean, text?: string}>} options.onScan
 * @param {() => {lines: number, units: number, amount: number}} options.getCartSummary
 *
 * status: "unpaired" | "connecting" | "online" | "offline"
 * error:  null | "invalid" | "revoked" | "local_only" | "api_offline" | "pair_failed"
 */
export default function useRemoteScanner({ onScan, getCartSummary }) {
  const [token, setToken] = useState(readToken);
  const [status, setStatus] = useState(() => (readToken() ? "connecting" : "unpaired"));
  const [phones, setPhones] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [connectKey, setConnectKey] = useState(0);

  const tokenRef = useRef(token);
  const busyRef = useRef(false);
  const onScanRef = useRef(onScan);
  const summaryRef = useRef(getCartSummary);
  onScanRef.current = onScan;
  summaryRef.current = getCartSummary;

  // The ref changes at once (no render needed), so late events for an old code are ignored.
  const adopt = useCallback((next) => {
    tokenRef.current = next;
    writeToken(next);
    setToken(next);
    setPhones([]);
  }, []);

  // The server refused this code (revoked / unknown). Another tab may already hold a new one.
  const dropToken = useCallback(
    (old, reason) => {
      if (tokenRef.current !== old) return;
      const stored = readToken();
      if (stored && stored !== old) {
        adopt(stored);
        return;
      }
      adopt("");
      setError(reason);
    },
    [adopt],
  );

  // Keep every Vente QR tab on the same code.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== null && event.key !== TOKEN_KEY) return;
      const next = readToken();
      if (next === tokenRef.current) return;
      tokenRef.current = next;
      setToken(next);
      setPhones([]);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---------- live link (SSE /pc-stream) ----------
  // biome-ignore lint/correctness/useExhaustiveDependencies: connectKey re-runs the effect on purpose (reconnect()).
  useEffect(() => {
    if (!token) {
      setStatus("unpaired");
      setPhones([]);
      return undefined;
    }

    let disposed = false;
    let source = null;
    let retryTimer = null;
    let attempt = 0;
    const handled = new Set();

    const close = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const stop = (reason) => {
      disposed = true;
      clearTimeout(retryTimer);
      close();
      dropToken(token, reason);
    };

    const sendResult = async (body) => {
      for (let i = 0; i < RESULT_ATTEMPTS; i += 1) {
        try {
          const { response } = await request("/result", { method: "POST", body });
          // 4xx will not get better with a retry; the phone then shows "vérifiez l'écran".
          if (response.status < 500) return;
        } catch {
          // network hiccup: retry once
        }
      }
    };

    const handleScan = async (raw) => {
      let scan;
      try {
        scan = JSON.parse(raw);
      } catch {
        return;
      }
      const scanId = String(scan?.scanId || "");
      if (!scanId || handled.has(scanId)) return;
      handled.add(scanId);
      if (handled.size > MAX_REMEMBERED_SCANS) handled.delete(handled.values().next().value);

      const phone = {
        id: String(scan.phone?.id || ""),
        name: scan.phone?.name ? String(scan.phone.name) : null,
      };
      let result;
      try {
        result = await onScanRef.current?.(String(scan.code ?? ""), { phone });
      } catch {
        result = null;
      }
      if (!result || typeof result.status !== "string") {
        result = { status: "error", ok: false, text: "" };
      }
      let cart = null;
      try {
        cart = summaryRef.current?.() ?? null;
      } catch {
        cart = null;
      }
      if (disposed) return; // code replaced meanwhile: the server already told the phone
      await sendResult({
        t: token,
        scanId,
        status: result.status,
        ok: Boolean(result.ok),
        locked: result.status === "locked",
        text: String(result.text || ""),
        cart,
      });
    };

    const scheduleRetry = () => {
      if (disposed) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(open, delay);
    };

    // EventSource hides the HTTP status: ask /status whether the code is still valid.
    const probe = async () => {
      try {
        const result = await request(`/status?t=${encodeURIComponent(token)}`);
        if (disposed) return;
        if (isInvalidToken(result)) {
          stop("invalid");
          return;
        }
      } catch {
        // API unreachable: keep retrying
      }
      scheduleRetry();
    };

    function open() {
      if (disposed) return;
      retryTimer = null;
      close();
      const es = new EventSource(`${REMOTE_SCANNER_API}/pc-stream?t=${encodeURIComponent(token)}`);
      source = es;
      es.addEventListener("hello", (event) => {
        if (source !== es) return;
        attempt = 0;
        setStatus("online");
        setError(null);
        setPhones(parsePhones(event.data));
      });
      es.addEventListener("phones", (event) => {
        if (source === es) setPhones(parsePhones(event.data));
      });
      es.addEventListener("scan", (event) => {
        if (source === es) handleScan(event.data);
      });
      es.addEventListener("revoked", () => {
        if (source === es) stop("revoked");
      });
      // We handle reconnection ourselves (with the /status check), not the browser.
      es.onerror = () => {
        if (disposed || source !== es) return;
        close();
        setStatus("offline");
        setPhones([]);
        probe();
      };
    }

    // Network back: do not wait for the next backoff step.
    const onOnline = () => {
      if (disposed || source) return;
      clearTimeout(retryTimer);
      attempt = 0;
      open();
    };

    setStatus("connecting");
    open();
    window.addEventListener("online", onOnline);
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
      close();
    };
  }, [token, connectKey, dropToken]);

  // ---------- pairing ----------

  const issue = useCallback(async () => {
    try {
      const { response, data } = await request("/pair", { method: "POST" });
      const next = String(data?.token || "");
      if (response.ok && TOKEN_RE.test(next)) {
        setError(null);
        adopt(next);
        return true;
      }
      setError(response.status === 403 ? "local_only" : "pair_failed");
    } catch {
      setError("api_offline");
    }
    return false;
  }, [adopt]);

  /** Ask the API for a pairing code (first pairing). */
  const pair = useCallback(async () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      return await issue();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [issue]);

  /** "Nouveau code": revoke the current code (phones are disconnected), then pair again. */
  const renew = useCallback(async () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const old = tokenRef.current;
      if (old) {
        adopt(""); // stop listening first: our own stream must not report "replaced"
        try {
          const result = await request("/revoke", { method: "POST", body: { t: old } });
          if (!result.response.ok && !isInvalidToken(result)) throw new Error("revoke_failed");
        } catch {
          // The old code may still work on the phones: keep it rather than pretend it changed.
          adopt(old);
          setError("api_offline");
          return false;
        }
      }
      return await issue();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [adopt, issue]);

  /** Reconnect now (skips the current backoff delay). */
  const reconnect = useCallback(() => setConnectKey((key) => key + 1), []);

  return { token, status, phones, error, busy, pair, renew, reconnect };
}
