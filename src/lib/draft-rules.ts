import type { DraftFields } from "@/lib/draft-extract";

/**
 * Free, offline parser for Indonesian WhatsApp property ads (no API calls).
 *
 * It reads what is explicitly written and leaves everything else null, so a human reviewer fills the gaps; whenever
 * it had to guess, or found two plausible readings, the field name goes into `uncertain` ("Check: ...").
 * Never trust a number just because it looks like one: prices, areas and room counts are only taken from a label,
 * a unit or a known shorthand, and numbers that belong to something else (down payment, installments, floors, road
 * kilometre markers, phone numbers, years) are deliberately skipped.
 *
 * `bun run parser:check` runs the regression suite (hand-written ads + thousands of generated variations).
 */

/* ============================== data ============================== */

const UNITS: Record<string, number> = { miliar: 1e9, milyar: 1e9, billion: 1e9, bn: 1e9, m: 1e9, juta: 1e6, jt: 1e6, million: 1e6, mio: 1e6, ribu: 1e3, rb: 1e3, k: 1e3 };

const ACRONYMS = new Set([
  "SHM", "SHGB", "HGB", "HGU", "HPL", "AJB", "PPJB", "IMB", "PBG", "AC", "CCTV", "PLN", "KPR", "BU", "LT", "LB", "KT", "KM",
  "WC", "RT", "RW", "BTN", "VIP", "CBD", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "ART", "BSD", "TKP",
]);

/** Province names (and common short forms) as they should appear in the form. */
const PROVINCES: [string, RegExp][] = [
  ["Sulawesi Selatan", /\b(?:sulawesi\s+selatan|sul[\s-]?sel)\b/i],
  ["Sulawesi Barat", /\b(?:sulawesi\s+barat|sul[\s-]?bar)\b/i],
  ["Sulawesi Tengah", /\b(?:sulawesi\s+tengah|sul[\s-]?teng)\b/i],
  ["Sulawesi Tenggara", /\b(?:sulawesi\s+tenggara|sul[\s-]?tra)\b/i],
  ["Sulawesi Utara", /\b(?:sulawesi\s+utara|sul[\s-]?ut)\b/i],
  ["Gorontalo", /\bprovinsi\s+gorontalo\b/i],
  ["DKI Jakarta", /\b(?:dki\s+jakarta|daerah\s+khusus\s+ibukota)\b/i],
  ["Jawa Barat", /\b(?:jawa\s+barat|jabar)\b/i],
  ["Jawa Tengah", /\b(?:jawa\s+tengah|jateng)\b/i],
  ["Jawa Timur", /\b(?:jawa\s+timur|jatim)\b/i],
  ["Banten", /\bprovinsi\s+banten\b/i],
  ["DI Yogyakarta", /\b(?:di\s+yogyakarta|d\.?i\.?\s*yogyakarta|daerah\s+istimewa\s+yogyakarta)\b/i],
  ["Bali", /\bprovinsi\s+bali\b/i],
  ["Sumatera Utara", /\b(?:sumatera\s+utara|sumut)\b/i],
  ["Sumatera Barat", /\b(?:sumatera\s+barat|sumbar)\b/i],
  ["Sumatera Selatan", /\b(?:sumatera\s+selatan|sumsel)\b/i],
  ["Riau", /\bprovinsi\s+riau\b/i],
  ["Kepulauan Riau", /\b(?:kepulauan\s+riau|kepri)\b/i],
  ["Lampung", /\bprovinsi\s+lampung\b/i],
  ["Kalimantan Timur", /\b(?:kalimantan\s+timur|kaltim)\b/i],
  ["Kalimantan Selatan", /\b(?:kalimantan\s+selatan|kalsel)\b/i],
  ["Kalimantan Barat", /\b(?:kalimantan\s+barat|kalbar)\b/i],
  ["Nusa Tenggara Barat", /\b(?:nusa\s+tenggara\s+barat|ntb)\b/i],
  ["Nusa Tenggara Timur", /\b(?:nusa\s+tenggara\s+timur|ntt)\b/i],
  ["Maluku", /\bprovinsi\s+maluku\b/i],
  ["Papua", /\bprovinsi\s+papua\b/i],
];

/** Cities/regencies recognised even without "Kota"/"Kab.", with the province they imply. `strict` = ambiguous common word, so only the capitalised form counts. */
const PLACES: { names: string[]; label: string; province: string; strict?: boolean }[] = [
  ...["Makassar", "Gowa", "Maros", "Takalar", "Barru", "Sinjai", "Bulukumba", "Jeneponto", "Bantaeng", "Soppeng", "Wajo", "Pinrang", "Enrekang", "Palopo", "Selayar"].map((n) => ({ names: [n], label: n, province: "Sulawesi Selatan" })),
  { names: ["Pangkep", "Pangkajene Kepulauan", "Pangkajene"], label: "Pangkajene Dan Kepulauan", province: "Sulawesi Selatan" },
  { names: ["Parepare", "Pare-Pare", "Pare Pare"], label: "Parepare", province: "Sulawesi Selatan" },
  { names: ["Sidrap", "Sidenreng Rappang"], label: "Sidenreng Rappang", province: "Sulawesi Selatan" },
  { names: ["Tana Toraja"], label: "Tana Toraja", province: "Sulawesi Selatan" },
  { names: ["Toraja Utara"], label: "Toraja Utara", province: "Sulawesi Selatan" },
  { names: ["Luwu Utara"], label: "Luwu Utara", province: "Sulawesi Selatan" },
  { names: ["Luwu Timur"], label: "Luwu Timur", province: "Sulawesi Selatan" },
  { names: ["Luwu"], label: "Luwu", province: "Sulawesi Selatan", strict: true },
  { names: ["Bone"], label: "Bone", province: "Sulawesi Selatan", strict: true },
  { names: ["Jakarta"], label: "Jakarta", province: "DKI Jakarta" },
  { names: ["Bandung"], label: "Bandung", province: "Jawa Barat" },
  { names: ["Bogor"], label: "Bogor", province: "Jawa Barat" },
  { names: ["Depok"], label: "Depok", province: "Jawa Barat" },
  { names: ["Bekasi"], label: "Bekasi", province: "Jawa Barat" },
  { names: ["Tangerang Selatan"], label: "Tangerang Selatan", province: "Banten" },
  { names: ["Tangerang"], label: "Tangerang", province: "Banten" },
  { names: ["Surabaya"], label: "Surabaya", province: "Jawa Timur" },
  { names: ["Malang"], label: "Malang", province: "Jawa Timur" },
  { names: ["Sidoarjo"], label: "Sidoarjo", province: "Jawa Timur" },
  { names: ["Semarang"], label: "Semarang", province: "Jawa Tengah" },
  { names: ["Surakarta"], label: "Surakarta", province: "Jawa Tengah" },
  { names: ["Yogyakarta", "Jogja", "Jogjakarta"], label: "Yogyakarta", province: "DI Yogyakarta" },
  { names: ["Denpasar"], label: "Denpasar", province: "Bali" },
  { names: ["Badung"], label: "Badung", province: "Bali" },
  { names: ["Medan"], label: "Medan", province: "Sumatera Utara", strict: true },
  { names: ["Palembang"], label: "Palembang", province: "Sumatera Selatan" },
  { names: ["Pekanbaru"], label: "Pekanbaru", province: "Riau" },
  { names: ["Batam"], label: "Batam", province: "Kepulauan Riau" },
  { names: ["Padang"], label: "Padang", province: "Sumatera Barat", strict: true },
  { names: ["Bandar Lampung"], label: "Bandar Lampung", province: "Lampung" },
  { names: ["Balikpapan"], label: "Balikpapan", province: "Kalimantan Timur" },
  { names: ["Samarinda"], label: "Samarinda", province: "Kalimantan Timur" },
  { names: ["Banjarmasin"], label: "Banjarmasin", province: "Kalimantan Selatan" },
  { names: ["Pontianak"], label: "Pontianak", province: "Kalimantan Barat" },
  { names: ["Manado"], label: "Manado", province: "Sulawesi Utara" },
  { names: ["Kendari"], label: "Kendari", province: "Sulawesi Tenggara" },
  { names: ["Palu"], label: "Palu", province: "Sulawesi Tengah", strict: true },
  { names: ["Gorontalo"], label: "Gorontalo", province: "Gorontalo" },
  { names: ["Mataram"], label: "Mataram", province: "Nusa Tenggara Barat" },
  { names: ["Kupang"], label: "Kupang", province: "Nusa Tenggara Timur" },
  { names: ["Ambon"], label: "Ambon", province: "Maluku" },
  { names: ["Jayapura"], label: "Jayapura", province: "Papua" },
];

