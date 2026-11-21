// Phone scanner page (served at https://<laptop-ip>:3443/phone/).
// The phone is only a remote input device: it reads a code and sends it to the laptop,
// which does all the work (lookup, stock, cart) and answers with a result.
// No CDN, no build step: plain browser JavaScript + the vendored html5-qrcode (v2.3.8).
(() => {
  "use strict";

  // ---------- constants ----------

  const API = "/api/remote-scanner";
  const KEY_TOKEN = "qrsale.scanner.token";
  const KEY_PHONE = "qrsale.scanner.phoneId";
  const KEY_NAME = "qrsale.scanner.name";
  const KEY_CAMERA = "qrsale.scanner.cameraId";
  const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
  const PHONE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
  const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

  const MAX_ATTEMPTS = 3; // same clientScanId every time: the server never adds it twice
  const RETRY_DELAYS_MS = [600, 1500];
  const REQUEST_TIMEOUT_MS = 16000; // the server waits up to 12 s for the laptop
  const POLL_INTERVAL_MS = 2000; // GET /result after an uncertain reply
  const POLL_MAX = 15;
  const SAME_CODE_COOLDOWN_MS = 2500; // same code again: at least this long after the last send
  const SAME_CODE_GAP_MS = 1200; // ... and it must have left the camera for this long
  const RECONNECT_MIN_MS = 3000;
  const RECONNECT_MAX_MS = 15000;
  const HISTORY_MAX = 8;

  // ---------- small helpers ----------

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // localStorage can throw (private mode, storage disabled): fall back to memory.
  const memoryStore = {};
  const store = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryStore[key] ?? null;
      }
    },
    set(key, value) {
      memoryStore[key] = value;
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // memory only
      }
    },
    remove(key) {
      delete memoryStore[key];
      try {
        window.localStorage.removeItem(key);
      } catch {
        // memory only
      }
    },
  };

  const randomId = (length) => {
    const bytes = new Uint8Array(length);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    let id = "";
    for (const byte of bytes) id += ID_CHARS[byte & 63];
    return id;
  };

  const formatMoney = (value) =>
    (Number(value) || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const formatTime = (date) =>
    date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const guessDeviceName = () => {
    const ua = navigator.userAgent || "";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    return "Téléphone";
  };

  // ---------- elements ----------

  const el = {
    flash: $("flash"),
    status: $("status"),
    statusTitle: $("statusTitle"),
    statusDetail: $("statusDetail"),
    deviceBtn: $("deviceBtn"),
    deviceName: $("deviceName"),
    banner: $("banner"),
    bannerText: $("bannerText"),
    viewfinder: $("viewfinder"),
    sending: $("sending"),
    idleText: $("idleText"),
    startBtn: $("startBtn"),
    switchBtn: $("switchBtn"),
    torchBtn: $("torchBtn"),
    manualBtn: $("manualBtn"),
    stopBtn: $("stopBtn"),
    result: $("result"),
    resultTitle: $("resultTitle"),
    resultDetail: $("resultDetail"),
    resultCode: $("resultCode"),
    cart: $("cart"),
    cartLines: $("cartLines"),
    cartUnits: $("cartUnits"),
    cartAmount: $("cartAmount"),
    history: $("history"),
    historyEmpty: $("historyEmpty"),
    pairScreen: $("pairScreen"),
    pairTitle: $("pairTitle"),
    pairText: $("pairText"),
    pairRetryBtn: $("pairRetryBtn"),
    manualDialog: $("manualDialog"),
    manualForm: $("manualForm"),
    manualInput: $("manualInput"),
    nameDialog: $("nameDialog"),
    nameForm: $("nameForm"),
    nameInput: $("nameInput"),
    forgetBtn: $("forgetBtn"),
  };

  // ---------- state ----------

  const state = {
    token: null,
    phoneId: null,
    name: "",
    paired: false,
    pcOnline: false,
    streamOpen: false,
    busy: false, // one scan in flight at a time; camera reads are ignored meanwhile
    latestScanId: null, // the result panel only shows the newest scan
    lastCode: null,
    lastSentAt: 0,
    lastSeenAt: 0,
  };

  // ---------- feedback: flash, vibration, beep ----------

  let audioCtx = null;

  // iOS only allows sound after a user gesture: call this from click handlers.
  const unlockAudio = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch {
      audioCtx = null;
    }
  };

  const tone = (frequency, start, duration, volume = 0.18) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  };

  const beep = (kind) => {
    if (!audioCtx || audioCtx.state !== "running") return;
    try {
      const now = audioCtx.currentTime;
      if (kind === "ok") {
        tone(1320, now, 0.09);
      } else if (kind === "err") {
        tone(260, now, 0.16);
        tone(200, now + 0.2, 0.22);
      } else {
        tone(760, now, 0.08, 0.12);
        tone(760, now + 0.14, 0.08, 0.12);
      }
    } catch {
      // sound is a bonus, never block a scan for it
    }
  };

  const VIBRATION = { ok: 70, err: [90, 60, 90], warn: [40, 50, 40] };

  const feedback = (kind) => {
    el.flash.dataset.kind = kind;
    el.flash.classList.remove("is-on");
    void el.flash.offsetWidth; // restart the animation
    el.flash.classList.add("is-on");
    try {
      navigator.vibrate?.(VIBRATION[kind] || 50);
    } catch {
      // not supported (iOS)
    }
    beep(kind);
  };

  // ---------- status bar + banner ----------

  const renderStatus = () => {
    let mode = "connecting";
    let title = "Connexion…";
    let detail = "Recherche de la caisse";
    if (!navigator.onLine) {
      mode = "offline";
      title = "Pas de réseau";
      detail = "Connectez le téléphone au Wi-Fi de la boutique";
    } else if (state.streamOpen && state.pcOnline) {
      mode = "online";
      title = "Caisse connectée";
      detail = `Ce téléphone : ${state.name}`;
    } else if (state.streamOpen) {
      mode = "offline";
      title = "Caisse non connectée";
      detail = "Ouvrez Vente QR sur l'ordinateur";
    }
    el.status.dataset.state = mode;
    el.statusTitle.textContent = title;
    el.statusDetail.textContent = detail;
  };

  const showBanner = (text) => {
    el.bannerText.textContent = text;
    el.banner.hidden = false;
  };
  const hideBanner = () => {
    el.banner.hidden = true;
  };

  // ---------- result panel, cart, history ----------

  // How each laptop answer is shown on the phone (French, see PHONE_SCANNER_PLAN.md).
  const RESULT_VIEW = {
    ok: { kind: "ok", title: "Produit envoyé", detail: "Ajouté au panier de la caisse." },
    locked: { kind: "warn", title: "Vente en cours", detail: "Terminez la vente sur la caisse, puis rescannez." },
    invalid: { kind: "err", title: "Code invalide", detail: "Ce code n'est pas un produit." },
    not_found: { kind: "err", title: "Produit introuvable", detail: "Aucun produit avec ce code." },
    out_of_stock: { kind: "err", title: "Stock insuffisant", detail: "Plus de stock pour ce produit." },
    error: { kind: "err", title: "Erreur caisse", detail: "La caisse n'a pas pu ajouter le produit." },
    uncertain: { kind: "warn", title: "Envoyé, vérifiez l'écran", detail: "La caisse n'a pas confirmé. Regardez le panier sur l'ordinateur." },
    pc_offline: { kind: "err", title: "Caisse non connectée", detail: "Scan non envoyé. Ouvrez Vente QR sur l'ordinateur." },
    network: { kind: "err", title: "Réseau indisponible", detail: "Scan non envoyé. Vérifiez le Wi-Fi." },
    rejected: { kind: "err", title: "Scan refusé", detail: "Le code n'a pas pu être envoyé." },
  };

  const UNCERTAIN_DETAIL = {
    timeout: "La caisse met du temps à répondre. Regardez le panier sur l'ordinateur.",
    pc_offline: "La caisse s'est déconnectée pendant l'envoi. Regardez le panier sur l'ordinateur.",
    retries: "Réseau instable. Regardez le panier sur l'ordinateur avant de rescanner.",
  };

  const renderCart = (cart) => {
    if (!cart) return;
    el.cartLines.textContent = String(cart.lines ?? 0);
    el.cartUnits.textContent = String(cart.units ?? 0);
    el.cartAmount.textContent = formatMoney(cart.amount);
    el.cart.hidden = false;
  };

  const showResult = ({ kind, title, detail, code }) => {
    el.result.dataset.kind = kind;
    el.resultTitle.textContent = title;
    el.resultDetail.textContent = detail || "";
    el.resultCode.textContent = code || "";
    el.resultCode.hidden = !code;
    el.result.classList.remove("is-new");
    void el.result.offsetWidth;
    el.result.classList.add("is-new");
  };

  const history = []; // newest first: { id, code, kind, label, sub, time, node }

  const renderHistoryItem = (item) => {
    const li = item.node || document.createElement("li");
    li.className = "history__item";
    li.dataset.kind = item.kind;
    li.replaceChildren();
    const main = document.createElement("div");
    main.className = "history__main";
    const label = document.createElement("span");
    label.className = "history__label";
    label.textContent = item.label;
    const sub = document.createElement("span");
    sub.className = "history__sub";
    sub.textContent = item.sub;
    main.append(label, sub);
    const time = document.createElement("time");
    time.className = "history__time";
    time.textContent = formatTime(item.time);
    li.append(main, time);
    item.node = li;
    return li;
  };

  const addHistory = (id, code) => {
    const item = { id, code, kind: "none", label: code, sub: "Envoi…", time: new Date() };
    history.unshift(item);
    el.history.prepend(renderHistoryItem(item));
    while (history.length > HISTORY_MAX) history.pop().node?.remove();
    el.historyEmpty.hidden = true;
    return item;
  };

  const updateHistory = (id, kind, label, sub) => {
    const item = history.find((entry) => entry.id === id);
    if (!item) return;
    item.kind = kind;
    item.label = label || item.code;
    item.sub = sub;
    renderHistoryItem(item);
  };

  // Show what happened to one scan. Late answers update the history, and the
  // big panel only if no newer scan was made since.
  const settled = new Set(); // clientScanIds with a final answer (SSE + HTTP may both deliver)

  const applyOutcome = (scanId, code, outcome, { silent = false } = {}) => {
    const view = RESULT_VIEW[outcome.result] || RESULT_VIEW.error;
    let detail = outcome.text || view.detail;
    if (outcome.result === "uncertain") detail = UNCERTAIN_DETAIL[outcome.reason] || view.detail;
    if (outcome.result === "ok" && outcome.cart) {
      const { lines = 0, units = 0, amount = 0 } = outcome.cart;
      detail = `${outcome.text || view.detail} · ${units} art. / ${lines} lignes · ${formatMoney(amount)} MAD`;
    }

    updateHistory(scanId, view.kind, outcome.text || code, view.title);
    if (outcome.cart) renderCart(outcome.cart);
    if (scanId !== state.latestScanId) return;
    showResult({ kind: view.kind, title: view.title, detail, code });
    if (!silent) feedback(view.kind);
  };

  // ---------- API ----------

  const fetchJson = async (url, options = {}) => {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        credentials: "omit",
        ...options,
        signal: controller?.signal,
      });
      let body = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // "valid" | "invalid" | "unknown" (network down: do not unpair the phone for that).
  const checkToken = async () => {
    if (!state.token) return "invalid";
    try {
      const { status, body } = await fetchJson(`${API}/status?t=${encodeURIComponent(state.token)}`);
      if (status === 200 && body?.success) {
        state.pcOnline = Boolean(body.pc);
        return "valid";
      }
      if (status === 400 && body?.error === "invalid_token") return "invalid";
      return "unknown";
    } catch {
      return "unknown";
    }
  };

  // ---------- pairing ----------

  const PAIR_VIEW = {
    missing: {
      title: "Téléphone non associé",
      text: "Sur l'ordinateur, ouvrez Vente QR, cliquez sur « Téléphone », puis scannez le code QR affiché avec l'appareil photo de ce téléphone.",
    },
    invalid: {
      title: "Code d'association invalide",
      text: "Ce code n'est plus valable. Sur l'ordinateur, ouvrez « Téléphone » dans Vente QR et scannez le nouveau code QR.",
    },
    revoked: {
      title: "Nouveau code créé",
      text: "La caisse a remplacé le code d'association. Rescannez le code QR affiché sur l'ordinateur.",
    },
    forgotten: {
      title: "Téléphone dissocié",
      text: "Ce téléphone n'envoie plus de scans. Pour l'associer à nouveau, scannez le code QR affiché sur l'ordinateur.",
    },
  };

  const showPairScreen = (reason) => {
    const view = PAIR_VIEW[reason] || PAIR_VIEW.missing;
    state.paired = false;
    closeStream();
    stopCamera();
    el.pairTitle.textContent = view.title;
    el.pairText.textContent = view.text;
    el.pairScreen.hidden = false;
    hideBanner();
    renderStatus();
  };

  const hidePairScreen = () => {
    el.pairScreen.hidden = true;
  };

  // The pairing link is https://<pc>:3443/phone/#t=<token>. The token stays in the hash
  // (never sent to a server, never logged), is saved here, then removed from the address bar.
  // Returns "none" (no token in the link), "bad" (malformed) or "saved".
  const takeTokenFromHash = () => {
    const match = /(?:^|[#&])t=([^&]+)/.exec(window.location.hash || "");
    if (!match) return "none";
    let token = "";
    try {
      token = decodeURIComponent(match[1]);
    } catch {
      token = "";
    }
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      window.location.hash = "";
    }
    if (!TOKEN_RE.test(token)) return "bad";
    store.set(KEY_TOKEN, token);
    return "saved";
  };

  const forgetPairing = () => {
    store.remove(KEY_TOKEN);
    state.token = null;
    showPairScreen("forgotten");
  };

  // ---------- live link with the laptop (Server-Sent Events) ----------

  let stream = null;
  let reconnectTimer = null;
  let reconnectDelay = RECONNECT_MIN_MS;
  let tokenCheckInFlight = false;

  function closeStream() {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    if (stream) {
      stream.close();
      stream = null;
    }
    state.streamOpen = false;
  }

  const scheduleReconnect = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(openStream, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  };

  // The code was revoked or is unknown: unpair and say why.
  const dropToken = (reason) => {
    store.remove(KEY_TOKEN);
    state.token = null;
    showPairScreen(reason);
  };

  // A failing stream can mean "Wi-Fi down" (keep trying) or "code no longer valid" (unpair).
  const onStreamTrouble = async () => {
    if (tokenCheckInFlight || !state.paired) return;
    tokenCheckInFlight = true;
    const verdict = await checkToken();
    tokenCheckInFlight = false;
    if (!state.paired) return;
    if (verdict === "invalid") {
      dropToken("invalid");
      return;
    }
    // EventSource gives up by itself after a non-200 answer (readyState 2 = CLOSED).
    if (!stream || stream.readyState === 2) {
      closeStream();
      scheduleReconnect();
    }
  };

  const parseData = (event) => {
    try {
      return JSON.parse(event.data || "{}");
    } catch {
      return {};
    }
  };

  function openStream() {
    closeStream();
    if (!state.paired || !state.token) return;
    if (typeof window.EventSource !== "function") {
      showBanner("Navigateur trop ancien : mettez à jour Chrome ou Safari.");
      return;
    }
    const query = new URLSearchParams({ t: state.token, phoneId: state.phoneId, name: state.name });
    const source = new EventSource(`${API}/phone-stream?${query}`);
    stream = source;
    renderStatus();

    source.addEventListener("open", () => {
      if (stream !== source) return;
      state.streamOpen = true;
      reconnectDelay = RECONNECT_MIN_MS;
      hideBanner();
      renderStatus();
    });

    source.addEventListener("status", (event) => {
      if (stream !== source) return;
      state.streamOpen = true;
      state.pcOnline = Boolean(parseData(event).pc);
      hideBanner();
      renderStatus();
    });

    // Late answer for a scan that got "uncertain" over HTTP (or a copy of the HTTP answer).
    source.addEventListener("result", (event) => {
      if (stream !== source) return;
      handleLateResult(parseData(event));
    });

    // The laptop created a new pairing code: this one is dead.
    source.addEventListener("revoked", () => {
      if (stream !== source) return;
      dropToken("revoked");
    });

    source.addEventListener("error", () => {
      if (stream !== source) return;
      state.streamOpen = false;
      renderStatus();
      if (state.paired) {
        showBanner(navigator.onLine ? "Reconnexion à la caisse…" : "Pas de réseau : vérifiez le Wi-Fi…");
      }
      onStreamTrouble();
    });
  }

  // ---------- sending a scan ----------

  const pollers = new Set(); // clientScanIds being checked with GET /result

  const markSettled = (scanId) => {
    settled.add(scanId);
    pollers.delete(scanId);
    if (settled.size > 200) settled.delete(settled.values().next().value);
  };

  // Laptop answer (HTTP 200 body or SSE "result" payload) -> what to show.
  const toOutcome = (body) => ({
    result: body.result || (body.ok ? "ok" : body.locked ? "locked" : "error"),
    text: typeof body.text === "string" ? body.text : "",
    cart: body.cart && typeof body.cart === "object" ? body.cart : null,
  });

  // Final answer for a scan. Returns false if it was already shown (HTTP and SSE both deliver).
  const finish = (scanId, code, outcome, options) => {
    if (settled.has(scanId)) return false;
    markSettled(scanId);
    applyOutcome(scanId, code, outcome, options);
    return true;
  };

  // After an uncertain reply: ask the server what happened (never sends the scan again).
  const pollResult = async (scanId, code) => {
    if (pollers.has(scanId)) return;
    pollers.add(scanId);
    for (let i = 0; i < POLL_MAX; i += 1) {
      await sleep(POLL_INTERVAL_MS);
      if (!pollers.has(scanId) || settled.has(scanId) || !state.token) return;
      try {
        const query = new URLSearchParams({ t: state.token, phoneId: state.phoneId, clientScanId: scanId });
        const { status, body } = await fetchJson(`${API}/result?${query}`);
        if (status === 200 && body?.status === "done") {
          finish(scanId, code, toOutcome(body));
          return;
        }
        if (status === 202) {
          // Final "uncertain" (laptop tab closed, too late...): keep the warning, explain why.
          markSettled(scanId);
          if (body?.reason !== "revoked") {
            applyOutcome(scanId, code, { result: "uncertain", reason: body?.reason }, { silent: true });
          }
          return;
        }
        if (status === 404) break; // the scan never reached the server, or was forgotten
        if (status === 400 && body?.error === "invalid_token") {
          dropToken("invalid");
          return;
        }
      } catch {
        // network hiccup: try again on the next round
      }
    }
    pollers.delete(scanId);
  };

  // SSE "result": { clientScanId, status: "done" | "uncertain", ... }.
  function handleLateResult(data) {
    const scanId = String(data?.clientScanId || "");
    const item = history.find((entry) => entry.id === scanId);
    if (!item || settled.has(scanId)) return;
    if (data.status === "done") {
      finish(scanId, item.code, toOutcome(data));
    } else if (data.status === "uncertain") {
      markSettled(scanId);
      if (data.reason !== "revoked") {
        applyOutcome(scanId, item.code, { result: "uncertain", reason: data.reason }, { silent: true });
      }
    }
  }

  const setSending = (on) => {
    el.sending.hidden = !on;
    el.viewfinder.dataset.busy = String(on);
  };

  // One physical scan = one clientScanId. Up to 3 attempts with that same id: the server
  // recognises retries, so a product is never added twice because of a flaky network.
  const sendScan = async (code) => {
    if (state.busy || !state.paired || !state.token) return false;
    state.busy = true;
    state.lastCode = code;
    const scanId = randomId(20);
    state.latestScanId = scanId;
    addHistory(scanId, code);
    setSending(true);
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        if (!state.token) return true;
        try {
          const { status, body } = await fetchJson(`${API}/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ t: state.token, phoneId: state.phoneId, code, clientScanId: scanId }),
          });
          if (status === 200 && body?.status === "done") {
            finish(scanId, code, toOutcome(body));
            return true;
          }
          if (status === 202) {
            applyOutcome(scanId, code, { result: "uncertain", reason: body?.reason });
            pollResult(scanId, code);
            return true;
          }
          if (status === 409) {
            // Laptop not listening: refused, not queued. Nothing will be added later.
            state.pcOnline = false;
            renderStatus();
            finish(scanId, code, { result: "pc_offline" });
            return true;
          }
          if (status === 400 && body?.error === "invalid_token") {
            finish(scanId, code, { result: "rejected" }, { silent: true });
            dropToken("invalid");
            return true;
          }
          if (status >= 400 && status < 500) {
            finish(scanId, code, { result: "rejected" });
            return true;
          }
          // 5xx: try again with the same id
        } catch {
          // network error or timeout: try again with the same id
        }
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1]);
      }
      // All attempts failed, but one of them may still have reached the laptop.
      applyOutcome(scanId, code, { result: "uncertain", reason: "retries" });
      pollResult(scanId, code);
      return true;
    } finally {
      state.busy = false;
      state.lastSentAt = Date.now();
      state.lastSeenAt = Date.now();
      setSending(false);
    }
  };

  // Camera callback, called many times per second while a code is in view.
  // The same code is sent again only after it left the camera and the cooldown passed,
  // so holding the phone over one label never adds it repeatedly.
  function onDecoded(decodedText) {
    const code = String(decodedText || "").trim();
    if (!code) return;
    const now = Date.now();
    if (code === state.lastCode) {
      const unseenFor = now - state.lastSeenAt;
      state.lastSeenAt = now;
      if (now - state.lastSentAt < SAME_CODE_COOLDOWN_MS || unseenFor < SAME_CODE_GAP_MS) return;
    }
    if (state.busy) return;
    sendScan(code);
  }

  // ---------- camera ----------

  const IDLE_TEXT = el.idleText.textContent;
  const START_LABEL = el.startBtn.querySelector("span");
  const START_TEXT = START_LABEL ? START_LABEL.textContent : "";

  const getLib = () => window.__Html5QrcodeLibrary__ || {};
  const getScannerClass = () => window.Html5Qrcode || getLib().Html5Qrcode;
  const getFormats = () => {
    const formats = window.Html5QrcodeSupportedFormats || getLib().Html5QrcodeSupportedFormats;
    return formats ? [formats.QR_CODE, formats.EAN_13] : [0, 9];
  };

  let scanner = null;
  let cameras = [];
  let cameraState = "idle"; // idle | starting | running | error
  let torch = null; // torch feature of the running camera, when the phone supports it
  let resumeOnShow = false;
  let wakeLock = null;

  const setCameraState = (next, message) => {
    cameraState = next;
    el.viewfinder.dataset.camera = next;
    el.idleText.textContent = message || IDLE_TEXT;
    const running = next === "running";
    el.startBtn.disabled = next === "starting";
    if (START_LABEL) START_LABEL.textContent = next === "starting" ? "Ouverture…" : START_TEXT;
    el.stopBtn.disabled = !running;
    el.switchBtn.disabled = !running || cameras.length < 2;
    el.torchBtn.disabled = !running || !torch;
    if (!running) el.torchBtn.setAttribute("aria-pressed", "false");
  };

  const cameraErrorMessage = (error) => {
    const name = error?.name || "";
    const text = `${name} ${error?.message || error || ""}`;
    if (/NotAllowed|Permission|denied/i.test(text)) {
      return "Accès à la caméra refusé. Autorisez la caméra pour ce site dans les réglages du navigateur, puis réessayez.";
    }
    if (/NotFound|DevicesNotFound|not found/i.test(text)) return "Aucune caméra trouvée sur ce téléphone.";
    if (/NotReadable|TrackStart|Could not start/i.test(text)) {
      return "La caméra est utilisée par une autre application. Fermez-la, puis réessayez.";
    }
    if (/Overconstrained/i.test(text)) return "Cette caméra n'est pas disponible. Réessayez.";
    return "Impossible d'ouvrir la caméra. Réessayez ou utilisez la saisie manuelle.";
  };

  // Scan box slightly larger than the yellow frame, limited to the visible part of the video.
  const scanConfig = () => ({
    fps: 12,
    qrbox: (width, height) => {
      const visibleHeight = Math.min(height, el.viewfinder.clientHeight || height);
      return {
        width: Math.max(60, Math.floor(width * 0.86)),
        height: Math.max(60, Math.floor(visibleHeight * 0.84)),
      };
    },
  });

  const requestWakeLock = async () => {
    if (wakeLock || !navigator.wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  };

  const releaseWakeLock = () => {
    try {
      wakeLock?.release();
    } catch {
      // already released
    }
    wakeLock = null;
  };

  const setupTorch = () => {
    torch = null;
    try {
      const feature = scanner.getRunningTrackCameraCapabilities().torchFeature();
      if (feature.isSupported()) torch = feature;
    } catch {
      torch = null;
    }
  };

  // Camera names are only readable after the camera permission was granted.
  const loadCameras = async () => {
    try {
      const list = await getScannerClass().getCameras();
      cameras = Array.isArray(list) ? list : [];
    } catch {
      cameras = [];
    }
  };

  const runScanner = (camera) => scanner.start(camera, scanConfig(), onDecoded, () => {});

  async function startCamera(deviceId) {
    if (cameraState === "starting" || !state.paired) return;
    const Scanner = getScannerClass();
    if (!Scanner) {
      setCameraState("error", "Le module caméra n'a pas pu être chargé. Rechargez la page.");
      return;
    }
    if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia) {
      setCameraState(
        "error",
        "La caméra exige une connexion sécurisée (https://). Ouvrez le lien affiché sur la caisse. La saisie manuelle reste possible.",
      );
      return;
    }
    setCameraState("starting", "Ouverture de la caméra…");
    try {
      await stopScanner();
      if (!scanner) {
        scanner = new Scanner("reader", {
          formatsToSupport: getFormats(),
          verbose: false,
          // Uses the phone's own BarcodeDetector when it has one (faster, better on EAN-13).
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
      }
      const preferred = deviceId || store.get(KEY_CAMERA);
      if (preferred) {
        try {
          await runScanner(preferred);
        } catch (error) {
          if (/NotAllowed|Permission|denied/i.test(`${error?.name} ${error?.message || error}`)) throw error;
          store.remove(KEY_CAMERA); // saved camera is gone: use the back camera
          await runScanner({ facingMode: "environment" });
        }
      } else {
        await runScanner({ facingMode: "environment" });
      }
      if (!state.paired) {
        await stopCamera();
        return;
      }
      await loadCameras();
      setupTorch();
      setCameraState("running");
      requestWakeLock();
    } catch (error) {
      await stopScanner();
      setCameraState("error", cameraErrorMessage(error));
    }
  }

  async function stopScanner() {
    torch = null;
    if (!scanner) return;
    try {
      const current = scanner.getState?.();
      if (current === 2 || current === 3) await scanner.stop(); // SCANNING | PAUSED
    } catch {
      // already stopped
    }
  }

  async function stopCamera() {
    releaseWakeLock();
    await stopScanner();
    setCameraState("idle");
  }

  const switchCamera = async () => {
    if (cameras.length < 2 || cameraState !== "running") return;
    let current = null;
    try {
      current = scanner.getRunningTrackSettings()?.deviceId || null;
    } catch {
      current = null;
    }
    const index = cameras.findIndex((camera) => camera.id === current);
    const next = cameras[(index + 1) % cameras.length];
    store.set(KEY_CAMERA, next.id);
    await startCamera(next.id);
  };

  const toggleTorch = async () => {
    if (!torch) return;
    const on = el.torchBtn.getAttribute("aria-pressed") !== "true";
    try {
      await torch.apply(on);
      el.torchBtn.setAttribute("aria-pressed", String(on));
    } catch {
      torch = null;
      el.torchBtn.disabled = true;
    }
  };

  // ---------- dialogs ----------

  const cleanName = (value) =>
    String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);

  const openDialog = (dialog, focusEl) => {
    if (typeof dialog.showModal !== "function") return false;
    if (!dialog.open) dialog.showModal();
    setTimeout(() => focusEl?.focus(), 50);
    return true;
  };

  const setName = (value) => {
    const name = cleanName(value);
    if (!name || name === state.name) return;
    state.name = name;
    store.set(KEY_NAME, name);
    el.deviceName.textContent = name;
    renderStatus();
    if (state.paired) openStream(); // the laptop shows the new name
  };

  const sendManual = (value) => {
    const code = String(value || "").trim();
    if (!code || state.busy) return false;
    sendScan(code);
    return true;
  };

  const bindUi = () => {
    el.startBtn.addEventListener("click", () => {
      unlockAudio();
      startCamera();
    });
    el.stopBtn.addEventListener("click", () => {
      resumeOnShow = false;
      stopCamera();
    });
    el.switchBtn.addEventListener("click", switchCamera);
    el.torchBtn.addEventListener("click", toggleTorch);

    el.manualBtn.addEventListener("click", () => {
      unlockAudio();
      el.manualInput.value = "";
      if (!openDialog(el.manualDialog, el.manualInput)) {
        sendManual(window.prompt("ID du produit ou code-barres (EAN-13)") || "");
      }
    });
    el.manualForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (sendManual(el.manualInput.value)) el.manualDialog.close();
      else el.manualInput.focus();
    });

    el.deviceBtn.addEventListener("click", () => {
      el.nameInput.value = state.name;
      if (!openDialog(el.nameDialog, el.nameInput)) {
        setName(window.prompt("Nom de ce téléphone", state.name) || "");
      }
    });
    el.nameForm.addEventListener("submit", (event) => {
      event.preventDefault();
      setName(el.nameInput.value);
      el.nameDialog.close();
    });
    el.forgetBtn.addEventListener("click", () => {
      if (!window.confirm("Dissocier ce téléphone de la caisse ?")) return;
      el.nameDialog.close();
      forgetPairing();
    });

    for (const dialog of [el.manualDialog, el.nameDialog]) {
      // Tap on the dark backdrop closes the sheet.
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      for (const button of dialog.querySelectorAll("[data-close]")) {
        button.addEventListener("click", () => dialog.close());
      }
    }

    el.pairRetryBtn.addEventListener("click", boot);

    // Scanning the laptop QR again while this page is open only changes the hash.
    window.addEventListener("hashchange", () => {
      if (/(?:^|[#&])t=/.test(window.location.hash || "")) boot();
    });

    window.addEventListener("online", () => {
      renderStatus();
      if (state.paired) {
        reconnectDelay = RECONNECT_MIN_MS;
        openStream();
      }
    });
    window.addEventListener("offline", () => {
      renderStatus();
      if (state.paired) showBanner("Pas de réseau : vérifiez le Wi-Fi…");
    });

    // Phones stop the camera in the background; restart it (and the link) on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        if (cameraState === "running") {
          resumeOnShow = true;
          stopCamera();
        }
        return;
      }
      if (!state.paired) return;
      if (!stream || stream.readyState === 2) {
        reconnectDelay = RECONNECT_MIN_MS;
        openStream();
      }
      if (resumeOnShow) {
        resumeOnShow = false;
        startCamera();
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted && state.paired) openStream();
    });
  };

  // ---------- start ----------

  const loadIdentity = () => {
    let phoneId = store.get(KEY_PHONE);
    if (!PHONE_ID_RE.test(phoneId || "")) {
      phoneId = randomId(18);
      store.set(KEY_PHONE, phoneId);
    }
    state.phoneId = phoneId;
    state.name = cleanName(store.get(KEY_NAME)) || guessDeviceName();
    el.deviceName.textContent = state.name;
  };

  let bootRun = 0;

  async function boot() {
    const run = ++bootRun;
    const fromLink = takeTokenFromHash();
    const saved = store.get(KEY_TOKEN);
    state.token = TOKEN_RE.test(saved || "") ? saved : null;
    if (!state.token) {
      showPairScreen(fromLink === "bad" ? "invalid" : "missing");
      return;
    }
    state.paired = false;
    closeStream();
    renderStatus();
    const verdict = await checkToken();
    if (run !== bootRun) return;
    if (verdict === "invalid") {
      dropToken("invalid");
      return;
    }
    // "unknown" = laptop unreachable right now: stay paired and keep retrying.
    hidePairScreen();
    state.paired = true;
    renderStatus();
    openStream();
  }

  loadIdentity();
  setCameraState("idle");
  renderStatus();
  bindUi();
  boot();
})();
