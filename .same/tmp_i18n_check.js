import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sales_manager");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const get = (o, k) => k.split(".").reduce((a, p) => (a ? a[p] : undefined), o);
const L = {
  fr: JSON.parse(read("src/i18n/locales/fr.json")),
  ar: JSON.parse(read("src/i18n/locales/ar.json")),
};

const keys = new Set();
for (const f of ["src/components/SupplierLedgerShared.jsx", "src/components/SupplierLedgerEntry.jsx"]) {
  for (const m of read(f).matchAll(/\btr\(\s*[`"]([^`"]+)[`"]/g)) keys.add(m[1]);
}

const TYPES = ["purchase", "payment", "return"];
const sub = [
  [/\$\{state\}/, ["owed", "credit", "settled"]],
  [/\$\{type\}/, TYPES],
  [/\$\{form\.type\}/, TYPES],
  [/\$\{method\}/, ["cash", "check", "bank_transfer", "lcn", "other"]],
  [/\$\{saved\?\.type[^}]*\}/, TYPES],
  [/\$\{errorKey[^}]*\}/, ["load", "network", "supplierNotFound", "entryNotFound"]],
];

const missing = [];
let checked = 0;
for (const k of keys) {
  let list = [k];
  for (const [re, vals] of sub) if (re.test(k)) list = vals.map((v) => k.replace(re, v));
  for (const key of list) {
    for (const [lang, l] of Object.entries(L)) {
      checked++;
      const v = get(l.supplierLedger, key);
      const plural = get(l.supplierLedger, `${key}_other`);
      if (typeof v !== "string" && typeof plural !== "string") missing.push(`${lang}: ${key}`);
    }
  }
}
for (const [lang, l] of Object.entries(L)) {
  if (!get(l, "suppliersPage.table.newEntry")) missing.push(`${lang}: suppliersPage.table.newEntry`);
}
console.log("keys used:", keys.size, "checks:", checked, "missing:", missing);
