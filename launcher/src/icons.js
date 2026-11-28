const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;

export const APP_ICONS = {
  // Box: catalogue and stock
  products: svg(
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/><path class="accent" d="M12 22V12"/><path class="accent" d="m7.5 4.27 9 5.15"/>',
  ),
  // Scanner frame: QR till and sales
  sales: svg(
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path class="accent" d="M8 7v10"/><path class="accent" d="M12 7v10"/><path class="accent" d="M16 7v10"/>',
  ),
  // Line chart: expenses and profit
  finance: svg('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path class="accent" d="m19 9-5 5-4-4-3 3"/>'),
};

export const ARROW_ICON = svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>');

// Help panel
export const UI_ICONS = {
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  copy: svg(
    '<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  ),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  refresh: svg(
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  ),
};
