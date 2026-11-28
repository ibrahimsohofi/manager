// Amount in words for the A4 invoice ("Arrêté à la somme de : …"), the line every Moroccan
// trade document carries under the total. French (traditional spelling) and Arabic.
// Dirhams + centimes, up to 999 999 999,99. Anything larger returns "" (the line is hidden).

// ---------- French ----------

const FR_UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];
const FR_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

// 0..99
const frBelow100 = (n) => {
  if (n < 17) return FR_UNITS[n];
  if (n < 20) return `dix-${FR_UNITS[n - 10]}`;
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten < 7) {
    if (unit === 0) return FR_TENS[ten];
    if (unit === 1) return `${FR_TENS[ten]} et un`;
    return `${FR_TENS[ten]}-${FR_UNITS[unit]}`;
  }
  // 70..79 = soixante + 10..19
  if (ten === 7) return n === 71 ? "soixante et onze" : `soixante-${frBelow100(n - 60)}`;
  // 80..99 = quatre-vingt + 0..19
  return n === 80 ? "quatre-vingts" : `quatre-vingt-${frBelow100(n - 80)}`;
};

// 0..999. `final`: nothing follows, so "cents" / "quatre-vingts" keep their plural "s"
// ("deux cents", but "deux cent mille").
const frBelow1000 = (n, final) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundred === 1) parts.push("cent");
  else if (hundred > 1) parts.push(`${FR_UNITS[hundred]} cent${rest === 0 && final ? "s" : ""}`);
  if (rest) parts.push(rest === 80 && !final ? "quatre-vingt" : frBelow100(rest));
  return parts.join(" ");
};

const frNumber = (n) => {
  if (n === 0) return FR_UNITS[0];
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (millions) parts.push(`${frBelow1000(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${frBelow1000(thousands, false)} mille`);
  if (rest) parts.push(frBelow1000(rest, true));
  return parts.join(" ");
};

// "deux dirhams", "un million de dirhams" (round millions take "de")
const frCounted = (n, singular, plural) => {
  const roundMillions = n >= 1e6 && n % 1e6 === 0;
  return `${frNumber(n)} ${roundMillions ? "de " : ""}${n > 1 ? plural : singular}`;
};

// ---------- Arabic ----------

const AR_UNITS = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const AR_TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

// 1..999 ("مائتان وخمسون", "خمسة وعشرون")
const arBelow1000 = (n) => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (hundred) parts.push(AR_HUNDREDS[hundred]);
  if (rest) {
    if (rest < 10) parts.push(AR_UNITS[rest]);
    else if (rest < 20) parts.push(AR_TEENS[rest - 10]);
    else {
      const unit = rest % 10;
      const ten = AR_TENS[Math.floor(rest / 10)];
      parts.push(unit ? `${AR_UNITS[unit]} و${ten}` : ten);
    }
  }
  return parts.join(" و");
};

// Thousands / millions: 1 -> "ألف", 2 -> "ألفان", 3..10 -> "ثلاثة آلاف", 11..99 -> "أحد عشر ألفا",
// round hundreds -> "مائة ألف"
const arScale = (n, [one, two, plural, accusative]) => {
  if (n === 1) return one;
  if (n === 2) return two;
  const lastTwo = n % 100;
  let noun = one;
  if (lastTwo >= 3 && lastTwo <= 10) noun = plural;
  else if (lastTwo >= 11) noun = accusative;
  return `${arBelow1000(n)} ${noun}`;
};

const arNumber = (n) => {
  if (n === 0) return "صفر";
  const millions = Math.floor(n / 1e6);
  const thousands = Math.floor((n % 1e6) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (millions) parts.push(arScale(millions, ["مليون", "مليونان", "ملايين", "مليونا"]));
  if (thousands) parts.push(arScale(thousands, ["ألف", "ألفان", "آلاف", "ألفا"]));
  if (rest) parts.push(arBelow1000(rest));
  return parts.join(" و");
};

// Counted noun after the number: 1 -> "درهم واحد", 2 -> "درهمان", 3..10 -> "دراهم",
// 11..99 -> "درهما", round hundreds / thousands -> "درهم"
const arCounted = (n, [one, two, plural, accusative]) => {
  if (n === 1) return `${one} واحد`;
  if (n === 2) return two;
  const lastTwo = n % 100;
  let noun = one;
  if (lastTwo >= 3 && lastTwo <= 10) noun = plural;
  else if (lastTwo >= 11) noun = accusative;
  return `${arNumber(n)} ${noun}`;
};

const AR_DIRHAM = ["درهم", "درهمان", "دراهم", "درهما"];
const AR_CENTIME = ["سنتيم", "سنتيمان", "سنتيمات", "سنتيما"];

// ---------- public ----------

/**
 * @param {number|string} value - amount in dirhams (e.g. 1250.4)
 * @param {"fr"|"ar"} lang
 * @returns {string} "Mille deux cent cinquante dirhams et quarante centimes" / "ألف ومائتان وخمسون درهما وأربعون سنتيما"
 */
export const amountInWords = (value, lang = "fr") => {
  const amount = Math.abs(Number(value));
  if (!Number.isFinite(amount)) return "";
  const cents = Math.round(amount * 100);
  const dirhams = Math.floor(cents / 100);
  const centimes = cents % 100;
  if (dirhams > 999999999) return "";

  if (lang === "ar") {
    const words = arCounted(dirhams, AR_DIRHAM);
    return centimes ? `${words} و${arCounted(centimes, AR_CENTIME)}` : words;
  }

  const words = frCounted(dirhams, "dirham", "dirhams");
  const full = centimes ? `${words} et ${frCounted(centimes, "centime", "centimes")}` : words;
  return full.charAt(0).toUpperCase() + full.slice(1);
};
