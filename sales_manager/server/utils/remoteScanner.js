// Remote (phone) scanner relay.
//
// The phone and the PC never talk directly: both talk to this server on the local network.
//   phone  --POST /scan-->  server  --SSE "scan"-->  Vente QR page (PC)
//   phone  <--HTTP reply--  server  <--POST /result--  Vente QR page (PC)
//   phone  <--SSE "result"--  server   (same answer, also when the HTTP reply timed out)
// No internet is needed: everything stays on the shop Wi-Fi / hotspot.
//
// Pairing codes (tokens) are created here with crypto.randomBytes and only their SHA-256
// hash is kept on disk (server/data/, git-ignored), so a restart does not unpair phones.
// Sessions (who is connected) live in memory and are shared by the HTTP and HTTPS
// listeners because both use this same module in the same Node.js process.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const PHONE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const CLIENT_SCAN_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const TOKEN_BYTES = 24; // 32 base64url characters
const MAX_TOKENS = 20;
const RESULT_TIMEOUT_MS = 12000; // how long one HTTP request waits for the PC
const LATE_RESULT_MS = 2 * 60 * 1000; // a late PC answer is still accepted for this long
const DEDUP_TTL_MS = 2 * 60 * 1000; // retries with the same clientScanId are recognised
const SWEEP_MS = 30000;
const HEARTBEAT_MS = 20000;
const MAX_CODE_LENGTH = 1000;
const MAX_TEXT_LENGTH = 300;
const RESULT_KINDS = new Set(["ok", "invalid", "not_found", "out_of_stock", "locked", "error"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const TOKENS_FILE = path.join(DATA_DIR, "remote-scanner-tokens.json");

const sessions = new Map(); // token -> session
const scanCache = new Map(); // `${token}|${phoneId}|${clientScanId}` -> { token, pending, expiresAt }

const cleanText = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const randomId = () => crypto.randomBytes(9).toString("base64url");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// ---------- pairing codes ----------

const issuedTokens = new Map(); // sha256(token) -> createdAt (insertion order = oldest first)

const loadTokens = () => {
  try {
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
    for (const entry of Array.isArray(data?.tokens) ? data.tokens : []) {
      if (HASH_RE.test(String(entry?.hash || ""))) {
        issuedTokens.set(entry.hash, String(entry.createdAt || ""));
      }
    }
  } catch {
    // no file yet (first start) or unreadable: start with no paired devices
  }
};

const saveTokens = () => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tokens = [...issuedTokens].map(([hash, createdAt]) => ({ hash, createdAt }));
    fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens }, null, 2), { mode: 0o600 });
  } catch (error) {
    console.warn("⚠️  Phone scanner: could not save pairing codes:", error.message);
  }
};

loadTokens();

export const isWellFormedToken = (token) => typeof token === "string" && TOKEN_RE.test(token);
// A token is valid only if this server issued it and it was not revoked.
export const isValidToken = (token) =>
  isWellFormedToken(token) && issuedTokens.has(hashToken(token));
export const isValidPhoneId = (id) => typeof id === "string" && PHONE_ID_RE.test(id);

export const issueToken = () => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  issuedTokens.set(hashToken(token), new Date().toISOString());
  while (issuedTokens.size > MAX_TOKENS) {
    issuedTokens.delete(issuedTokens.keys().next().value);
  }
  saveTokens();
  return token;
};

const getSession = (token, create = false) => {
  let session = sessions.get(token);
  if (!session && create) {
    session = { token, pcs: [], phones: new Map(), pending: new Map() };
    sessions.set(token, session);
  }
  return session || null;
};

const dropIfEmpty = (session) => {
  if (
    session.pcs.length === 0 &&
    session.phones.size === 0 &&
    session.pending.size === 0 &&
    sessions.get(session.token) === session
  ) {
    sessions.delete(session.token);
  }
};

// ---------- Server-Sent Events helpers ----------

const openStreams = new Set();

const heartbeat = setInterval(() => {
  for (const res of openStreams) {
    try {
      res.write(": ping\n\n");
    } catch {
      // closed sockets are removed by their "close" handler
    }
  }
}, HEARTBEAT_MS);
heartbeat.unref?.();

const openEventStream = (req, res) => {
  req.socket.setTimeout?.(0);
  req.socket.setKeepAlive?.(true);
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write("retry: 3000\n\n");
  openStreams.add(res);
};

const sendEvent = (res, event, data) => {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // ignore write errors on closing sockets
  }
};

