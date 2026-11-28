// Help panel: an instruction sheet (native <dialog>, modal) that slides in from the inline-end side.
// Opened by the "?" buttons and the ? / F1 keys (see main.js), closed by Esc, the X button or a click outside.
// Static texts use data-i18n in index.html; this module builds the lists and fills the dynamic parts.

import { APPS } from "./apps.js";
import { ARROW_ICON, UI_ICONS } from "./icons.js";

const COPIED_MS = 1600;
const MIN_SPIN_MS = 700;
const CLOSE_FALLBACK_MS = 450;
const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "[::1]"]);

const dialog = document.getElementById("help");
const sheet = dialog.querySelector(".help-sheet");
const copyTimers = new WeakMap();

let getMessages = () => null;
let opener = null;
let closing = false;
let pointerDownOnBackdrop = false;

/* ---------- Structure (built once; texts are filled by fillHelp) ---------- */

function keyRow(keys, textId) {
  const kbds = keys.map((key) => `<kbd>${key}</kbd>`).join('<span class="help-key-or">/</span>');
  return `<div class="help-key"><dt>${kbds}</dt><dd data-key-text="${textId}"></dd></div>`;
}

const copyButton = () =>
  `<button type="button" class="help-copy" data-i18n-label="help.copy">
    <span data-icon="copy" aria-hidden="true"></span><span data-icon="check" aria-hidden="true"></span>
  </button>`;

export function buildHelp({ messages, onRecheck }) {
  getMessages = messages;

  document.getElementById("help-keys").innerHTML = [
    ...APPS.map((app) => keyRow([String(app.digit)], `open-${app.id}`)),
    keyRow(["?", "F1"], "help"),
    keyRow(["Esc"], "close"),
  ].join("");

  const appList = document.getElementById("help-apps");
  appList.innerHTML = APPS.map(
    (app) => `
      <li class="help-app" data-help-app="${app.id}" data-state="checking">
        <span class="help-app-num" aria-hidden="true">0${app.digit}</span>
        <span class="help-app-main">
          <span class="help-app-name"></span>
          <span class="help-app-meta">
            <span><span data-port="page"></span> <bdi dir="ltr">:${app.port}</bdi></span>
            <span><span data-port="api"></span> <bdi dir="ltr">:${app.apiPort}</bdi></span>
          </span>
          <span class="help-app-folder">${app.folder}/</span>
        </span>
        <span class="help-app-side">
          <span class="status help-app-status" data-state="checking">
            <span class="status-dot"></span><span class="status-label"></span>
          </span>
          <a class="help-app-open">
            <span class="help-app-open-label"></span>
            <span class="enter-arrow" aria-hidden="true">${ARROW_ICON}</span>
          </a>
        </span>
      </li>`,
  ).join("");
  for (const app of APPS) {
    appList.querySelector(`[data-help-app="${app.id}"] .help-app-open`).href = app.url;
  }

  // Commands contain "&&": set them as text, never as HTML.
  const commands = document.getElementById("help-cmds");
  commands.innerHTML = APPS.map(
    (app) => `<div class="help-cmd" data-help-app="${app.id}"><code></code>${copyButton()}</div>`,
  ).join("");
  for (const app of APPS) {
    const command = `cd ${app.folder} && bun run dev`;
    const row = commands.querySelector(`[data-help-app="${app.id}"]`);
    row.querySelector("code").textContent = command;
    row.querySelector(".help-copy").dataset.copy = command;
  }

  // Address to type on a tablet / phone: the one this page was opened with.
  const { protocol, host, hostname } = window.location;
  const address = `${protocol}//${host}`;
  document.getElementById("help-address").textContent = address;
  document.getElementById("help-address-copy").dataset.copy = address;
  document.getElementById("help-lan-local").hidden = !LOCAL_HOSTS.has(hostname);

  for (const el of dialog.querySelectorAll("[data-icon]")) {
    el.innerHTML = UI_ICONS[el.dataset.icon];
  }

  for (const button of document.querySelectorAll("[data-help-open]")) {
    button.addEventListener("click", openHelp);
  }
  dialog.querySelector("[data-help-close]").addEventListener("click", closeHelp);
  // Click outside the sheet closes, but not a text selection that started inside and ended outside.
  dialog.addEventListener("pointerdown", (event) => {
    pointerDownOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener("click", (event) => {
    if (pointerDownOnBackdrop && event.target === dialog) closeHelp();
    pointerDownOnBackdrop = false;
  });
  // Esc: play the closing animation instead of the instant native close.
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHelp();
  });
  dialog.addEventListener("close", onClosed);
  dialog.addEventListener("click", onCopyClick);

  const recheck = document.getElementById("help-recheck");
  recheck.addEventListener("click", async () => {
    if (recheck.classList.contains("is-spinning")) return;
    recheck.classList.add("is-spinning");
    recheck.setAttribute("aria-busy", "true");
    // Closed ports answer instantly: keep the spin visible long enough to be seen.
    await Promise.all([onRecheck(), new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS))]);
    recheck.classList.remove("is-spinning");
    recheck.setAttribute("aria-busy", "false");
  });
}

