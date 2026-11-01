import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, CameraOff, Loader2, ShieldAlert, SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const CAMERA_STORAGE_KEY = "qrScanner.cameraId";
// Same code seen again within this window (while still in view) is ignored
const SAME_CODE_COOLDOWN_MS = 1500;

// Decorative 3x3 QR-like pattern shown while the camera is idle
const IDLE_PATTERN = Array.from({ length: 9 }, (_, index) => ({
  id: `cell-${index}`,
  on: [0, 2, 4, 6, 7].includes(index),
}));

let instanceCounter = 0;

const QrScanner = ({ onScan, flashKey = 0, flashStatus = "ok" }) => {
  const { t } = useTranslation();
  const [containerId] = useState(() => `qr-reader-${++instanceCounter}`);
  const scannerRef = useRef(null);
  const busyRef = useRef(false);
  const onScanRef = useRef(onScan);
  const lastCodeRef = useRef({ text: "", seenAt: 0 });

  const [status, setStatus] = useState("idle"); // idle | starting | running | error
  const [errorMessage, setErrorMessage] = useState("");
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState(
    () => localStorage.getItem(CAMERA_STORAGE_KEY) || "",
  );
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Visual flash on the viewfinder when a scan is processed
  useEffect(() => {
    if (!flashKey) return;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), 450);
    return () => clearTimeout(timer);
  }, [flashKey]);

  const cameraSupported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia;

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch (error) {
      console.warn("QR scanner stop error:", error);
    }
    scannerRef.current = null;
  }, []);

  const startScanner = useCallback(
    async (deviceId = cameraId) => {
      if (busyRef.current) return;
      if (!cameraSupported) {
        setStatus("error");
        setErrorMessage(t("qrSale.scanner.insecure"));
        return;
      }
      busyRef.current = true;
      setStatus("starting");
      setErrorMessage("");

      try {
        await stopScanner();
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;

        const cameraConfig = deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: "environment" };

        const handleDecoded = (decodedText) => {
          const now = Date.now();
          const last = lastCodeRef.current;
          if (last.text === decodedText && now - last.seenAt < SAME_CODE_COOLDOWN_MS) {
            last.seenAt = now; // still in view: keep ignoring
            return;
          }
          lastCodeRef.current = { text: decodedText, seenAt: now };
          onScanRef.current?.(decodedText, "camera");
        };

        try {
          await scanner.start(cameraConfig, { fps: 12, aspectRatio: 1.333 }, handleDecoded, () => {});
        } catch (error) {
          // Saved camera may no longer exist: retry with default camera
          if (deviceId) {
            localStorage.removeItem(CAMERA_STORAGE_KEY);
            setCameraId("");
            await scanner.start({ facingMode: "environment" }, { fps: 12, aspectRatio: 1.333 }, handleDecoded, () => {});
          } else {
            throw error;
          }
        }

        setStatus("running");

        // Camera labels are only available after permission is granted
        try {
          const devices = await Html5Qrcode.getCameras();
          setCameras(devices || []);
        } catch {
          setCameras([]);
        }
      } catch (error) {
        console.error("QR scanner start error:", error);
        const msg = String(error?.message || error || "");
        setStatus("error");
        if (/permission|denied|notallowed/i.test(msg)) {
          setErrorMessage(t("qrSale.scanner.permissionDenied"));
        } else if (/notfound|no camera|requested device not found|overconstrained/i.test(msg)) {
          setErrorMessage(t("qrSale.scanner.noCamera"));
        } else {
          setErrorMessage(t("qrSale.scanner.startError"));
        }
        await stopScanner();
      } finally {
        busyRef.current = false;
      }
    },
    [cameraId, cameraSupported, containerId, stopScanner, t],
  );

  const handleStop = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    await stopScanner();
    setStatus("idle");
    busyRef.current = false;
  };

  const handleCameraChange = async (e) => {
    const id = e.target.value;
    setCameraId(id);
    if (id) localStorage.setItem(CAMERA_STORAGE_KEY, id);
    else localStorage.removeItem(CAMERA_STORAGE_KEY);
    if (status === "running") await startScanner(id);
  };

  // Stop camera when leaving the page
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const isRunning = status === "running";

  return (
    <div className="space-y-3">
      <div
        className={`relative overflow-hidden rounded-xl bg-gray-950 aspect-[4/3] ring-1 transition-shadow duration-300 ${
          flashing
            ? flashStatus === "ok"
              ? "ring-4 ring-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.25)]"
              : "ring-4 ring-red-500 shadow-[0_0_0_6px_rgba(239,68,68,0.25)]"
            : "ring-gray-800"
        }`}
      >
        {/* html5-qrcode injects its <video> here */}
        <div id={containerId} className="qr-reader absolute inset-0" />

        {/* Viewfinder overlay */}
        {isRunning && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[62%] aspect-square">
              <span className="absolute left-0 top-0 h-7 w-7 border-l-4 border-t-4 border-white rounded-tl-lg" />
              <span className="absolute right-0 top-0 h-7 w-7 border-r-4 border-t-4 border-white rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 h-7 w-7 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 h-7 w-7 border-b-4 border-r-4 border-white rounded-br-lg" />
              <span className="qr-scan-line absolute inset-x-2 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.8)]" />
            </div>
          </div>
        )}

        {/* Idle / error states */}
        {!isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {status === "starting" ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-emerald-400" />
                <p className="text-sm text-gray-300">{t("qrSale.scanner.starting")}</p>
              </>
            ) : status === "error" ? (
              <>
                <ShieldAlert className="h-10 w-10 text-amber-400" />
                <p className="max-w-xs text-sm text-gray-200">{errorMessage}</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 opacity-60">
                  {IDLE_PATTERN.map((cell) => (
                    <span
                      key={cell.id}
                      className={`h-3 w-3 rounded-sm ${cell.on ? "bg-white" : "bg-gray-700"}`}
                    />
                  ))}
                </div>
                <p className="max-w-xs text-sm text-gray-300">{t("qrSale.scanner.idleHint")}</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isRunning ? (
          <button
            type="button"
            onClick={handleStop}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            <CameraOff className="h-4 w-4" />
            {t("qrSale.scanner.stop")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => startScanner()}
            disabled={status === "starting"}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <Camera className="h-4 w-4" />
            {status === "error" ? t("qrSale.scanner.retry") : t("qrSale.scanner.start")}
          </button>
        )}

        {cameras.length > 1 && (
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <SwitchCamera className="h-4 w-4 shrink-0" />
            <select
              value={cameraId}
              onChange={handleCameraChange}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{t("qrSale.scanner.defaultCamera")}</option>
              {cameras.map((cam, index) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `${t("qrSale.scanner.camera")} ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
};

export default QrScanner;
