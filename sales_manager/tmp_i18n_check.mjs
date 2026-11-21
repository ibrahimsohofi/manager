import fs from "node:fs";
import path from "node:path";
const L = (f) => fs.readFileSync(`src/i18n/locales/${f}.json`, "utf8");
const fr = JSON.parse(L("fr")), ar = JSON.parse(L("ar"));
const flat = (o, p = "", out = {}) => { for (const [k, v] of Object.entries(o)) { const key = p ? `${p}.${k}` : k; if (v && typeof v === "object" && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; };
const F = flat(fr), A = flat(ar);
const onlyFr = Object.keys(F).filter((k) => !(k in A)), onlyAr = Object.keys(A).filter((k) => !(k in F));
console.log("total keys fr/ar:", Object.keys(F).length, Object.keys(A).length);
console.log("only in fr:", onlyFr.length, onlyFr.slice(0, 40));
console.log("only in ar:", onlyAr.length, onlyAr.slice(0, 40));
// placeholders
const ph = (s) => (String(s).match(/{{\s*\w+\s*}}/g) || []).map((x) => x.replace(/\s/g, "")).sort().join(",");
const phDiff = Object.keys(F).filter((k) => k in A && ph(F[k]) !== ph(A[k]));
console.log("placeholder mismatch:", phDiff.map((k) => `${k}: fr[${ph(F[k])}] ar[${ph(A[k])}]`));
// empty values
console.log("empty fr:", Object.keys(F).filter((k) => F[k] === ""), "empty ar:", Object.keys(A).filter((k) => A[k] === ""));
// duplicate keys per object (raw text scan with a tiny tokenizer)
function dupes(text) {
  const stack = [], res = []; let i = 0, expectKey = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "{") { stack.push(new Set()); expectKey = true; i++; continue; }
    if (c === "}") { stack.pop(); i++; continue; }
    if (c === "[") { stack.push(null); i++; continue; }
    if (c === "]") { stack.pop(); i++; continue; }
    if (c === ",") { expectKey = stack.at(-1) instanceof Set; i++; continue; }
    if (c === '"') { let j = i + 1, s = ""; while (text[j] !== '"') { if (text[j] === "\\") { s += text[j] + text[j + 1]; j += 2; } else s += text[j++]; } 
      if (expectKey && stack.at(-1) instanceof Set) { if (stack.at(-1).has(s)) res.push(s); stack.at(-1).add(s); expectKey = false; }
      i = j + 1; continue; }
    i++;
  }
  return res;
}
console.log("dup keys fr:", dupes(L("fr")), "ar:", dupes(L("ar")));
// keys used in code
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p); } };
walk("src");
const used = new Map();
for (const f of files) { const s = fs.readFileSync(f, "utf8"); for (const m of s.matchAll(/\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g)) { if (!used.has(m[1])) used.set(m[1], new Set()); used.get(m[1]).add(path.basename(f)); } }
const isNs = (o, k) => { const v = k.split(".").reduce((a, x) => a && a[x], o); return v && typeof v === "object"; };
const plural = (M, k) => [`${k}_one`, `${k}_other`, `${k}_zero`, `${k}_few`, `${k}_many`, `${k}_two`].some((x) => x in M);
const vipRe = /^(qrSale\.invoice|customers\.vip|invoiceSettings)\./;
const missing = [];
for (const [k, fs_] of used) { const mf = !(k in F) && !isNs(fr, k) && !plural(F, k), ma = !(k in A) && !isNs(ar, k) && !plural(A, k); if (mf || ma) missing.push(`${vipRe.test(k) ? "[VIP] " : ""}${k} ${mf ? "-fr" : ""}${ma ? "-ar" : ""} (${[...fs_].join(",")})`); }
console.log("used keys:", used.size, "missing:", missing.length); missing.forEach((m) => console.log("  ", m));
// VIP keys defined but unused
const vipDefined = Object.keys(F).filter((k) => vipRe.test(k));
const unused = vipDefined.filter((k) => !used.has(k));
console.log("VIP keys defined but not referenced via literal t():", unused);
