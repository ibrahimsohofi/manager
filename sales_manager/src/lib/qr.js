import QRCode from "qrcode";

// The QR code printed on each product only contains the product ID (e.g. "125").
export const encodeProductQr = (productId) => String(productId);

// Parse whatever a scanner returns and extract the product ID.
// Accepts: "125", "#125", "@125", "ID:125", "id=125", '{"id":125}', "https://...?id=125"
export const parseScannedProductId = (rawValue) => {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;

  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);

  // JSON payload
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      const id = parsed.id ?? parsed.product_id ?? parsed.productId;
      if (id !== undefined && /^\d+$/.test(String(id))) {
        return Number.parseInt(String(id), 10);
      }
    } catch {
      // not JSON, continue
    }
  }

  // URL with ?id= / ?product_id=
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const id = url.searchParams.get("id") || url.searchParams.get("product_id");
      if (id && /^\d+$/.test(id)) return Number.parseInt(id, 10);
    } catch {
      // invalid URL, continue
    }
  }

  // Prefixed forms: #125, @125, ID:125, P-125, product_id=125
  const match = value.match(PREFIXED_ID);
  if (match) return Number.parseInt(match[1], 10);

  // Multi-line text payload, e.g. the QR shown in products_manager:
  // "Id de Produit: 125\nNom de Produit: ...\nPrix de Vente: ...\nStock Actuel: ..."
  for (const line of value.split(/\r?\n/)) {
    const lineMatch = line.trim().match(LABELLED_ID) || line.trim().match(PREFIXED_ID);
    if (lineMatch) return Number.parseInt(lineMatch[1], 10);
  }

  return null;
};

const PREFIXED_ID = /^(?:#|@|id|p|product|product_id|produit)\s*[:=#\-]?\s*(\d+)$/i;
const LABELLED_ID = /^(?:id\s+(?:de\s+|du\s+)?produit|product\s+id|id\s+produit|رقم\s+المنتج)\s*[:=#\-]?\s*(\d+)\s*$/i;

// Generate a QR code image (data URL) for a product
export const generateProductQrDataUrl = (productId, size = 256) =>
  QRCode.toDataURL(encodeProductQr(productId), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });

// Short audible feedback for scans (no audio files needed)
let audioCtx = null;
export const playScanBeep = (type = "success") => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = type === "success" ? 1320 : 220;
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioCtx.currentTime + (type === "success" ? 0.12 : 0.3),
    );
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (type === "success" ? 0.12 : 0.3));
  } catch {
    // ignore audio errors
  }
};
