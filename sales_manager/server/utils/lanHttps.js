// Local-network HTTPS for the phone scanner page.
//
// Phone browsers only allow the camera on HTTPS pages. Offline we cannot get a public
// certificate, so the PC creates its own (self-signed) certificate once and keeps it in
// server/certs/. The phone shows a security warning the first time; after accepting it,
// the camera works normally. Nothing here needs internet.

import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CERT_DIR = path.resolve(__dirname, "..", "certs");
const KEY_FILE = path.join(CERT_DIR, "scanner-key.pem");
const CERT_FILE = path.join(CERT_DIR, "scanner-cert.pem");
const CERT_YEARS = 5;

export const SCANNER_HTTPS_PORT = Number(process.env.SCANNER_HTTPS_PORT) || 3443;

const state = { enabled: false, port: SCANNER_HTTPS_PORT, error: null };

// Adapters created by VPN / virtual machine software: never the shop Wi-Fi.
const VIRTUAL_IFACE =
  /vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|^br-|^veth|tailscale|zerotier|hamachi|loopback|utun|^tun|^tap/i;

const isPrivateIPv4 = (ip) =>
  /^10\./.test(ip) ||
  /^192\.168\./.test(ip) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

const rankAddress = (entry) =>
  (entry.virtual ? 10 : 0) +
  (entry.address.startsWith("192.168.") ? 0 : entry.address.startsWith("10.") ? 1 : 2);

// IPv4 addresses of this PC on the local network(s), best guess first.
export const getLanAddresses = () => {
  const list = [];
  for (const [iface, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = typeof entry.family === "string" ? entry.family : `IPv${entry.family}`;
      if (family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue; // no DHCP: not reachable
      list.push({
        address: entry.address,
        iface,
        private: isPrivateIPv4(entry.address),
        virtual: VIRTUAL_IFACE.test(iface),
      });
    }
  }
  return list.sort((a, b) => rankAddress(a) - rankAddress(b));
};

const certIsUsable = (certPem) => {
  try {
    const cert = new crypto.X509Certificate(certPem);
    const validTo = new Date(cert.validTo).getTime();
    return validTo - Date.now() > 7 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const createCertificate = async () => {
  const hostname = os.hostname();
  const altNames = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
  ];
  if (hostname && /^[A-Za-z0-9.-]+$/.test(hostname)) {
    altNames.push({ type: 2, value: hostname }, { type: 2, value: `${hostname}.local` });
  }
  for (const { address } of getLanAddresses()) altNames.push({ type: 7, ip: address });

  const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const notAfterDate = new Date(notBeforeDate);
  notAfterDate.setFullYear(notAfterDate.getFullYear() + CERT_YEARS);

  const pems = await selfsigned.generate(
    [
      { name: "commonName", value: "SOHOFI BRICO - scanner local" },
      { name: "organizationName", value: "SOHOFI BRICO" },
    ],
    {
      keySize: 2048,
      algorithm: "sha256",
      notBeforeDate,
      notAfterDate,
      extensions: [
        { name: "basicConstraints", cA: false },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames },
      ],
    },
  );

  fs.mkdirSync(CERT_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, pems.private, { mode: 0o600 });
  fs.writeFileSync(CERT_FILE, pems.cert);
  console.log(`🔐 Phone scanner: new local certificate saved in ${CERT_DIR}`);
  return { key: pems.private, cert: pems.cert };
};

// Reuse the saved certificate so phones do not have to accept a new warning every start.
const loadOrCreateCertificate = async () => {
  if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
    const key = fs.readFileSync(KEY_FILE, "utf8");
    const cert = fs.readFileSync(CERT_FILE, "utf8");
    if (certIsUsable(cert)) return { key, cert };
  }
  return createCertificate();
};

export const startScannerHttps = async (app) => {
  if (process.env.SCANNER_HTTPS === "false") {
    state.error = "disabled";
    return;
  }
  try {
    const credentials = await loadOrCreateCertificate();
    const server = https.createServer(credentials, app);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(SCANNER_HTTPS_PORT, "0.0.0.0", () => {
        server.off("error", reject);
        resolve();
      });
    });
    server.on("error", (error) => console.error("Phone scanner HTTPS error:", error.message));
    state.enabled = true;
    state.error = null;

    console.log(`📱 Phone scanner ready (HTTPS port ${SCANNER_HTTPS_PORT}). On the phone open:`);
    const addresses = getLanAddresses();
    if (addresses.length === 0) {
      console.log("   (no network found: connect this PC to the Wi-Fi or a hotspot)");
    }
    for (const { address, iface } of addresses) {
      console.log(`   https://${address}:${SCANNER_HTTPS_PORT}/phone/   (${iface})`);
    }
  } catch (error) {
    state.enabled = false;
    state.error =
      error?.code === "EADDRINUSE"
        ? `port ${SCANNER_HTTPS_PORT} already in use`
        : String(error?.message || error);
    console.warn(`⚠️  Phone scanner HTTPS not started: ${state.error}`);
  }
};

export const getScannerHttpsState = () => ({ ...state });
