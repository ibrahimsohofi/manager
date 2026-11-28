import { APPS } from "./apps.js";
import { buildHelp, fillHelp, renderHelpStatus, toggleHelp } from "./help.js";
import { MESSAGES } from "./i18n.js";
import { APP_ICONS, ARROW_ICON } from "./icons.js";

const LANG_KEY = "launcher.lang";
const PING_TIMEOUT_MS = 2500;
const PING_INTERVAL_MS = 8000;
/** "?" on most layouts, "؟" on Arabic keyboards (same physical key). */
const HELP_KEYS = new Set(["?", "؟", "F1"]);

const state = {
  lang: readStoredLang(),
  status: Object.fromEntries(APPS.map((app) => [app.id, "checking"])),
  /** End of the last complete check (all apps), shown in the help panel. */
  lastChecked: null,
};

/** The running check, shared by every caller (timer, tab focus, "Check now"). */
let inflight = null;

function readStoredLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "fr";
  } catch {
    return "fr";
  }
}

const messages = () => MESSAGES[state.lang];

/** "help.lights.online" -> m.help.lights.online. Missing key: empty text + a console hint. */
function lookup(m, key) {
  const value = key.split(".").reduce((node, part) => node?.[part], m);
  if (typeof value === "string") return value;
  console.warn(`[launcher] missing text "${key}" (${state.lang})`);
  return "";
}

/* ---------- Structure (built once; texts are filled by fillTexts) ---------- */

function buildTags() {
  const list = document.getElementById("tags");
  list.innerHTML = APPS.map(
    (app, index) => `
      <li class="tag-wrap" style="--i:${index}" data-wrap="${app.id}">
        <a class="tag" data-app="${app.id}" aria-describedby="status-${app.id}" aria-keyshortcuts="${app.digit}">
          <span class="tag-eyelet" aria-hidden="true"></span>
          <span class="tag-head">
            <span class="tag-num" aria-hidden="true">0${app.digit}</span>
            <span class="tag-icon" aria-hidden="true">${APP_ICONS[app.id]}</span>
          </span>
          <span class="tag-kicker"></span>
          <h3 class="tag-name"></h3>
          <p class="tag-desc"></p>
          <ul class="tag-features"></ul>
          <span class="tag-code" aria-hidden="true">
            <span class="barcode"></span>
            <span class="tag-folder">${app.folder}/</span>
          </span>
          <span class="tag-foot">
            <span class="status" id="status-${app.id}" data-state="checking">
              <span class="status-dot"></span>
              <span class="status-text">
                <span class="status-label"></span>
                <span class="status-port">:${app.port}</span>
              </span>
            </span>
            <span class="enter">
              <kbd aria-hidden="true">${app.digit}</kbd>
              <span class="enter-label"></span>
              <span class="enter-arrow" aria-hidden="true">${ARROW_ICON}</span>
            </span>
          </span>
          <span class="tag-hint-wrap">
            <span class="tag-hint">
              <span class="tag-hint-label"></span>
              <code><span>cd ${app.folder}</span><span>bun run dev</span></code>
            </span>
          </span>
        </a>
      </li>`,
  ).join("");

  for (const app of APPS) {
    list.querySelector(`[data-app="${app.id}"]`).href = app.url;
  }
}

/* ---------- Texts (FR / AR) ---------- */

function fillTexts() {
  const m = messages();
  const root = document.documentElement;
  root.lang = state.lang;
  root.dir = state.lang === "ar" ? "rtl" : "ltr";
  document.title = m.htmlTitle;

  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = lookup(m, el.dataset.i18n);
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = lookup(m, el.dataset.i18nHtml);
  }
  // Icon-only buttons: accessible name + tooltip.
  for (const el of document.querySelectorAll("[data-i18n-label]")) {
    const label = lookup(m, el.dataset.i18nLabel);
    el.setAttribute("aria-label", label);
    el.title = label;
  }
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
  }

  for (const app of APPS) {
    const copy = m.apps[app.id];
    const tag = document.querySelector(`[data-app="${app.id}"]`);
    tag.querySelector(".tag-kicker").textContent = copy.kicker;
    tag.querySelector(".tag-name").textContent = copy.name;
    tag.querySelector(".tag-desc").textContent = copy.desc;
    tag.querySelector(".enter-label").textContent = m.enter;
    tag.querySelector(".tag-hint-label").textContent = m.offlineHint;
    tag.querySelector(".tag-features").replaceChildren(
      ...copy.features.map((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        return item;
      }),
    );
  }

  fillHelp(m);
  tickClock();
  applyStatus();
}