/** Words that can follow "kota"/"kec" in ordinary sentences ("kota yang strategis"); never a place name. */
const NOT_A_PLACE = new Set([
  "yang", "dan", "dengan", "di", "dekat", "strategis", "ini", "itu", "luas", "lebar", "besar", "pusat", "tengah", "dalam", "luar",
  "sebelah", "depan", "belakang", "dari", "ke", "untuk", "atau", "ada", "tidak", "bisa", "siap", "baru", "murah", "mewah", "bagus",
  "nyaman", "aman", "asri", "sejuk", "ramai", "tua", "lama", "lain", "sekitar", "area", "daerah", "wilayah", "kawasan", "jalan", "jl",
  "cluster", "perumahan", "perum", "komplek", "kompleks", "btn", "ruko", "rumah", "tanah", "tersedia", "ready", "sisa", "bonus", "free", "hanya", "serius", "boleh", "terima", "harga",
]);

const PROPERTY: [RegExp, string][] = [
  [/\b(?:rumah\s*toko|ruko|shop\s*house|shophouse)\b/i, "ruko"],
  [/\b(?:rumah\s*kantor|rukan|kantor|office|perkantoran|gedung\s*kantor)\b/i, "office"],
  [/\b(?:apartemen|apartement|apartment|apt|condotel|kondotel|condominium|kondominium|condo|studio|susun|rusun|rusunami)\b/i, "apartment"],
  [/\b(?:villa|vila)\b/i, "villa"],
  [/\b(?:gudang|gdg|warehouse|pergudangan|pabrik|factory)\b/i, "warehouse"],
  [/\b(?:tanah|tnh|kavling|kaveling|lahan|kebun|sawah|tambak|land|plot)\b/i, "land"],
  [/\b(?:rumah\s*kost|rumah|rmh|rmah|house|townhouse|town\s*house|cluster|perumahan|hunian|home)\b/i, "house"],
  [/\b(?:kost|kos|kosan|kos-kosan|homestay|hotel|kios|ruang\s*usaha|toko)\b/i, "other"],
];

const FACILITIES: [RegExp, string][] = [
  [/\bcarport\b/i, "Carport"],
  [/\b(?:garasi|garage)\b/i, "Garage"],
  [/\b(?:kolam\s*renang|swimming\s*pool|private\s*pool)\b/i, "Swimming pool"],
  [/\b(?:taman|garden)\b/i, "Garden"],
  [/\bac\b/i, "AC"],
  [/\b(?:water\s*heater|pemanas\s*air)\b/i, "Water heater"],
  [/(?<!\bun)(?<!\bnon[\s-])(?<!\btidak\s)\b(?:full\s*furnish(?:ed)?|semi\s*furnish(?:ed)?|furnish(?:ed)?)\b/i, "Furnished"],
  [/\b(?:security|satpam|one\s*gate|keamanan\s*24|24\s*jam\s*security)\b/i, "Security 24h"],
  [/\bcctv\b/i, "CCTV"],
  [/\b(?:gym|fitness|fitnes)\b/i, "Gym"],
];

/* ============================== small helpers ============================== */

/** "1,2" -> 1.2 ; "1.200.000" -> 1200000 ; "120,5" -> 120.5 ; "1.500" -> 1500. */
function toNumber(raw: string, allowDecimal: boolean): number {
  const s = raw.trim();
  const parts = s.split(/[.,]/);
  if (parts.length === 1) return Number(s);
  const last = parts[parts.length - 1];
  const isDecimal = allowDecimal && parts.length === 2 && last.length <= 2;
  return isDecimal ? Number(`${parts[0]}.${last}`) : Number(parts.join(""));
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

const lineStart = (text: string, i: number) => text.lastIndexOf("\n", i - 1) + 1;
const lineEnd = (text: string, i: number) => {
  const e = text.indexOf("\n", i);
  return e < 0 ? text.length : e;
};

/** Cleans a message into something every reader below can rely on. */
function normalize(raw: string): string {
  return raw
    .slice(0, 6000)
    .normalize("NFKC") // full-width digits/colons, "m²" -> "m2", ligatures
    // Copied from a WhatsApp chat: "[18/10/26 13.45] Budi: ..." or "18/10/2026, 13.45 - Budi: ..." at the start of a line
    .replace(/^[ \t]*\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}[.:]\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\]?\s*(?:[-–]\s*)?(?:~\s*)?[^:\n]{1,40}:[ \t]*/gim, "")
    .replace(/^[ \t]*(?:~\s*[^\n:]{1,30}$|forwarded|diteruskan)\s*$/gim, "")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u20E3]/gu, " ") // emoji used as bullets
    .replace(/[×✕✖]/g, "x")
    .replace(/((?:rp|idr)\.?[ \t]*\d{1,3})((?:[ ]\d{3}){2,})(?!\d)/gi, (_, a: string, b: string) => a + b.replace(/ /g, "")) // "Rp 850 000 000"
    .replace(/[*~]/g, "") // WhatsApp bold/strike markers
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1") // italic markers
    .replace(/[ \t]+/g, " ");
}

