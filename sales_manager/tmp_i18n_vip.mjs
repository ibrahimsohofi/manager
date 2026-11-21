import fs from "node:fs";
const fr = JSON.parse(fs.readFileSync("src/i18n/locales/fr.json", "utf8"));
const ar = JSON.parse(fs.readFileSync("src/i18n/locales/ar.json", "utf8"));
const get = (o, k) => k.split(".").reduce((a, x) => (a == null ? a : a[x]), o);
const has = (o, k) => { const v = get(o, k); if (typeof v === "string") return true; return ["_one", "_other"].some((s) => typeof get(o, k + s) === "string"); };
const files = {
  "src/components/QrSale.jsx": { tr: "qrSale." },
  "src/components/InvoiceSettingsDialog.jsx": { tr: "invoiceSettings.", label: "qrSale.invoice." },
  "src/components/VipBadge.jsx": {},
  "src/components/Customers.jsx": { tr: null },
  "src/components/CustomerDetails.jsx": { tr: null },
  "src/components/CustomerPicker.jsx": { tr: null },
};
// discover tr prefixes for files marked null
for (const f of Object.keys(files)) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/const (\w+) = useCallback\(\s*\(key, options\) => t\(`([\w.]+)\.\$\{key\}`/g)) files[f][m[1]] = m[2] + ".";
  for (const m of s.matchAll(/const (\w+) = \(key(?:, \w+)?\) => t\(`([\w.]+)\.\$\{key\}`/g)) files[f][m[1]] = m[2] + ".";
}
let bad = 0, total = 0;
for (const [f, helpers] of Object.entries(files)) {
  const s = fs.readFileSync(f, "utf8");
  const keys = new Set();
  for (const m of s.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) keys.add(m[1]);
  for (const [h, p] of Object.entries(helpers)) { if (!p) continue; for (const m of s.matchAll(new RegExp(`\\b${h}\\(\\s*["'\`]([\\w.]+)["'\`]`, "g"))) keys.add(p + m[1]); }
  const miss = [...keys].filter((k) => !has(fr, k) || !has(ar, k)).map((k) => `${k}${has(fr, k) ? "" : " -fr"}${has(ar, k) ? "" : " -ar"}`);
  total += keys.size; bad += miss.length;
  console.log(`${f.split("/").pop()} helpers=${JSON.stringify(helpers)} keys=${keys.size} missing=${miss.length}`, miss);
}
console.log(`TOTAL keys resolved: ${total}, missing: ${bad}`);
// Spec list (plan §5 chunk 7)
const spec = ["qrSale.invoice.title","qrSale.invoice.number","qrSale.invoice.date","qrSale.invoice.billedTo","qrSale.invoice.phone","qrSale.invoice.customerNumber","qrSale.invoice.colRef","qrSale.invoice.colName","qrSale.invoice.colUnitPrice","qrSale.invoice.colQty","qrSale.invoice.colTotal","qrSale.invoice.items","qrSale.invoice.total","qrSale.invoice.print","qrSale.invoice.notIssued","qrSale.invoice.retry","qrSale.invoice.vipNotice","customers.vip.label","customers.vip.hint","customers.vip.badge","customers.vip.filter"];
console.log("spec keys missing:", spec.filter((k) => !has(fr, k) || !has(ar, k)));
// fr/ar parity within VIP namespaces
const flat = (o, p = "", out = []) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) flat(v, p ? `${p}.${k}` : k, out); else out.push(p); return out; };
for (const ns of ["qrSale.invoice", "customers.vip", "invoiceSettings"]) {
  const a = flat(get(fr, ns)), b = flat(get(ar, ns));
  console.log(`${ns}: fr=${a.length} ar=${b.length} onlyFr=${a.filter((k) => !b.includes(k))} onlyAr=${b.filter((k) => !a.includes(k))}`);
}