const endStream = (res, event) => {
  sendEvent(res, event, {});
  try {
    res.end();
  } catch {
    // ignore
  }
};

// ---------- scan results ----------

const uncertain = (reason) => ({
  status: 202,
  body: { success: true, status: "uncertain", reason },
});

// One dispatched scan. The first HTTP request and its retries can all wait on it.
const createPendingScan = () => {
  let final = null;
  const waiters = new Set();
  return {
    get final() {
      return final;
    },
    settle(result) {
      if (final) return false;
      final = result;
      for (const notify of waiters) notify(result);
      waiters.clear();
      return true;
    },
    // Resolves with the final answer, or "uncertain" if the PC is slower than timeoutMs.
    wait(timeoutMs = RESULT_TIMEOUT_MS) {
      if (final) return Promise.resolve(final);
      return new Promise((resolve) => {
        const notify = (result) => {
          clearTimeout(timer);
          resolve(result);
        };
        const timer = setTimeout(() => {
          waiters.delete(notify);
          resolve(uncertain("timeout"));
        }, timeoutMs);
        waiters.add(notify);
      });
    },
  };
};

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of scanCache) {
    if (entry.expiresAt <= now) scanCache.delete(key);
  }
}, SWEEP_MS);
sweep.unref?.();

// Finish a dispatched scan and tell the phone over SSE too (covers HTTP timeouts).
const settlePending = (session, scanId, result) => {
  const pending = session.pending.get(scanId);
  if (!pending) return false;
  clearTimeout(pending.expireTimer);
  session.pending.delete(scanId);
  if (!pending.scan.settle(result)) return false;

  const phone = session.phones.get(pending.phoneId);
  if (phone && pending.clientScanId) {
    for (const res of phone.streams) {
      sendEvent(res, "result", { clientScanId: pending.clientScanId, ...result.body });
    }
  }
  dropIfEmpty(session);
  return true;
};

// ---------- presence ----------

const listPhones = (session) =>
  [...session.phones.values()].map((phone) => ({
    id: phone.id,
    name: phone.name,
    connectedAt: phone.connectedAt,
    lastScanAt: phone.lastScanAt,
    scans: phone.scans,
  }));

const notifyPcsPhones = (session) => {
  const phones = listPhones(session);
  for (const pc of session.pcs) sendEvent(pc.res, "phones", { phones });
};

const notifyPhonesStatus = (session) => {
  const status = { pc: session.pcs.length > 0 };
  for (const phone of session.phones.values()) {
    for (const res of phone.streams) sendEvent(res, "status", status);
  }
};

// ---------- PC (Vente QR page) ----------

export const attachPc = (token, req, res) => {
  const session = getSession(token, true);
  const pc = { id: randomId(), res, connectedAt: new Date().toISOString() };

  openEventStream(req, res);
  session.pcs.push(pc); // newest PC tab receives the scans
  sendEvent(res, "hello", { phones: listPhones(session) });
  notifyPhonesStatus(session);

  res.on("close", () => {
    openStreams.delete(res);
    session.pcs = session.pcs.filter((entry) => entry !== pc);
    // This tab may or may not have added the product before closing: never claim either.
    for (const [scanId, pending] of [...session.pending]) {
      if (pending.pcId === pc.id) settlePending(session, scanId, uncertain("pc_offline"));
    }
    notifyPhonesStatus(session);
    dropIfEmpty(session);
  });
};

// ---------- phone ----------

export const attachPhone = (token, phoneId, rawName, req, res) => {
  const session = getSession(token, true);
  const name = cleanText(rawName, 60) || "Téléphone";
  let phone = session.phones.get(phoneId);
  if (!phone) {
    phone = {
      id: phoneId,
      name,
      streams: new Set(),
      connectedAt: new Date().toISOString(),
      lastScanAt: null,
      scans: 0,
    };
    session.phones.set(phoneId, phone);
  }
  phone.name = name;

  openEventStream(req, res);
  phone.streams.add(res);
  sendEvent(res, "status", { pc: session.pcs.length > 0 });
  notifyPcsPhones(session);

  res.on("close", () => {
    openStreams.delete(res);
    phone.streams.delete(res);
    if (phone.streams.size === 0 && session.phones.get(phoneId) === phone) {
      session.phones.delete(phoneId);
    }
    notifyPcsPhones(session);
    dropIfEmpty(session);
  });
};