/** The value after a "Label :" at the start of a line (bullets and dashes before the label are fine). */
function labelled(text: string, names: string): string | null {
  const m = text.match(new RegExp(String.raw`(?:^|\n)[^\p{L}\p{N}\n]*(?:${names})[^\S\n]*[:=][^\S\n]*([^\n]+)`, "iu"));
  return m ? m[1].trim() : null;
}

/* ============================== listing & property type ============================== */

const SALE = /\b(?:dijual(?:kan)?|jual|for\s*sale|over\s*kredit|oper\s*kredit|take\s*over|dijual\s*cepat)\b/i;
const RENT = /\b(?:disewakan|disewa|dikontrakkan|dikontrakan|kontrakan|for\s*rent|for\s*lease|lease|sewa)\b/i;
const RENT_WEAK = /\b(?:kost|kos|kosan|kos-kosan)\b/i;

function findListingType(text: string, title: string, period: boolean): { type: "sell" | "rent" | null; both: boolean } {
  const sale = text.search(SALE);
  const rent = text.search(RENT);
  const both = SALE.test(title) && RENT.test(title);
  if (sale < 0 && rent < 0) {
    if (RENT_WEAK.test(text)) return { type: "rent", both: false };
    return { type: period ? "rent" : null, both: false };
  }
  return { type: rent < 0 || (sale >= 0 && sale < rent) ? "sell" : "rent", both };
}

