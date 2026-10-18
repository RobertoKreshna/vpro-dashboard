import type { DraftFields } from "@/lib/draft-extract";

/**
 * Free, offline parser for Indonesian WhatsApp property ads (no API calls).
 * It only fills what it can read with confidence; everything else stays null for the reviewer.
 */

const UNITS: Record<string, number> = {
  miliar: 1e9, milyar: 1e9, m: 1e9, juta: 1e6, jt: 1e6, ribu: 1e3, rb: 1e3, k: 1e3,
};

/** "1,2" -> 1.2 ; "1.200.000" -> 1200000 ; "120,5" -> 120.5 ; "1.500" -> 1500. */
function toNumber(raw: string, allowDecimal: boolean): number {
  const s = raw.trim();
  const parts = s.split(/[.,]/);
  if (parts.length === 1) return Number(s);
  const last = parts[parts.length - 1];
  const isDecimal = allowDecimal && parts.length === 2 && last.length <= 2;
  return isDecimal ? Number(`${parts[0]}.${last}`) : Number(parts.join(""));
}

function parsePrice(text: string): { value: number; perM2: boolean } | null {
  const NUM = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)`;
  const UNIT = String.raw`(miliar|milyar|juta|jt|ribu|rb|m|k)(?![a-z0-9²])`;
  const candidates: RegExp[] = [
    // after a label: "Harga: 1,2 M", "Harga Rp 850.000.000"
    new RegExp(String.raw`(?:harga|hrg|price|sewa)\s*(?:nego|net)?\s*[:=]?\s*(?:rp\.?\s*)?${NUM}\s*(?:${UNIT})?`, "i"),
    // after "Rp"
    new RegExp(String.raw`rp\.?\s*${NUM}\s*(?:${UNIT})?`, "i"),
    // number with an unambiguous unit
    new RegExp(String.raw`${NUM}\s*(miliar|milyar|juta|jt)(?![a-z])`, "i"),
    // bare capital M ("1,8M", "2.5 M") = miliar; lowercase "m" is metres. Not right after LT/LB/luas.
    new RegExp(String.raw`(?<!\b(?:LT|LB|luas)\s*[:=]?\s*)\b${NUM}\s*(M)(?![A-Za-z0-9²])`),
  ];
  for (const re of candidates) {
    const m = text.match(re);
    if (!m) continue;
    const unit = m[2]?.toLowerCase();
    const value = unit ? toNumber(m[1], true) * UNITS[unit] : toNumber(m[1], false);
    if (!Number.isFinite(value) || value < 100_000) continue;
    const perM2 = /^\s*(?:\/|per)\s*m(?:2|²|eter)/i.test(text.slice((m.index ?? 0) + m[0].length));
    return { value: Math.round(value), perM2 };
  }
  return null;
}

/** First match >= 10: smaller numbers after "LT" are floors ("rumah lt 2"), not square metres. */
const area = (text: string, labels: string) => {
  for (const m of text.matchAll(new RegExp(String.raw`(?:${labels})\s*[:=]?\s*(\d+(?:[.,]\d+)?)`, "gi"))) {
    const v = toNumber(m[1], true);
    if (v >= 10) return v;
  }
  return null;
};

/**
 * Room counts. Spelled-out words win over abbreviations ("2 kamar mandi" beats the "Km 10" in "Jl. Perintis Km 10"),
 * and an abbreviation on a street line ("Jl. ... Km 10") is a road marker, never a room count.
 */
const count = (text: string, abbr: string, word: string) => {
  const abbrOnStreetLine = (m: RegExpMatchArray) => {
    const lineStart = text.lastIndexOf("\n", m.index ?? 0) + 1;
    return /\b(?:jl|jln|jalan)\b/i.test(text.slice(lineStart, m.index ?? 0));
  };
  const first = (re: RegExp, skip?: (m: RegExpMatchArray) => boolean) => {
    for (const m of text.matchAll(re)) if (!skip?.(m)) return Number(m[1]);
    return null;
  };
  return (
    first(new RegExp(String.raw`\b(?:${word})\s*[:=]\s*(\d+)`, "gi")) ??            // Kamar mandi: 2
    first(new RegExp(String.raw`(\d+)\s*(?:${word})\b`, "gi")) ??                     // 2 kamar mandi
    first(new RegExp(String.raw`\b(?:${abbr})\s*[:=]?\s*(\d+)`, "gi"), abbrOnStreetLine) ?? // KM 2
    first(new RegExp(String.raw`(\d+)\s*(?:${abbr})\b`, "gi")) ??                     // 2KM
    first(new RegExp(String.raw`\b(?:${word})\s+(\d+)`, "gi"))                        // kamar mandi 2
  );
};

const label = (text: string, names: string) => {
  const m = text.match(new RegExp(String.raw`(?:^|\n)[^\S\n]*[*_~\-•]*\s*(?:${names})[*_~]*\s*[:=]\s*([^\n]+)`, "i"));
  return m ? m[1].replace(/[*_~]/g, "").trim() : null;
};

/** The value after "Kec.", "Kota", ... up to a comma, newline or the next keyword. */
const place = (text: string, prefixes: string) => {
  const m = text.match(new RegExp(String.raw`(?:${prefixes})\.?\s+([A-Za-z][A-Za-z' -]{1,40}?)(?=\s*(?:[,\n/;]|\bkec|\bkel|\bkota|\bkab|\bprov|$))`, "i"));
  return m ? titleCase(m[1].trim()) : null;
};

/** South Sulawesi cities/regencies, recognised even without "Kota"/"Kab.". */
const KNOWN_CITIES = ["Makassar", "Gowa", "Maros", "Takalar", "Pangkep", "Barru", "Parepare", "Bone", "Sinjai", "Bulukumba", "Jeneponto", "Bantaeng", "Palopo", "Luwu"];

/** "Jl. X No. 5, Kel. Y, 3 lantai, harga ..." -> the street part only (stops before specs/price words). */
const streetOnly = (line: string) => {
  const from = line.replace(/[^\p{L}\p{N}.,/ -]+/gu, " ").replace(/^.*?\b(jl|jln|jalan)\b/i, "$1");
  const parts: string[] = [];
  for (const seg of from.split(",")) {
    if (parts.length && /\b(?:harga|hrg|lantai|unit|listrik|lt|lb|kt|km|shm|hgb)\b/i.test(seg)) break;
    parts.push(seg.trim());
  }
  return parts.join(", ").slice(0, 150);
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const PROPERTY: [RegExp, string][] = [
  [/\b(?:rumah|house|townhouse|cluster)\b/i, "house"],
  [/\b(?:apartemen|apartment|apt|studio)\b/i, "apartment"],
  [/\b(?:tanah|kavling|kaveling|lahan)\b/i, "land"],
  [/\b(?:ruko|rukan)\b/i, "ruko"],
  [/\b(?:kantor|office)\b/i, "office"],
  [/\b(?:gudang|warehouse)\b/i, "warehouse"],
  [/\b(?:villa|vila)\b/i, "villa"],
];

const FACILITIES: [RegExp, string][] = [
  [/\bcarport\b/i, "Carport"],
  [/\b(?:garasi|garage)\b/i, "Garage"],
  [/\b(?:kolam renang|swimming pool|private pool)\b/i, "Swimming pool"],
  [/\b(?:taman|garden)\b/i, "Garden"],
  [/\bac\b/i, "AC"],
  [/\b(?:water heater|pemanas air)\b/i, "Water heater"],
  [/\b(?:furnished|full furnish|semi furnish|furnish)\b/i, "Furnished"],
  [/\b(?:security|satpam|one gate)\b/i, "Security 24h"],
  [/\bcctv\b/i, "CCTV"],
  [/\b(?:gym|fitness)\b/i, "Gym"],
];

export function parseListingRules(raw: string): DraftFields {
  const text = raw.slice(0, 6000).replace(/\r/g, "").replace(/[ \t]+/g, " ");

  // Listing type: whichever of sale/rent wording appears first.
  const sale = text.search(/\b(?:dijual|jual|for sale|sale)\b/i);
  const rent = text.search(/\b(?:disewakan|disewa|sewa|dikontrakkan|dikontrakan|kontrakan|kontrak|kos|kost|for rent|rent)\b/i);
  const listingType = sale < 0 && rent < 0 ? null : rent < 0 || (sale >= 0 && sale < rent) ? "sell" : "rent";

  const propertyType = PROPERTY.map(([re, t]) => ({ t, i: text.search(re) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)[0]?.t ?? null;

  const rentalPeriod =
    listingType !== "rent" ? null
    : /(?:\/|per)\s*(?:tahun|thn|year|yr)/i.test(text) ? "year"
    : /(?:\/|per)\s*(?:bulan|bln|month)/i.test(text) ? "month"
    : null;

  // "LT/LB 120/90" shorthand, else separate labels.
  const pair = text.match(/\bLT\s*\/\s*LB\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/i);
  // Developer shorthand "tipe 36/72" = building 36 / land 72.
  const tipe = text.match(/\b(?:tipe|type)\s*(\d{2,3})\s*\/\s*(\d{2,4})\b/i);
  let landArea = pair ? toNumber(pair[1], true) : tipe ? Number(tipe[2]) : area(text, "LT|luas tanah|l\\.tanah");
  const buildingArea = pair ? toNumber(pair[2], true) : tipe ? Number(tipe[1]) : area(text, "LB|luas bangunan|l\\.bangunan");
  // Plot size written as dimensions: "ukuran 8x15" -> 120 m².
  if (landArea === null) {
    const dim = text.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*[x×]\s*(\d{1,3}(?:[.,]\d+)?)\b/i);
    const m2 = dim ? toNumber(dim[1], true) * toNumber(dim[2], true) : 0;
    if (m2 >= 10) landArea = Math.round(m2 * 100) / 100;
  }
  // Plain "Luas 500 m2" / "500 m2" on a land ad is the land area; on an apartment "lt 15" is a floor.
  if (propertyType === "land" && landArea === null) landArea = area(text, "luas") ?? area(text.replace(/(\d)\s*m(?:2|²)/gi, "$1 m2").replace(/(\d+(?:[.,]\d+)?)\s*m2/gi, "luas $1"), "luas");
  if (propertyType === "apartment") landArea = null;

  const bedrooms = count(text, "KT", "kamar tidur|k\\.tidur");
  const bathrooms = count(text, "KM", "kamar mandi|k\\.mandi");

  const watts = text.match(/(?:listrik|pln|daya)\s*[:=]?\s*(\d{3,5})\s*(?:w|watt|va)?\b/i) ?? text.match(/\b(\d{3,5})\s*(?:watt|va)\b/i);
  const phone = text.match(/(?:\+62|\b62|\b0)[ -]?8\d[\d \-]{7,13}\d/);
  const cert = text.match(/\b(SHM|SHGB|HGB|HGU|Strata ?title|AJB|girik|PPJB)\b/i);

  const street = text.match(/^.*\b(?:jl|jln|jalan)\.?\s+[^\n]+/im)?.[0];
  const address = label(text, "alamat|lokasi|location|letak") ?? (street ? streetOnly(street) : null);
  const district = place(text, "kec|kecamatan");
  const village = place(text, "kel|kelurahan|desa");
  const knownCity = KNOWN_CITIES.find((c) => new RegExp(String.raw`\b${c}\b`, "i").test(text)) ?? null;
  const city = place(text, "kota|kab|kabupaten") ?? knownCity;
  const province = place(text, "prov|provinsi") ?? (city && KNOWN_CITIES.includes(city) ? "Sulawesi Selatan" : null);
  const postalCode = (label(text, "kode ?pos") ?? "").match(/\b\d{5}\b/)?.[0] ?? null;

  const facilities = FACILITIES.filter(([re]) => re.test(text)).map(([, n]) => n);

  const notes = [
    cert && `Certificate: ${cert[1].toUpperCase()}`,
    /\bnego\b/i.test(text) && "Price negotiable",
    /\b(?:hadap|menghadap)\s+\w+/i.test(text) && text.match(/\b(?:hadap|menghadap)\s+\w+/i)![0],
  ].filter(Boolean).join("\n") || null;

  const firstLine = text.split("\n").map((l) => l.replace(/[\p{Extended_Pictographic}\uFE0F*_~#•]+/gu, "").trim()).find((l) => /[a-z]{4}/i.test(l) && l.length >= 8);
  const title = (firstLine ? firstLine.slice(0, 80) : [listingType === "rent" ? "Disewa" : "Dijual", propertyType].filter(Boolean).join(" ")) || null;

  const parsed = parsePrice(text);
  // "2jt/m2" on land is a rate: multiply by the land area, or leave it for the reviewer.
  const price = !parsed ? null : parsed.perM2 ? (landArea ? Math.round(parsed.value * landArea) : null) : parsed.value;
  const uncertain = [
    !listingType && "listingType", !price && "price", !propertyType && "propertyType",
    !(address || city || district) && "location", listingType === "rent" && !rentalPeriod && "rentalPeriod",
  ].filter(Boolean) as string[];

  return {
    title, listingType, price, rentalPeriod, propertyType,
    address, village, district, city, province, postalCode,
    landArea, buildingArea, bedrooms, bathrooms,
    electricityWatts: watts ? Number(watts[1]) : null,
    facilities,
    contactPhone: phone ? phone[0].replace(/[\s-]/g, "") : null,
    notes,
    uncertain,
  };
}