// Phone sends a scanned code. Resolves with the HTTP status + body to send back to the phone.
// A retry with the same clientScanId never reaches the PC twice: it gets the same answer.
export const submitScan = (token, phoneId, rawCode, rawClientScanId) => {
  const clientScanId = CLIENT_SCAN_ID_RE.test(String(rawClientScanId ?? ""))
    ? String(rawClientScanId)
    : null;
  const cacheKey = clientScanId ? `${token}|${phoneId}|${clientScanId}` : null;

  const cached = cacheKey ? scanCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.pending.wait();

  const code = String(rawCode ?? "").trim().slice(0, MAX_CODE_LENGTH);
  if (!code) {
    return Promise.resolve({ status: 400, body: { success: false, error: "empty_code" } });
  }

  // Laptop not connected: refuse instead of queueing (no surprise products later).
  const session = getSession(token);
  const pc = session?.pcs[session.pcs.length - 1];
  if (!pc) {
    return Promise.resolve({ status: 409, body: { success: false, error: "pc_offline" } });
  }

  const phone = session.phones.get(phoneId);
  if (phone) {
    phone.lastScanAt = new Date().toISOString();
    phone.scans += 1;
  }

  const scanId = randomId();
  const scan = createPendingScan();
  const expireTimer = setTimeout(
    () => settlePending(session, scanId, uncertain("timeout")),
    LATE_RESULT_MS,
  );
  expireTimer.unref?.();
  session.pending.set(scanId, { scan, pcId: pc.id, phoneId, clientScanId, expireTimer });
  if (cacheKey) {
    scanCache.set(cacheKey, { token, pending: scan, expiresAt: Date.now() + DEDUP_TTL_MS });
  }

  sendEvent(pc.res, "scan", {
    scanId,
    code,
    phone: { id: phoneId, name: phone?.name || "Téléphone" },
  });
  notifyPcsPhones(session);
  return scan.wait();
};

// Phone asks what happened to a scan (e.g. after a timeout), without sending it again.
export const getScanResult = (token, phoneId, rawClientScanId) => {
  const clientScanId = String(rawClientScanId ?? "");
  if (!CLIENT_SCAN_ID_RE.test(clientScanId)) {
    return { status: 400, body: { success: false, error: "invalid_scan_id" } };
  }
  const cached = scanCache.get(`${token}|${phoneId}|${clientScanId}`);
  if (!cached || cached.expiresAt <= Date.now()) {
    return { status: 404, body: { success: false, error: "unknown_scan" } };
  }
  return cached.pending.final || { status: 200, body: { success: true, status: "pending" } };
};

// PC answers a scan with what happened (added / out of stock / not found ...).
export const submitResult = (token, scanId, result = {}) => {
  const session = getSession(token);
  const id = String(scanId || "");
  if (!session?.pending.has(id)) return false;

  const cart =
    result.cart && typeof result.cart === "object"
      ? {
          lines: Number(result.cart.lines) || 0,
          units: Number(result.cart.units) || 0,
          amount: Number(result.cart.amount) || 0,
        }
      : null;

  // `status` wins when it is a known kind, so ok / locked can never contradict it.
  const known = RESULT_KINDS.has(result.status);
  const ok = known ? result.status === "ok" : Boolean(result.ok);
  const locked = known ? result.status === "locked" : Boolean(result.locked);
  const kind = known ? result.status : ok ? "ok" : locked ? "locked" : "error";

  return settlePending(session, id, {
    status: 200,
    body: {
      success: true,
      status: "done",
      result: kind,
      ok,
      locked,
      text: cleanText(result.text, MAX_TEXT_LENGTH),
      cart,
    },
  });
};

// "Nouveau code" on the PC: the old code stops working everywhere, at once.
export const revokeSession = (token) => {
  const known = issuedTokens.delete(hashToken(token));
  if (known) saveTokens();

  for (const [key, entry] of scanCache) {
    if (entry.token === token) scanCache.delete(key);
  }

  const session = getSession(token);
  if (session) {
    sessions.delete(token);
    for (const [scanId] of [...session.pending]) {
      settlePending(session, scanId, uncertain("revoked"));
    }
    for (const phone of session.phones.values()) {
      for (const res of [...phone.streams]) endStream(res, "revoked");
    }
    for (const pc of [...session.pcs]) endStream(pc.res, "revoked");
  }
  return known || Boolean(session);
};

export const getSessionStatus = (token) => {
  const session = getSession(token);
  return {
    pc: Boolean(session && session.pcs.length > 0),
    phones: session ? session.phones.size : 0,
  };
};