/** Title line first (that is where agents state what they sell); else the earliest property word anywhere. */
function findPropertyType(text: string, title: string, lines: string[]): { type: string | null; ambiguous: boolean } {
  const earliest = (s: string) =>
    PROPERTY.map(([re, t]) => ({ t, i: s.search(re) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
  const inTitle = earliest(title);
  if (inTitle.length) {
    // "rumah dan tanah", "ruko + rumah", "gudang/kantor": two kinds joined in the headline -> the reviewer decides.
    const first = PROPERTY.find(([, t]) => t === inTitle[0].t)![0];
    const end = (title.match(first)?.index ?? 0) + (title.match(first)?.[0].length ?? 0);
    const joined = inTitle.slice(1).some((x) => x.t !== inTitle[0].t && /^[\s,]*(?:dan|\+|&|dengan|plus|beserta|\/)\s*(?:\p{L}+\s+){0,1}$/iu.test(title.slice(end, x.i)));
    return { type: inTitle[0].t, ambiguous: joined };
  }
  // No headline names a property: look in the ad's prose first (lines like "Luas Tanah : 180 m2" only use the word as a label).
  const prose = lines.map(stripLead).filter((l) => !FIELD_LINE.test(l)).join("\n");
  const inProse = earliest(prose);
  const inText = inProse.length ? inProse : earliest(text);
  return { type: inText[0]?.t ?? null, ambiguous: new Set(inText.map((x) => x.t)).size > 1 };
}

/* ============================== title ============================== */

const GREETING = /^(?:assalamu\s*['’]?\s*alaikum|assalamualaikum|salam|halo|hai|hi|hello|selamat\s+\p{L}+|permisi|dear|info|update|promo|ready|open\s*house|good\s+(?:morning|afternoon|evening)|bismillah|dm|wa|ig)\b/iu;
/** Lines that state a field ("Harga ...", "Luas tanah : 180 m2", "Tanah 112 m2", "Sewa Rp ..."), never the headline. */
const FIELD_LINE = new RegExp(
  String.raw`^(?:(?:tanah|lahan|bangunan|gedung|luas(?:\s+(?:tanah|bangunan))?|lt|lb|ukuran|tipe|type|sewa|harga\s+sewa)[ \t]*[:=]?[ \t]*(?:\d|rp\b|idr\b)|` +
    String.raw`(?:harga|hrg|price|biaya|listrik|daya|pln|kamar|kt|km|alamat|lokasi|letak|fasilitas|sertifikat|surat|legalitas|hub|hubungi|wa|telp|tlp|hp|info|contact|call|deposit|dp|cicilan|komisi|fee|cashback|diskon|dibangun|jarak|lantai|blok|rt|rw|tersedia|sisa|bonus|free|ready|booking|sewa[ \t]*[:=])\b)`,
  "iu",
);
/** 2 = names the deal ("dijual", "disewakan"), 1 = names a property; field lines and greetings score 0. */
const headlineScore = (l: string) => (FIELD_LINE.test(l) ? 0 : (SALE.test(l) || RENT.test(l) ? 2 : 0) + (PROPERTY.some(([re]) => re.test(l)) ? 1 : 0));

const stripLead = (raw: string) => raw.replace(/^[^\p{L}\p{N}]+|[\s:\-–]+$/gu, "").trim();

function pickTitle(lines: string[]): string | null {
  let best: { l: string; score: number } | null = null;
  let fallback: string | null = null;
  for (const raw of lines) {
    const l = stripLead(raw);
    if ((l.match(/\p{L}/gu) ?? []).length < 4 || GREETING.test(l)) continue;
    const score = headlineScore(l);
    if (score > 0 && (!best || score > best.score)) best = { l, score };
    if (!fallback && l.length >= 8 && !FIELD_LINE.test(l) && !/^[\p{L} .]{1,25}\s*[:=]/u.test(l)) fallback = l;
  }
  const pick = best?.l ?? fallback;
  return pick ? tidyTitle(pick) : null;
}

function tidyTitle(s: string): string {
  let t = s.replace(/\s+/g, " ").trim();
  const letters = t.replace(/[^\p{L}]/gu, "");
  const upper = (letters.match(/\p{Lu}/gu) ?? []).length;
  if (letters.length >= 6 && upper / letters.length >= 0.8) {
    t = t.toLowerCase().replace(/\p{L}[\p{L}']*/gu, (w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
  }
  if (t.length > 80) t = t.slice(0, 80).replace(/\s+\S*$/, "");
  return t;
}

/* ============================== money ============================== */

type Amount = { value: number; start: number; end: number; strong: boolean; perM2: boolean; period: "month" | "year" | "other" | null; range: boolean; old: boolean };

/** Things people write next to an amount that is NOT the price. */
const NOT_PRICE_CONTEXT =
  /\b(?:dp|d\.p|uang\s*muka|cicil\w*|angsur\w*|booking|tanda\s*jadi|fee|komisi|pajak|bphtb|cashback|diskon|potongan|bonus|biaya(?!\s*(?:sewa|jual|kontrak))|ipl|service\s*charge|deposit|maintenance|iuran|pbb|admin|notaris|provisi|bunga|plafon|kpr|hasil|pendapatan|omzet|penghasilan|income|roi|yield|profit|untung|balik\s*modal)\b[^\n\d]{0,14}$/i;
const STRONG_LABEL = /\b(?:harga|hrg|price|sewa|jual|nilai|hanya|only|cuma|mulai|jadi|menjadi|sekarang|now)\b[^\n\d]{0,18}$/i;
/** A long bare number after these is a certificate/ID/account/room figure, not a price. */
const ID_NUMBER_CONTEXT = /\b(?:no|nomor|sertifikat|shm|hgb|shgb|nik|npwp|rek|rekening|kode|id|kamar\s*tidur|kamar\s*mandi|kt|km|bedrooms?|bathrooms?)\b\.?[ \t]*[:=]?[ \t]*$/i;
const PHONE_LABEL = /\b(?:wa|hub|hubungi|hp|telp|tlp|call|contact|cp|telepon|whatsapp|no|info|nomor)\b[^\n\d]{0,8}$/i;

function findAmounts(text: string): Amount[] {
  const re = /((?:rp|idr)\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)\s*((miliar|milyar|billion|bn|juta|jt|million|mio|ribu|rb)(?:-?an)?|m|k)?(?![A-Za-z0-9])/gi; // groups: 1 = "Rp", 2 = number, 3 = unit (+ "an": "jutaan"), 4 = the unit word
  const out: Amount[] = [];
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    const before = text.slice(lineStart(text, idx), idx);
    const after = text.slice(end, lineEnd(text, end));
    const numStr = m[2];
    const unitRaw = m[4] ?? m[3];
    let unit = unitRaw?.toLowerCase();
    const rp = !!m[1];

    // A range like "500 - 600 jt": the unit is written once, after the second number.
    let range = false;
    if (!unit && !rp) {
      const r = after.match(/^\s*(?:-|–|—|s\/d|sd|sampai|hingga)\s*(?:rp\.?\s*)?\d[\d.,]*\s*(miliar|milyar|billion|juta|jt|million)\b/i);
      if (r) {
        unit = r[1].toLowerCase();
        range = true;
      }
    }
    const value = unit ? toNumber(numStr, true) * UNITS[unit] : toNumber(numStr, false);
    const perM2 = /^\s*(?:\/|per\s*)\s*(?:m2|m\b|meter)/i.test(after);
    if (!Number.isFinite(value) || value < (perM2 ? 1000 : 100_000) || value > 1e13) continue;
    if (NOT_PRICE_CONTEXT.test(before)) continue;

    const strongLabel = STRONG_LABEL.test(before);
    let ok = false;
    if (rp) ok = true;
    else if (range) ok = true;
    else if (unit === "miliar" || unit === "milyar" || unit === "juta" || unit === "jt" || unit === "billion" || unit === "bn" || unit === "million" || unit === "mio") ok = true;
    else if (unitRaw === "M") {
      // A capital M is "miliar" ("1,8M"), unless it follows an area label or a distance ("500 M dari pantai").
      const afterAreaLabel = /\b(?:lt|lb|luas|tanah|bangunan|ukuran|jarak|lebar|panjang|jalan|tinggi)\b[^\n\d]{0,4}$/i.test(before);
      // "Tanah 120 M" is an area, but "Tanah 1.25M" cannot be (no plot is 1 m2): under 10 it is miliar.
      ok = (!afterAreaLabel || toNumber(numStr, true) < 10) && !/^\s*(?:dari|ke|from|to|dr|x|\*)\b/i.test(after);
    } else if (unit) ok = strongLabel; // ribu / rb / k / lowercase m need an explicit price label
    else if (strongLabel && /^\d{1,3}(?:[.,]\d{3})+$|^\d{7,}$/.test(numStr)) ok = true;
    else if (/^\d{1,3}(?:[.,]\d{3}){2,}$/.test(numStr)) ok = true; // "850.000.000" with no label at all
    else if (/^[1-9]\d{8,12}$/.test(numStr) && !/^(?:8|62)/.test(numStr) && !PHONE_LABEL.test(before) && !ID_NUMBER_CONTEXT.test(before)) ok = true;
    if (!ok) continue;
    // Phone numbers written with dots/commas ("0812.3456.7890") are not money.
    if (/^0\d{5,}$/.test(numStr) || /[+]\s*$/.test(before) || (PHONE_LABEL.test(before) && !strongLabel && !rp && !unit)) continue;

    const per = after.match(/^\s*(?:\/|per\s*|setiap\s*)\s*(bulan|bln|tahun|thn|th|year|yr|month|mo)\b/i) ?? after.match(/^\s{0,2}(bulanan|tahunan|monthly|yearly|annually)\b/i);
    let period: Amount["period"] = null;
    if (per) period = /^(?:bulan|bln|month|mo|bulanan|monthly)/i.test(per[1]) ? "month" : "year";
    // "/malam", "/hari", "/minggu": a nightly or weekly rate is neither monthly nor yearly, and must not borrow a period from elsewhere in the ad
    else if (!perM2 && /^\s*(?:\/|per\s*|setiap\s*)\s*(?:malam|hari|minggu|pekan|day|night|week|jam|hour)\b/i.test(after)) period = "other";
    const old = /^\s*(?:jadi|menjadi|sekarang|now|turun|->|=>|→)/i.test(after) && !/^\s*(?:\/|per)/i.test(after);
    out.push({ value: Math.round(value), start: idx, end, strong: strongLabel || rp, perM2, period, range, old });
  }
  return out;
}

/**
 * Which amount is "the price". In a sale ad an amount with "/bulan" is rental income or an installment; in a rental ad
 * the per-period amount is the price. The first labelled amount wins, then the first with "Rp", then simply the first.
 */
function pickPrice(text: string, all: Amount[], type: "sell" | "rent" | null): { price: Amount | null; multiple: boolean } {
  all = all.filter((a) => !a.old);
  const preferred = type === "sell" ? all.filter((a) => !a.period) : type === "rent" ? all.filter((a) => a.period) : [];
  if (preferred.length) all = preferred;
  if (!all.length) return { price: null, multiple: false };
  const labelled = all.find((a) => STRONG_LABEL.test(text.slice(lineStart(text, a.start), a.start)));
  const price = labelled ?? all.find((a) => a.strong) ?? all[0];
  const distinct = new Set(all.map((a) => `${a.value}${a.perM2}`));
  return { price, multiple: distinct.size > 1 };
}

/* ============================== areas ============================== */

const NUM_AREA = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)`;
const AREA_UNIT = String.raw`(?:\s*(m2|m\^2|mtr2?|meter(?:\s*persegi)?|sqm|ha|hektar|hektare|are)\b)?`;

function areaValue(num: string, unit: string | undefined): number {
  const v = toNumber(num, true);
  if (unit && /^(?:ha|hektar|hektare)$/i.test(unit)) return v * 10_000;
  if (unit && /^are$/i.test(unit)) return v * 100;
  return v;
}

/** First labelled match of at least 10 m2 (smaller is "lt 2" = floor 2, not land). */
function labelledArea(text: string, labels: string, needUnit: boolean): number | null {
  const re = new RegExp(String.raw`(?<![\p{L}])(?:${labels})\.?\s*[:=]?\s*[±≈]?\s*${NUM_AREA}${AREA_UNIT}`, "giu");
  for (const m of text.matchAll(re)) {
    if (needUnit && !m[2]) continue;
    const v = areaValue(m[1], m[2]);
    if (v >= 10) return Math.round(v * 100) / 100;
  }
  return null;
}

function findAreas(text: string, propertyType: string | null): { land: number | null; building: number | null; ambiguous: number | null } {
  let land: number | null = null;
  let building: number | null = null;

  // "LT/LB 120/90", "LB/LT 90/120", "tipe 36/72", "type 45"
  const pair = text.match(/(?<![\p{L}])(LT|LB)\s*\/\s*(LT|LB)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/iu);
  if (pair && pair[1].toUpperCase() !== pair[2].toUpperCase()) {
    const [a, b] = [toNumber(pair[3], true), toNumber(pair[4], true)];
    if (pair[1].toUpperCase() === "LT") [land, building] = [a, b];
    else [building, land] = [a, b];
  }
  const tipe = text.match(/\b(?:tipe|type)\s*[:=]?\s*(\d{2,3})(?:\s*\/\s*(\d{2,4}))?\b/i);
  if (tipe) {
    building ??= Number(tipe[1]);
    if (tipe[2]) land ??= Number(tipe[2]);
  }

  // On an apartment "lt 15" is the floor, so LT is never land there.
  if (propertyType !== "apartment") {
    land ??= labelledArea(text, "LT|L\\.?\\s*T|luas\\s*tanah|l\\.?\\s*tanah|luas\\s*lahan", false);
  }
  land ??= labelledArea(text, "tanah|lahan|land|lot\\s*size|plot", true);
  building ??= labelledArea(text, "LB|L\\.?\\s*B|luas\\s*bangunan|l\\.?\\s*bangunan|luas\\s*gedung|building\\s*size|built(?:[\\s-]*up)?", false) ?? labelledArea(text, "bangunan|gedung|building", true);
  // Number first: "200 sqm land", "150 m2 building", "300 m2 tanah"
  const numberFirst = (words: string) => {
    for (const m of text.matchAll(new RegExp(String.raw`(?<![\d.,])${NUM_AREA}\s*(?:m2|m\^2|mtr2?|sqm|sq\.?\s*m|meter(?:\s*persegi)?)\s*(?:of\s+)?(?:${words})\b`, "gi"))) {
      const v = toNumber(m[1], true);
      if (v >= 10) return v;
    }
    return null;
  };
  land ??= numberFirst("land|lot|plot|tanah|lahan");
  building ??= numberFirst("building|built|bangunan|gedung");
  // Hectares anywhere in a land ad ("Tanah dijual 2 hektar").
  if (land === null && (propertyType === "land" || propertyType === null)) {
    const ha = text.match(/(?<![\d.,])(\d{1,3}(?:[.,]\d+)?)\s*(?:ha|hektar|hektare)\b/i);
    if (ha) land = Math.round(toNumber(ha[1], true) * 10_000);
  }

  // Plot size as dimensions: "ukuran 10x20" -> 200 m2 (a "bangunan" label before it makes it the building).
  const dim = text.match(/(?<![\d.,])(\d{1,3}(?:[.,]\d+)?)\s*x\s*(\d{1,3}(?:[.,]\d+)?)(?![\d])(?![.,]\d)/i);
  if (dim && (land === null || building === null)) {
    const m2 = Math.round(toNumber(dim[1], true) * toNumber(dim[2], true) * 100) / 100;
    const prefix = text.slice(Math.max(0, (dim.index ?? 0) - 24), dim.index);
    if (m2 >= 10 && m2 <= 1e6) {
      if (/\b(?:bangunan|lb)\b[^\n]{0,12}$/i.test(prefix)) building ??= m2;
      else land ??= m2;
    }
  }

  // "Luas 1000 m2 bangunan 800 m2": a bare "luas" next to a labelled building is the plot.
  const bareLuas = labelledArea(text, "luas", true);
  if (land === null && building !== null && bareLuas !== null && bareLuas !== building && propertyType !== "apartment") land = bareLuas;

  // An unlabelled "Luas 500 m2" / "500 m2": land for land ads, building for apartments/offices/shops; otherwise ambiguous.
  let ambiguous: number | null = null;
  if (land === null && building === null) {
    const bare = labelledArea(text, "luas", true) ?? (() => {
      for (const m of text.matchAll(new RegExp(String.raw`(?<![\d.,])${NUM_AREA}\s*(?:m2|mtr2?|sqm|meter\s*persegi)\b`, "gi"))) {
        const v = toNumber(m[1], true);
        if (v >= 10) return v;
      }
      return null;
    })();
    if (bare !== null) {
      if (propertyType === "land") land = bare;
      else if (propertyType === "apartment" || propertyType === "office" || propertyType === "ruko" || propertyType === "warehouse") building = bare;
      else ambiguous = bare;
    }
  }
  return { land, building, ambiguous };
}

/* ============================== rooms ============================== */

type RoomLabel = { kind: "bed" | "bath"; start: number; end: number };
type NumTok = { value: number; start: number; end: number };

const NUMBER_WORDS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };

/** Words that can sit right before a room count without being a road name ("luas 80 meter KM 1"). */
const SPEC_UNIT_WORDS = new Set(["meter", "m", "m2", "mtr", "watt", "w", "va", "jt", "juta", "miliar", "milyar", "nego", "lantai", "unit", "tahun", "bulan", "bln", "thn", "shm", "hgb", "shgb", "ajb", "wa", "hp"]);

function findRooms(text: string): { bedrooms: number | null; bathrooms: number | null } {
  const labels: RoomLabel[] = [];
  const add = (re: RegExp, kind: RoomLabel["kind"], guardKm = false) => {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      // "Km 10" after a road name is a kilometre marker, not bathrooms: a real "KM 2" follows a number, punctuation or line start.
      if (guardKm && /^k\.?m\.?$/i.test(m[0])) {
        const lineBefore = text.slice(lineStart(text, start), start);
        const prevWord = lineBefore.trimEnd().match(/([\p{L}]+)$/u)?.[1]?.toLowerCase();
        if (prevWord && !SPEC_UNIT_WORDS.has(prevWord)) continue;
        // "Jl. Kapasa Raya No. 39 Km 11": on a street line, only "KT 3 KM 2" (a bedroom label just before) is a room count.
        const streetLine = /\b(?:jl|jln|jalan|poros|lorong|lr|gang|gg|raya)\b/i.test(lineBefore);
        const bedJustBefore = /(?:kamar\s*tidur|k\.?\s*t\.?|kt|br|bedrooms?)\W*\d*\W*$/i.test(lineBefore.slice(-26));
        if (streetLine && !bedJustBefore) continue;
      }
      labels.push({ kind, start, end: start + m[0].length });
    }
  };
  add(/(?<![\p{L}])(?:kamar\s*tidur|k\.?\s*tidur|kmr\s*tidur|bed\s*rooms?|bedrooms?|k\.t\.?|kt|br)(?![\p{L}])/giu, "bed");
  add(/(?<![\p{L}])(?:kamar\s*mandi(?:\s*\/\s*wc)?|k\.?\s*mandi|kmr\s*mandi|bath\s*rooms?|bathrooms?|k\.?m\.?\s*\/\s*wc|k\.m\.?|km|ba|wc|toilet)(?![\p{L}])/giu, "bath", true);
  const bedStrong = labels.some((l) => l.kind === "bed");
  // A bare "kamar" ("3 kamar") counts only when nothing like "semua kamar" / "setiap kamar" precedes it
  if (!bedStrong) add(/(?<!(?:semua|seluruh|tiap|setiap|masing[\s-]*masing|tiap-tiap)\s)(?<![\p{L}])kamar(?!\s*(?:mandi|tidur))(?![\p{L}])/giu, "bed");
  labels.sort((a, b) => a.start - b.start);

  // Candidate counts: small integers that are not an area, price, floor, house number, year...
  const nums: NumTok[] = [];
  const numRe = /(\d{1,2})(?:[ \t]*\+[ \t]*\d{1,2})?(?![\d])(?![ \t]*[.,]\d)/g; // "3+1" (3 bedrooms + a maid's room) is one count: 3
  for (const m of text.matchAll(numRe)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = text.slice(Math.max(0, start - 14), start);
    // Part of a longer number ("1.200", "+1", "120/90")? Checked here rather than with a lookbehind, which is quadratic in some regex engines.
    if (/[\d.,+]$/.test(before) || /\d[ \t]*\/[ \t]*$/.test(before)) continue;
    const after = text.slice(end, end + 14);
    // A count is not a house number, floor, price... ("Blok A12 No 5", "Lantai 3"), but "2 lantai 3 kamar" has a count after "lantai".
    const owner = before.match(/\b(rp|lt|lb|no|nomor|blok|tipe|type|lantai|luas|harga|jl|rt|rw|pos|kav|kavling|unit|lot|km|k)\.?[ \t]*[:=]?[ \t]*$/i);
    if (owner && !/\b(?:kt|km|br|ba|wc)\.?[ \t]*[:=]?[ \t]*$/i.test(before) && !(/^(?:lantai|unit)$/i.test(owner[1]) && /\d[ \t]*$/.test(before.slice(0, owner.index)))) continue;
    if (/^[ \t]*(?:m2|m\b|meter|jt|juta|miliar|watt|va\b|w\b|lantai|lt\b|tahun|thn|bulan|bln|unit|mobil|motor|orang|jam|hari|menit|detik|sekolah|pasar|kali|%|[x*][ \t]*\d)/i.test(after)) continue;
    nums.push({ value: Number(m[1]), start, end });
  }
  // Spelled-out counts: "tiga kamar tidur", "dua kamar mandi"
  for (const m of text.matchAll(/(?<![\p{L}])(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)(?![\p{L}])/giu)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (/^[ \t]*(?:m2|m\b|meter|jt|juta|miliar|watt|va\b|w\b|lantai|tahun|bulan|unit|mobil|motor|orang|jam|hari|sekolah|pasar|menit)/i.test(text.slice(end, end + 14))) continue;
    nums.push({ value: NUMBER_WORDS[m[1].toLowerCase()], start, end });
  }
  nums.sort((a, b) => a.start - b.start);

  // Which side of its label does a count sit on in this ad ("KT 3 KM 2" vs "3 kamar tidur 2 kamar mandi")?
  const before = (l: RoomLabel) => nums.filter((n) => n.end <= l.start && /^[ ]{0,2}$/.test(text.slice(n.end, l.start))).pop();
  const afterNum = (l: RoomLabel) => nums.find((n) => n.start >= l.end && /^[ \t:=\-–.]{0,4}$/.test(text.slice(l.end, n.start)));
  const adj = new Map<NumTok, number>();
  for (const l of labels) for (const n of [before(l), afterNum(l)]) if (n) adj.set(n, (adj.get(n) ?? 0) + 1);
  let votesBefore = 0;
  let votesAfter = 0;
  for (const l of labels) {
    const b = before(l);
    const a = afterNum(l);
    if (b && adj.get(b) === 1) votesBefore++;
    if (a && adj.get(a) === 1) votesAfter++;
  }
  const preferAfter = votesAfter >= votesBefore;

  const taken = new Set<NumTok>();
  const result: Record<"bed" | "bath", number | null> = { bed: null, bath: null };
  for (const l of labels) {
    if (result[l.kind] !== null) continue;
    const cands = preferAfter ? [afterNum(l), before(l)] : [before(l), afterNum(l)];
    const pick = cands.find((n): n is NumTok => !!n && !taken.has(n));
    if (pick) {
      taken.add(pick);
      result[l.kind] = pick.value;
    }
  }
  return { bedrooms: result.bed, bathrooms: result.bath };
}

/* ============================== electricity, phone, location, notes ============================== */

function findWatts(text: string): number | null {
  const W = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d{3,6})`;
  const m =
    text.match(new RegExp(String.raw`(?:daya\s*listrik|listrik|pln|daya)\s*[:=]?\s*${W}\s*(?:w|watt|va)?\b`, "i")) ??
    text.match(new RegExp(String.raw`(?<![\d.,])${W}\s*(?:watt|va|w)\b`, "i"));
  if (!m) return null;
  const v = Number(m[1].replace(/[.,]/g, ""));
  return v >= 100 && v <= 1_000_000 ? v : null;
}

function findPhone(text: string): { phone: string; name: string | null } | null {
  const mobile = /(?<![\d])(?:\+?62|0)[\s.-]?8\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{2,5}(?![\d])/;
  const landline = /(?<![\d])0(?:2\d|3\d|4\d{1,2}|5\d|6\d|7\d)[\s.-]?\d{5,8}(?![\d])/;
  const m = text.match(mobile) ?? text.match(landline);
  if (!m) return null;
  const digits = m[0].replace(/[\s.-]/g, "");
  if (digits.replace(/\D/g, "").length < 9) return null;
  const idx = m.index ?? 0;
  const before = text.slice(lineStart(text, idx), idx);
  const after = text.slice(idx + m[0].length, lineEnd(text, idx));
  const name =
    before.match(/(?:hub(?:ungi)?|contact|cp|wa|telp|call|info|admin)[\s.:]*(?:(?:pak|bu|bapak|ibu|mas|mbak|kak|om|tante)\s+)?([\p{Lu}][\p{L}]{2,14})\s*[:\-]?\s*$/iu)?.[1] ??
    after.match(/^\s*\(([\p{L}][\p{L} .]{1,24})\)/u)?.[1];
  return { phone: digits, name: name ? titleCase(name.trim()) : null };
}

const ADMIN_SEGMENT = /^\s*(?:kel(?:urahan)?|kec(?:amatan)?|kota|kab(?:upaten)?|prov(?:insi)?|desa|sulawesi|sulsel|makassar|gowa|maros|\d{5})\b/i;
const SPEC_WORDS = /\b(?:harga|hrg|lantai|unit|listrik|lt|lb|kt|km|shm|hgb|nego|rp)\b/i;

/** "Jl. X No. 5, Kel. Y, 3 lantai, harga ..." -> the street part only. */
function streetOnly(line: string): string | null {
  const start = line.search(/\b(?:jl|jln|jalan|perumahan|perum|komplek|kompleks|btn|cluster|blok|poros|lorong|lr|gang|gg)\b/i);
  const from = (start >= 0 ? line.slice(start) : line).replace(/[^\p{L}\p{N}.,/ -]+/gu, " ");
  const parts: string[] = [];
  for (const seg of from.split(",")) {
    if (parts.length && (ADMIN_SEGMENT.test(seg) || SPEC_WORDS.test(seg))) break;
    parts.push(seg.trim());
  }
  const out = parts.join(", ").replace(/\s+/g, " ").trim().slice(0, 150);
  return out.length >= 3 ? out : null;
}

/** Words that end a place name when an ad has no punctuation ("Kab. Bantaeng Legalitas SHM ..."). */
const END_WORDS =
  "kec(?:amatan)?|kel(?:urahan)?|desa|kota|kab(?:upaten)?|prov(?:insi)?|rt|rw|no|nomor|blok|sulawesi|sulsel|dekat|depan|belakang|harga|hrg|price|lt|lb|kt|km|luas|listrik|shm|shgb|hgb|ajb|girik|ppjb|nego|rp|" +
  "legalitas|sertifikat|surat|fasilitas|ada|dp|cicilan|komisi|diskon|bisa|siap|hub|hubungi|call|telp|tlp|wa|hp|info|contact|dibangun|tahun|lantai|kamar|carport|garasi|gym|cctv|ac|" +
  "dijual|disewakan|dikontrakkan|jarak|deposit|fee|cashback|bonus|terima|serius|boleh|bagus|strategis|murah|cepat|full|furnished|kolam|security|water|pln|daya|akses|row|ukuran|aman|nyaman";

const placeKey = (n: string) => n.toLowerCase().replace(/[\s-]+/g, " ").trim();
const KNOWN_KEYS = new Map<string, { label: string; province: string }>();
for (const p of PLACES) for (const n of p.names) KNOWN_KEYS.set(placeKey(n), { label: p.label, province: p.province });

type Found = { name: string; start: number; end: number };

/** The place name after "Kec.", "Kota", ... (with where it sits in the text, so it can be masked later). */
function placeAfter(text: string, prefixes: string, isCity = false): Found | null {
  const re = new RegExp(String.raw`(?<![\p{L}])(?:${prefixes})(?![\p{L}])[ \t]*[:=]?[ \t]*([A-Za-z][A-Za-z'’-]*(?:[ \t]+[A-Za-z][A-Za-z'’-]*){0,4})`, "giu");
  const stop = new RegExp(String.raw`^(?:${END_WORDS})$`, "i");
  for (const m of text.matchAll(re)) {
    const words = m[1].trim().split(/[ \t]+/);
    if (NOT_A_PLACE.has(words[0].toLowerCase()) || stop.test(words[0])) continue;
    // Keep words until a stop word ("Legalitas", "Ready") or, for a district/village, the start of the city name.
    let keep = words.length;
    for (let i = 1; i < words.length; i++) {
      const cityStarts = !isCity && [2, 1].some((n) => i + n <= words.length && KNOWN_KEYS.has(placeKey(words.slice(i, i + n).join(" "))));
      if (stop.test(words[i]) || cityStarts) { keep = i; break; }
    }
    let name = words.slice(0, keep);
    if (isCity) {
      // a city is the longest known name the words start with, else at most two words
      const known = [3, 2, 1].map((n) => name.slice(0, n)).find((w) => w.length && KNOWN_KEYS.has(placeKey(w.join(" "))));
      name = known ?? name.slice(0, 2);
    }
    const text2 = name.join(" ");
    const start = (m.index ?? 0) + m[0].length - m[1].length;
    return { name: titleCase(text2), start, end: start + text2.length };
  }
  return null;
}

/** Replaces the given spans with spaces (so a district called "Wajo Baru" is not mistaken for the Wajo regency). */
function mask(text: string, spans: (Found | null)[]): string {
  let out = text;
  for (const f of spans) if (f) out = out.slice(0, f.start) + " ".repeat(f.end - f.start) + out.slice(f.end);
  return out;
}

function findKnownPlace(text: string): { label: string; province: string } | null {
  let best: { label: string; province: string; i: number } | null = null;
  for (const p of PLACES) {
    for (const n of p.names) {
      const re = new RegExp(String.raw`(?<![\p{L}])${n.replace(/ /g, "\\s+")}(?![\p{L}])`, p.strict ? "u" : "iu");
      const i = text.search(re);
      if (i >= 0 && (!best || i < best.i)) best = { label: p.label, province: p.province, i };
    }
  }
  return best;
}

const CERTIFICATES: [RegExp, string][] = [
  [/\b(?:shm|sertifikat\s*hak\s*milik|hak\s*milik)\b/i, "SHM"],
  [/\b(?:shgb|sertifikat\s*hak\s*guna\s*bangunan)\b/i, "SHGB"],
  [/\bhgb\b/i, "HGB"],
  [/\bhgu\b/i, "HGU"],
  [/\bhpl\b/i, "HPL"],
  [/\bstrata\s*title\b/i, "Strata Title"],
  [/\bajb\b/i, "AJB"],
  [/\bppjb\b/i, "PPJB"],
  [/\bgirik\b/i, "Girik"],
  [/\bfreehold\b/i, "SHM"],
  [/\bleasehold\b/i, "HGB"],
];

const FREE_TEXT_LABELS = "fasilitas(?:\\s*lain)?|keunggulan|kelebihan|keterangan|catatan|note|spesifikasi|spek|kondisi|info\\s*tambahan|akses";

/* ============================== main ============================== */

export function parseListingRules(raw: string): DraftFields {
  const text = normalize(raw);
  const lines = text.split("\n").map((l) => l.trim());
  const title = pickTitle(lines);

  // --- price first: its period ("/bulan") also helps decide sale vs rent
  const amounts = findAmounts(text);
  const globalPeriod = /(?:\/|per\s*)\s*(?:tahun|thn|year|yr)\b|\b(?:tahunan|yearly|annually)\b/i.test(text)
    ? "year"
    : /(?:\/|per\s*)\s*(?:bulan|bln|month)\b|\b(?:bulanan|monthly)\b/i.test(text)
      ? "month"
      : null;
  const hasYear = /(?:\/|per\s*)\s*(?:tahun|thn|year|yr)\b/i.test(text);
  const hasMonth = /(?:\/|per\s*)\s*(?:bulan|bln|month)\b/i.test(text);

  const { type: listingType, both } = findListingType(text, title ?? "", amounts.some((a) => a.period) || hasYear || hasMonth);
  const { price: priced, multiple } = pickPrice(text, amounts, listingType);
  const { type: propertyType, ambiguous: typeAmbiguous } = findPropertyType(text, title ?? "", lines);
  const { land, building, ambiguous: areaAmbiguous } = findAreas(text, propertyType);
  const { bedrooms, bathrooms } = findRooms(text);

  // price per m2 ("2jt/m2") needs the land area
  let price: number | null = null;
  if (priced) price = priced.perM2 ? (land ? Math.round(priced.value * land) : null) : priced.value;

  const rentalPeriod: DraftFields["rentalPeriod"] =
    listingType !== "rent" ? null : priced?.period === "other" ? null : (priced?.period ?? (hasYear && !hasMonth ? "year" : hasMonth && !hasYear ? "month" : globalPeriod));

  // --- location
  const addressLabel = labelled(text, "alamat(?:\\s*lengkap)?|lokasi|location|letak|posisi");
  const street = text.match(/^.*\b(?:jl|jln|jalan)\b\.?\s+[^\n]+/im)?.[0];
  const complex = text.match(/^.*\b(?:perumahan|perum|komplek|kompleks|btn|cluster)\s+[^\n]+/im)?.[0];
  const areaPhrase = text.match(/\b(?:daerah|area|kawasan|wilayah)\s+([A-Za-z][A-Za-z' -]{2,30}?)(?=\s*(?:[,;/()\n]|$))/i)?.[1];
  const address =
    (addressLabel ? streetOnly(addressLabel) : null) ?? (street ? streetOnly(street) : null) ?? (complex ? streetOnly(complex) : null) ?? (areaPhrase ? titleCase(areaPhrase) : null);
  const districtF = placeAfter(text, "kec\\.?|kecamatan");
  const villageF = placeAfter(text, "kel\\.?|kelurahan|desa");
  const district = districtF?.name ?? null;
  const village = villageF?.name ?? null;
  const known = findKnownPlace(mask(text, [districtF, villageF]));
  const labelledCity = placeAfter(text, "kota|kab\\.?|kabupaten", true)?.name ?? null;
  // A known city beats a parsed one that is clearly not a city ("kota yang strategis" is already filtered; this covers odd leftovers).
  const city = labelledCity && !(known && !PLACES.some((p) => p.label.toLowerCase() === labelledCity.toLowerCase() || p.names.some((n) => n.toLowerCase() === labelledCity.toLowerCase())) && labelledCity.split(/\s+/).length > 2) ? labelledCity : (known?.label ?? null);
  const province = PROVINCES.find(([, re]) => re.test(text))?.[0] ?? placeAfter(text, "prov\\.?|provinsi")?.name ?? (known && (!labelledCity || labelledCity.toLowerCase() === known.label.toLowerCase()) ? known.province : null);
  const postalCode = text.match(/\bkode\s*pos\s*[:=]?\s*(\d{5})\b/i)?.[1] ?? null;

  // --- contact, coordinates, maps link
  const phone = findPhone(text);
  const coords = text.match(/(-?\d{1,2}\.\d{4,})\s*[,;/ ]\s*(\d{2,3}\.\d{4,})/);
  const mapsLink = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|share\.google|g\.co\/kgs)\S*/i)?.[0];

  // --- facilities and notes
  const facilities = FACILITIES.filter(([re]) => re.test(text)).map(([, n]) => n);
  const certificate = CERTIFICATES.find(([re]) => re.test(text))?.[1];
  const floorsM = text.match(/(?<![\d.,])(?:(\d{1,2}(?:[.,]5)?)|(satu|dua|tiga|empat|lima))\s*(?:lantai|tingkat)\b/i);
  const floors = floorsM ? (floorsM[1] ?? String(NUMBER_WORDS[floorsM[2].toLowerCase()])) : undefined;
  const orientation = text.match(/\b(?:hadap|menghadap)\s+(?:ke\s+)?(utara|selatan|timur|barat|barat\s*laut|barat\s*daya|timur\s*laut|tenggara)\b/i)?.[1];
  const road = text.match(/\b(?:lebar\s*jalan|jalan\s*lebar|akses\s*jalan|row\s*jalan|jalan)\s*[:=]?\s*(\d{1,2}(?:[.,]\d)?)\s*(?:m|meter|mtr)\b/i)?.[1];
  const freeText = [...text.matchAll(new RegExp(String.raw`(?:^|\n)[^\p{L}\p{N}\n]*(?:${FREE_TEXT_LABELS})[^\S\n]*[:=][^\S\n]*([^\n]+)`, "giu"))]
    .map((m) => m[1].trim().slice(0, 200));
  const notes = [
    certificate && `Certificate: ${certificate}`,
    /\bnego(?:siasi|\s*tipis)?\b/i.test(text) ? "Price negotiable" : /\b(?:harga\s*pas|fixed\s*price|nett?\s*(?:price)?\b|no\s*nego)\b/i.test(text) ? "Price fixed" : null,
    floors && `Floors: ${floors}`,
    orientation && `Faces ${titleCase(orientation)}`,
    road && `Road width: ${road} m`,
    ...freeText.map((t) => `Details: ${t}`),
    mapsLink && `Maps: ${mapsLink}`,
    areaAmbiguous !== null && `Area (land or building not stated): ${areaAmbiguous} m2`,
  ].filter(Boolean).join("\n") || null;

  const typesOnLines = new Set(lines.map((l) => PROPERTY.find(([re]) => re.test(l))?.[1]).filter(Boolean));
  const manyListings = multiple && typesOnLines.size >= 2;
  const addressOrPlace = !!(address || city || district || village);
  const uncertain = [
    (!listingType || both) && "listingType",
    (!price || multiple || priced?.range || priced?.perM2 && !land) && "price",
    (!propertyType || typeAmbiguous || manyListings) && "propertyType",
    !addressOrPlace && "location",
    listingType === "rent" && !rentalPeriod && "rentalPeriod",
    land === null && building === null && "size",
    (propertyType === "house" || propertyType === "apartment" || propertyType === "villa") && bedrooms === null && "bedrooms",
  ].filter(Boolean) as string[];

  return {
    title: title ?? ([listingType === "rent" ? "Disewakan" : listingType === "sell" ? "Dijual" : null, propertyType && titleCase(propertyType)].filter(Boolean).join(" ") || null),
    listingType,
    price,
    rentalPeriod,
    propertyType,
    address,
    village,
    district,
    city,
    province,
    postalCode,
    landArea: land,
    buildingArea: building,
    bedrooms,
    bathrooms,
    electricityWatts: findWatts(text),
    facilities,
    contactPhone: phone?.phone ?? null,
    contactName: phone?.name ?? null,
    latitude: coords ? Number(coords[1]) : null,
    longitude: coords ? Number(coords[2]) : null,
    notes,
    uncertain,
  };
}