function setLang(next) {
  if (next === state.lang) return;
  state.lang = next;
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Private mode: keep the choice for this visit only.
  }
  fillTexts();
}

/* ---------- Clock + greeting ---------- */

function tickClock() {
  const m = messages();
  const now = new Date();
  document.getElementById("clock-time").textContent = now.toLocaleTimeString(m.locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  document.getElementById("clock-date").textContent = now.toLocaleDateString(m.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  document.getElementById("greet").textContent = m.greet(now.getHours());
}

/* ---------- Live status: is each app's dev server answering? ---------- */

async function isReachable(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    // Opaque request: resolves if the server answers at all, rejects if the port is closed.
    await fetch(url, { mode: "no-cors", cache: "no-store", signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** One check at a time: a second caller gets the running promise instead of starting a new round. */
function checkAll() {
  if (inflight) return inflight;
  inflight = Promise.all(
    APPS.map(async (app) => {
      state.status[app.id] = (await isReachable(app.url)) ? "online" : "offline";
      applyStatus();
    }),
  ).then(() => {
    state.lastChecked = new Date();
    inflight = null;
    applyStatus();
  });
  return inflight;
}

/** "Check now" in the help panel: run a check, then announce the result to screen readers. */
async function recheckFromHelp() {
  const live = document.getElementById("help-live");
  live.textContent = "";
  await checkAll();
  const online = APPS.filter((app) => state.status[app.id] === "online").length;
  live.textContent = messages().help.recheckDone(online, APPS.length);
}

function applyStatus() {
  const m = messages();
  let online = 0;
  let pending = 0;

  for (const app of APPS) {
    const current = state.status[app.id];
    if (current === "online") online += 1;
    if (current === "checking") pending += 1;

    const statusEl = document.getElementById(`status-${app.id}`);
    statusEl.dataset.state = current;
    statusEl.querySelector(".status-label").textContent = m.status[current];
    document.querySelector(`[data-wrap="${app.id}"]`).classList.toggle("is-offline", current === "offline");

    const led = document.querySelector(`[data-led="${app.id}"]`);
    if (led) led.dataset.state = current;
  }

  document.getElementById("online-count").textContent = pending === APPS.length ? "–" : String(online);
  renderHelpStatus(m, state.status, state.lastChecked);
}

/* ---------- Keyboard: 1 / 2 / 3 (layout independent, top row or numpad), ? / F1 for help ---------- */

function onKeyDown(event) {
  if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;

  if (HELP_KEYS.has(event.key)) {
    // F1 would otherwise open the browser's own help page.
    event.preventDefault();
    toggleHelp();
    return;
  }
  // While the help sheet is open, digits do nothing: it has its own "Open" links.
  if (document.getElementById("help").open) return;

  const app = APPS.find(
    (item) => event.code === `Digit${item.digit}` || event.code === `Numpad${item.digit}`,
  );
  if (!app) return;

  event.preventDefault();
  document.querySelector(`[data-wrap="${app.id}"]`)?.classList.add("is-pressed");
  window.location.assign(app.url);
}

/* ---------- Boot ---------- */

buildTags();
buildHelp({ messages, onRecheck: recheckFromHelp });
fillTexts();
checkAll();

for (const button of document.querySelectorAll("[data-lang]")) {
  button.addEventListener("click", () => setLang(button.dataset.lang));
}
document.addEventListener("keydown", onKeyDown);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkAll();
});
// Coming back with the browser "Back" button (bfcache): reset the pressed tag and refresh statuses.
window.addEventListener("pageshow", () => {
  for (const el of document.querySelectorAll(".is-pressed")) el.classList.remove("is-pressed");
  checkAll();
});

setInterval(checkAll, PING_INTERVAL_MS);
setInterval(tickClock, 15000);
