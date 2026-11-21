import express from "express";
import { getLanAddresses, getScannerHttpsState } from "../utils/lanHttps.js";
import {
  attachPc,
  attachPhone,
  getScanResult,
  getSessionStatus,
  isValidPhoneId,
  isValidToken,
  issueToken,
  revokeSession,
  submitResult,
  submitScan,
} from "../utils/remoteScanner.js";

// Token is passed in the query string / body (never in the path) so it is not printed in the logs.
const router = express.Router();

const badToken = (res) =>
  res.status(400).json({ success: false, error: "invalid_token" });
const badPhone = (res) =>
  res.status(400).json({ success: false, error: "invalid_phone_id" });
// Do not trust forwarding headers here: the peer must actually be the laptop itself.
const isLocalPairRequest = (req) => {
  if (process.env.SCANNER_ALLOW_LAN_PAIRING === "true") return true;
  const peer = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  return peer === "127.0.0.1" || peer === "::1" ||
    getLanAddresses().some(({ address }) => address === peer);
};
// What the PC needs to build the phone link: LAN addresses + HTTPS port.
router.get("/info", (req, res) => {
  res.json({
    success: true,
    https: getScannerHttpsState(),
    addresses: getLanAddresses(),
  });
});

// Only the laptop can issue a pairing code; phones must receive it from the laptop UI.
router.post("/pair", (req, res) => {
  if (!isLocalPairRequest(req)) {
    return res.status(403).json({ success: false, error: "local_only" });
  }
  res.json({ success: true, token: issueToken() });
});
// Vente QR page listens here for scans coming from phones.
router.get("/pc-stream", (req, res) => {
  const token = String(req.query.t || "");
  if (!isValidToken(token)) return badToken(res);
  attachPc(token, req, res);
});

// Phone listens here to know whether the PC is ready (+ late scan results).
router.get("/phone-stream", (req, res) => {
  const token = String(req.query.t || "");
  const phoneId = String(req.query.phoneId || "");
  if (!isValidToken(token)) return badToken(res);
  if (!isValidPhoneId(phoneId)) return badPhone(res);
  attachPhone(token, phoneId, req.query.name, req, res);
});

router.get("/status", (req, res) => {
  const token = String(req.query.t || "");
  if (!isValidToken(token)) return badToken(res);
  res.json({ success: true, ...getSessionStatus(token) });
});

// Phone -> PC: a scanned code. Waits (max ~12 s) for the PC to say what happened.
// A retry with the same clientScanId gets the same answer and is never added twice.
router.post("/scan", async (req, res) => {
  const { t, phoneId, code, clientScanId } = req.body || {};
  if (!isValidToken(t)) return badToken(res);
  if (!isValidPhoneId(phoneId)) return badPhone(res);
  const { status, body } = await submitScan(t, phoneId, code, clientScanId);
  if (!res.headersSent && !res.writableEnded) res.status(status).json(body);
});

// Phone asks what happened to a scan after an uncertain reply (does not send it again).
router.get("/result", (req, res) => {
  const token = String(req.query.t || "");
  const phoneId = String(req.query.phoneId || "");
  if (!isValidToken(token)) return badToken(res);
  if (!isValidPhoneId(phoneId)) return badPhone(res);
  const { status, body } = getScanResult(token, phoneId, req.query.clientScanId);
  res.status(status).json(body);
});

// PC -> phone: result of a scan (status = ok | invalid | not_found | out_of_stock | locked | error).
router.post("/result", (req, res) => {
  const { t, scanId, status, ok, text, locked, cart } = req.body || {};
  if (!isValidToken(t)) return badToken(res);
  const delivered = submitResult(t, scanId, { status, ok, text, locked, cart });
  res.json({ success: true, delivered });
});

// PC created a new pairing code: disconnect phones using the old one.
router.post("/revoke", (req, res) => {
  const { t } = req.body || {};
  if (!isValidToken(t)) return badToken(res);
  res.json({ success: true, revoked: revokeSession(t) });
});

export default router;
