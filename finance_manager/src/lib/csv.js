// CSV for the accountant: ";" separator and decimal comma (what French / Moroccan Excel expects),
// UTF-8 BOM so Arabic labels open correctly. Amounts are written without thousands separators.

const cell = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(Math.round(value * 100) / 100).replace(".", ",") : "";
  }
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * @param {string} filename  e.g. "finances-2026.csv"
 * @param {string[]} header
 * @param {Array<Array<string|number|null>>} rows
 */
export const downloadCsv = (filename, header, rows) => {
  const lines = [header, ...rows].map((row) => row.map(cell).join(";"));
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