/* ---------- Texts (FR / AR) ---------- */

export function fillHelp(m) {
  const texts = { help: m.help.keyHelp, close: m.help.keyClose };
  for (const app of APPS) texts[`open-${app.id}`] = m.help.keyOpen(m.apps[app.id].name);
  for (const el of dialog.querySelectorAll("[data-key-text]")) {
    el.textContent = texts[el.dataset.keyText];
  }

  for (const app of APPS) {
    const row = dialog.querySelector(`.help-app[data-help-app="${app.id}"]`);
    row.querySelector(".help-app-name").textContent = m.apps[app.id].name;
    row.querySelector('[data-port="page"]').textContent = m.help.page;
    row.querySelector('[data-port="api"]').textContent = m.help.api;
    const link = row.querySelector(".help-app-open");
    link.querySelector(".help-app-open-label").textContent = m.help.openApp;
    link.setAttribute("aria-label", m.help.keyOpen(m.apps[app.id].name));
  }
}

/* ---------- Live status (called by main.js after every check) ---------- */

export function renderHelpStatus(m, status, lastChecked) {
  for (const app of APPS) {
    const current = status[app.id];
    const row = dialog.querySelector(`.help-app[data-help-app="${app.id}"]`);
    row.dataset.state = current;
    const badge = row.querySelector(".help-app-status");
    badge.dataset.state = current;
    badge.querySelector(".status-label").textContent = m.status[current];
  }

  document.getElementById("help-last").textContent = lastChecked
    ? m.help.lastCheck(
        lastChecked.toLocaleTimeString(m.locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      )
    : m.help.checkingNow;
}

/* ---------- Open / close ---------- */

export function openHelp() {
  if (dialog.open) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  closing = false;
  dialog.classList.remove("is-closing");
  dialog.querySelector(".help-body").scrollTop = 0;
  dialog.showModal();
  document.documentElement.classList.add("help-open");
}

export function closeHelp() {
  if (!dialog.open || closing) return;
  closing = true;
  dialog.classList.add("is-closing");

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    sheet.removeEventListener("animationend", onEnd);
    dialog.close();
  };
  // Children animate too (status dots, sections): only the sheet's own exit animation counts.
  const onEnd = (event) => {
    if (event.target === sheet && event.animationName === "sheet-out") finish();
  };
  sheet.addEventListener("animationend", onEnd);
  setTimeout(finish, CLOSE_FALLBACK_MS);
}

export function toggleHelp() {
  if (dialog.open) closeHelp();
  else openHelp();
}

// Also runs when the browser closes the dialog by itself (e.g. Esc pressed twice quickly).
function onClosed() {
  closing = false;
  dialog.classList.remove("is-closing");
  document.documentElement.classList.remove("help-open");
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  opener = null;
}

/* ---------- Copy buttons ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No Clipboard API on plain http from another device (http://192.168.x.x) or in some iframes.
    // The textarea must live inside the modal dialog: everything outside it is inert.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "sr-only";
    dialog.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

async function onCopyClick(event) {
  const button = event.target instanceof Element ? event.target.closest(".help-copy") : null;
  if (!button?.dataset.copy) return;

  const copied = await copyText(button.dataset.copy);
  button.focus({ preventScroll: true });
  if (!copied) {
    // Last resort: select the command so Ctrl+C works.
    const code = button.parentElement.querySelector("code");
    if (code) window.getSelection()?.selectAllChildren(code);
    return;
  }

  const setLabel = (key) => {
    const text = getMessages().help[key];
    button.setAttribute("aria-label", text);
    button.title = text;
  };
  button.classList.add("is-copied");
  setLabel("copied");
  clearTimeout(copyTimers.get(button));
  copyTimers.set(
    button,
    setTimeout(() => {
      button.classList.remove("is-copied");
      setLabel("copy");
    }, COPIED_MS),
  );
}
