/**
 * Generated corpus for the listing parser: random listings are rendered in many different writing styles
 * (label styles, number formats, layouts, emoji, markdown, upper/lower case, noise lines and "trap" lines),
 * parsed, and compared with what was written. Fields that were NOT written must come back empty, so this checks
 * precision (no invented values) as well as recall. Deterministic: the same seed always gives the same ads.
 */

type Parse = (t: string) => Record<string, unknown>;
type Rng = () => number;

function mulberry32(seed: number): Rng {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const chance = (r: Rng, p: number) => r() < p;
const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const dots = (n: number) => n.toLocaleString("de-DE"); // 1.200.000.000
const dec = (x: number) => String(x).replace(".", ",");

type Kind = "house" | "ruko" | "land" | "apartment" | "warehouse" | "villa" | "office";
type Spec = {
  kind: Kind; deal: "sell" | "rent"; price: number; period: "month" | "year" | null;
  land: number | null; building: number | null; bed: number | null; bath: number | null; watts: number | null;
  city: string; cityWord: string; district: string | null; village: string | null; street: string | null;
  phone: string; cert: string | null; nego: boolean; facilities: string[];
};

const CITIES: { name: string; word: "Kota" | "Kab." | "" }[] = [
  { name: "Makassar", word: "Kota" }, { name: "Makassar", word: "" }, { name: "Gowa", word: "Kab." }, { name: "Maros", word: "Kab." }, { name: "Takalar", word: "Kab." },
  { name: "Parepare", word: "Kota" }, { name: "Palopo", word: "Kota" }, { name: "Bantaeng", word: "Kab." }, { name: "Bulukumba", word: "Kab." }, { name: "Gowa", word: "" },
];
const DISTRICTS = ["Panakkukang", "Rappocini", "Tamalate", "Biringkanaya", "Tamalanrea", "Manggala", "Mariso", "Ujung Pandang", "Bontoala", "Mamajang", "Bontomarannu", "Somba Opu", "Pallangga", "Mandai", "Marusu", "Tallo", "Wajo Baru", "Kassi-Kassi"];
const VILLAGES = ["Pandang", "Tamalanrea Jaya", "Karampuang", "Balang Baru", "Bonto Duri", "Sudiang Raya", "Antang", "Pacerakkang", "Banta-Bantaeng", "Mangasa", "Parang Tambung", "Lakkang"];
const STREETS = ["Jl. Boulevard", "Jl. Perintis Kemerdekaan", "Jl. AP Pettarani", "Jl. Tamalate Raya", "Jl. Veteran Selatan", "Jl. Poros Malino", "Jl. Sultan Alauddin", "Jl. Kapasa Raya", "Jl. Racing Centre", "Jl. Hertasning", "Jalan Pelita Raya", "Jln. Toddopuli"];
const FACS: [string, string[]][] = [["Carport", ["carport", "Carport 2 mobil"]], ["Garden", ["taman", "taman depan"]], ["AC", ["AC", "AC semua kamar"]], ["CCTV", ["CCTV"]], ["Swimming pool", ["kolam renang"]], ["Water heater", ["water heater"]], ["Garage", ["garasi"]], ["Gym", ["gym"]]];

function genSpec(r: Rng): Spec {
  const kind = pick(r, ["house", "house", "house", "ruko", "land", "land", "apartment", "warehouse", "villa", "office"] as Kind[]);
  const deal: Spec["deal"] = kind === "land" ? (chance(r, 0.95) ? "sell" : "rent") : chance(r, 0.7) ? "sell" : "rent";
  const resid = kind === "house" || kind === "villa" || kind === "apartment";
  const city = pick(r, CITIES);
  const land = kind === "apartment" ? null : kind === "land" ? pick(r, [100, 120, 150, 200, 250, 300, 450, 500, 750, 1000, 1200, 2500, 5000, 20000]) : int(r, 6, 80) * 5 + (chance(r, 0.15) ? 2.5 : 0);
  const building = kind === "land" ? null : kind === "apartment" ? int(r, 4, 30) * 5 : kind === "house" || kind === "villa" ? int(r, 4, 50) * 5 : int(r, 5, 120) * 5;
  let price: number;
  let period: Spec["period"] = null;
  if (deal === "sell") {
    price = pick(r, [int(r, 30, 99) * 10e6, int(r, 10, 99) * 50e6, int(r, 5, 50) * 100e6, int(r, 3, 12) * 250e6, int(r, 1, 9) * 1e9]);
    price = Math.round(price / 5e6) * 5e6;
  } else {
    period = chance(r, 0.5) ? "month" : "year";
    price = period === "month" ? pick(r, [int(r, 5, 60) * 500_000, int(r, 1, 9) * 1e6]) : pick(r, [int(r, 5, 60) * 5e6, int(r, 3, 40) * 10e6]);
  }
  const watts = chance(r, 0.6) ? pick(r, [900, 1300, 2200, 3500, 4400, 5500, 6600, 10000, 13200]) : null;
  const wantRooms = resid || (kind === "ruko" && chance(r, 0.1));
  const nFac = int(r, 0, 3);
  const facilities = [...FACS].sort(() => r() - 0.5).slice(0, nFac).map(([n]) => n);
  return {
    kind, deal, price, period, land: land === null ? null : land, building, bed: wantRooms && chance(r, 0.85) ? int(r, 1, 6) : null, bath: wantRooms && chance(r, 0.8) ? int(r, 1, 5) : null, watts,
    city: city.name, cityWord: city.word, district: chance(r, 0.7) ? pick(r, DISTRICTS) : null, village: chance(r, 0.4) ? pick(r, VILLAGES) : null, street: chance(r, 0.7) ? `${pick(r, STREETS)}${chance(r, 0.6) ? ` No. ${int(r, 1, 99)}${chance(r, 0.1) ? "A" : ""}` : ""}${chance(r, 0.15) ? ` Km ${int(r, 2, 14)}` : ""}` : null,
    phone: "08" + pick(r, ["11", "12", "13", "21", "52", "53", "81", "82"]) + String(int(r, 1000000, 9999999)).slice(0, 7), cert: chance(r, 0.55) ? pick(r, ["SHM", "SHM", "HGB", "SHGB", "AJB", "Girik"]) : null, nego: chance(r, 0.4), facilities,
  };
}

/* ---------------- renderers: each returns text that represents the value exactly ---------------- */

function priceText(r: Rng, s: Spec, lowerSafe: boolean): string {
  const v = s.price;
  const out: string[] = [`Rp ${dots(v)}`, `Rp. ${dots(v)},-`, `IDR ${dots(v)}`, `Rp${dots(v)}`];
  if (s.deal === "sell") out.push(dots(v) + (chance(r, 0.5) ? "" : ",-"));
  if (v % 1e9 === 0) out.push(`${v / 1e9} M`, `${v / 1e9} Miliar`, `Rp ${v / 1e9} M`);
  else if (v >= 1e9 && v % 1e7 === 0) out.push(`${dec(v / 1e9)} M`, `${dec(v / 1e9)} Miliar`, `${dec(v / 1e9)} milyar`, `Rp ${dec(v / 1e9)} M`, `Rp${dec(v / 1e9)}M`, `${(v / 1e9).toString()}M`);
  if (v % 1e6 === 0) {
    const jt = v / 1e6;
    out.push(`${jt}jt`, `${jt} jt`, `${jt} juta`, `${jt} Juta`, `Rp ${jt} jt`, `Rp.${jt}jt`, `${jt}JT`);
    if (jt >= 1000) out.push(`${dots(jt)} juta`);
  } else if (v % 1e5 === 0 && v < 1e9) out.push(`${dec(v / 1e6)} jt`, `Rp ${dec(v / 1e6)} juta`);
  if (!lowerSafe) return pick(r, out);
  return pick(r, out.filter((x) => !/^\d[\d.,]*\s*M$/.test(x) && !/^Rp?\.?\s?[\d.,]+M$/.test(x)));
}

function rentSuffix(r: Rng, s: Spec): string {
  const m = s.period === "month";
  return pick(r, m ? ["/bulan", " /bulan", "/bln", " per bulan", " perbulan", "/ bulan"] : ["/tahun", " /tahun", "/thn", " per tahun", " pertahun", "/ tahun"]);
}

function areaVariants(n: number, label: "LT" | "LB"): string[] {
  const lt = label === "LT";
  const num = n >= 1000 && Number.isInteger(n) ? [String(n), dots(n)] : [dec(n)];
  const out: string[] = [];
  for (const x of num) {
    out.push(lt ? `LT ${x}` : `LB ${x}`, lt ? `LT: ${x} m2` : `LB: ${x} m2`, lt ? `LT ${x}m²` : `LB ${x}m²`, lt ? `L.T ${x}` : `L.B ${x}`, lt ? `Luas Tanah : ${x} m2` : `Luas Bangunan : ${x} m2`,
      lt ? `Luas tanah ${x} meter` : `Luas bangunan ${x} meter`, lt ? `Tanah ${x} m2` : `Bangunan ${x} m2`, lt ? `LT ${x} M2` : `LB ${x} M2`, lt ? `LT = ${x} m²` : `LB = ${x} m²`);
  }
  return out;
}

function roomsText(r: Rng, bed: number | null, bath: number | null): string[] {
  const parts: string[] = [];
  if (bed !== null && bath !== null) {
    parts.push(
      pick(r, [`KT ${bed} KM ${bath}`, `KT: ${bed}\nKM: ${bath}`, `${bed} KT / ${bath} KM`, `${bed}KT ${bath}KM`, `${bed} kamar tidur, ${bath} kamar mandi`, `Kamar tidur ${bed}, kamar mandi ${bath}`,
        `${bed}BR/${bath}BA`, `${bed} BR ${bath} BA`, `Bedroom ${bed} Bathroom ${bath}`, `${bed} bedrooms, ${bath} bathrooms`, `KT ${bed}+1 KM ${bath}`, `${bed} kamar tidur + ${bath} kamar mandi`,
        `KT ${bed} / KM ${bath}`, `K.T ${bed} K.M ${bath}`, `Kamar Tidur : ${bed}\nKamar Mandi : ${bath}`, `KT-${bed} KM-${bath}`, `${bed} KT, ${bath} KM`]),
    );
  } else if (bed !== null) parts.push(pick(r, [`KT ${bed}`, `${bed} KT`, `${bed} kamar tidur`, `Kamar tidur: ${bed}`, `${bed}BR`, `${bed} bedrooms`, `${bed}KT`]));
  else if (bath !== null) parts.push(pick(r, [`KM ${bath}`, `${bath} KM`, `${bath} kamar mandi`, `Kamar mandi: ${bath}`, `${bath}BA`, `${bath} bathrooms`]));
  return parts;
}

function wattsText(r: Rng, w: number): string {
  const d = w >= 1000 ? [String(w), dots(w)] : [String(w)];
  const x = pick(r, d);
  return pick(r, [`Listrik ${x} watt`, `Listrik: ${x} VA`, `PLN ${x}`, `Daya ${x} watt`, `${x} watt`, `Listrik ${x}W`, `Daya listrik : ${x}`, `Listrik ${x} Va`, `${x}VA`]);
}

function phoneText(r: Rng, p: string): { text: string; expect: string } {
  const a = p.slice(0, 4), b = p.slice(4, 8), c = p.slice(8);
  const label = pick(r, ["WA", "Hub", "Hubungi", "Contact", "Telp", "HP", "Info", "Call", "WA/Telp", "Hub:", "WA :"]);
  const forms: [string, string][] = [
    [`${a}-${b}-${c}`, p], [`${a} ${b} ${c}`, p], [p, p], [`${a}.${b}.${c}`, p], [`+62 ${p.slice(1, 4)}-${b}-${c}`, "+62" + p.slice(1)], [`62${p.slice(1)}`, "62" + p.slice(1)], [`+62${p.slice(1)}`, "+62" + p.slice(1)],
  ];
  const [t, e] = pick(r, forms);
  return { text: `${label} ${t}`, expect: e };
}

function locationLine(r: Rng, s: Spec): string[] {
  const parts: string[] = [];
  if (s.street) parts.push(s.street);
  if (s.village) parts.push(`${pick(r, ["Kel.", "Kelurahan", "Kel"])} ${s.village}`);
  if (s.district) parts.push(`${pick(r, ["Kec.", "Kecamatan", "Kec"])} ${s.district}`);
  parts.push(`${s.cityWord} ${s.city}`.trim());
  const sep = pick(r, [", ", ", ", ", ", " "]); // some agents drop the commas
  // without commas the street and village merge visually, so keep commas when a street is present
  const joined = parts.join(s.street ? ", " : sep);
  const label = pick(r, ["Lokasi", "Alamat", "Lokasi :", "Alamat :", "Letak", ""]);
  return [label ? `${label.replace(/\s*:$/, "")}: ${joined}` : joined];
}

const DEAL_WORDS = { sell: ["DIJUAL", "Dijual", "DIJUAL CEPAT", "Dijual murah", "JUAL", "Dijual BU", "For Sale", "dijual", "Over kredit"], rent: ["DISEWAKAN", "Disewakan", "Disewa", "Dikontrakkan", "For Rent", "disewakan"] };
const TYPE_WORDS: Record<Kind, [string, string][]> = {
  house: [["RUMAH", "house"], ["Rumah", "house"], ["Rumah 2 lantai", "house"], ["Rumah minimalis", "house"], ["Rumah cluster", "house"], ["Townhouse", "house"], ["Rumah 3 lantai", "house"]],
  ruko: [["RUKO", "ruko"], ["Ruko 3 lantai", "ruko"], ["Rumah toko", "ruko"], ["Ruko 2 lantai", "ruko"]],
  land: [["TANAH", "land"], ["Tanah kavling", "land"], ["Kavling", "land"], ["Lahan", "land"], ["Tanah darat", "land"]],
  apartment: [["APARTEMEN", "apartment"], ["Apartemen", "apartment"], ["Studio", "apartment"], ["Condotel", "apartment"]],
  warehouse: [["GUDANG", "warehouse"], ["Gudang", "warehouse"], ["Pabrik", "warehouse"], ["Warehouse", "warehouse"]],
  villa: [["VILLA", "villa"], ["Villa", "villa"], ["Vila", "villa"]],
  office: [["KANTOR", "office"], ["Rukan", "office"], ["Kantor", "office"], ["Office", "office"]],
};

const EMOJI = ["🏠", "📍", "💰", "🛏", "🚿", "📐", "⚡", "📄", "☎️", "✅", "🔥", "📞", "🏡", "✨", "➡️", "✔️", "▪️", "●", "◆", "►", "➤", "✓"];
const GREET = ["Assalamualaikum", "Selamat pagi", "Selamat siang", "Info properti", "Halo semua", "Permisi", "Bismillah"];
const TAIL = ["Terima kasih", "Serius hubungi saja", "Siap survey kapan saja", "Boleh dilihat dulu", "Bisa KPR", "Info lebih lanjut hubungi kami"];

function trapLines(r: Rng, s: Spec): string[] {
  const t: string[] = [];
  if (s.deal === "sell") {
    if (chance(r, 0.3)) t.push(`DP ${int(r, 20, 100)}jt, cicilan ${int(r, 2, 9)}jt/bulan`);
    if (chance(r, 0.15)) t.push(`Komisi 2,5%`);
    if (chance(r, 0.1)) t.push(`Cashback ${int(r, 5, 20)}jt`);
    if (chance(r, 0.1)) t.push(`Fee agen ${int(r, 2, 9)}jt`);
  } else if (chance(r, 0.3)) t.push(`Deposit ${int(r, 2, 9)}jt`);
  if (chance(r, 0.2)) t.push(`Dibangun tahun ${int(r, 2005, 2024)}`);
  if (chance(r, 0.12)) t.push(`RT 0${int(r, 1, 9)}/RW 0${int(r, 1, 9)}`);
  if (chance(r, 0.12)) t.push(`Blok ${pick(r, ["A", "B", "C"])}${int(r, 1, 30)} No ${int(r, 1, 40)}`);
  if (chance(r, 0.1)) t.push(`Jarak ${int(r, 2, 9) * 100} m dari jalan raya`);
  if (chance(r, 0.08)) t.push(`Lantai ${int(r, 2, 3)}`);
  if (chance(r, 0.06)) t.push(`Diskon ${int(r, 1, 9)}%`);
  // marketing sentences full of numbers that are not any field
  if (chance(r, 0.12)) t.push(pick(r, [`Lokasi strategis, ${int(r, 3, 15)} menit ke tol`, `Hanya ${int(r, 5, 30)} menit dari pusat kota`, `Dekat ${int(r, 2, 6)} sekolah dan ${int(r, 1, 4)} pasar`, `${int(r, 2, 5)} menit ke bandara`]));
  if (chance(r, 0.1)) t.push(pick(r, [`Tersedia ${int(r, 2, 30)} unit`, `Sisa ${int(r, 1, 9)} unit lagi`, `Cluster ${int(r, 10, 60)} unit`, `Bonus ${int(r, 1, 4)} AC`, `Free ${int(r, 1, 3)} kanopi`]));
  if (chance(r, 0.06)) t.push(`Ready stock ${int(r, 1, 9)} unit, booking fee ${int(r, 1, 9)}jt`);
  return t;
}

export type Case = { spec: Spec; text: string; expect: Record<string, unknown>; noteHas: string[]; floors: boolean };

function render(r: Rng): Case {
  const s = genSpec(r);
  const lower = chance(r, 0.18);
  const upper = !lower && chance(r, 0.1);
  const layout = pick(r, ["list", "list", "list", "paragraph", "compact"] as const);
  const bullets = pick(r, ["", "- ", "• ", "", "", "> "]);
  const emojiOn = chance(r, 0.3);
  const starOn = chance(r, 0.25);
  const lines: string[] = [];
  const expect: Record<string, unknown> = {
    listingType: s.deal === "sell" ? "sell" : "rent", propertyType: null, price: s.price, rentalPeriod: s.deal === "rent" ? s.period : null,
    landArea: null, buildingArea: null, bedrooms: null, bathrooms: null, electricityWatts: null, city: null, district: null, village: null, contactPhone: null,
  };
  const noteHas: string[] = [];

  // --- header
  const deal = pick(r, DEAL_WORDS[s.deal]);
  const [typeWord, propType] = pick(r, TYPE_WORDS[s.kind]);
  expect.propertyType = propType;
  const floorsInHeader = /\d lantai/.test(typeWord);
  const header = chance(r, 0.5) ? `${deal} ${typeWord}` : `${typeWord} ${deal.toLowerCase() === deal ? deal : deal}`;
  const headerLine = (starOn ? `*${header}*` : header) + (emojiOn ? ` ${pick(r, EMOJI)}` : "");

  const fields: string[] = [];
  const add = (s: string) => fields.push(s);

  // --- price
  const lowerSafe = lower;
  const pLabel = s.deal === "sell" ? pick(r, ["Harga", "Harga", "Hrg", "Price", "Harga jual", "Harga :"]) : pick(r, ["Harga", "Sewa", "Harga sewa", "Harga :", "Biaya sewa"]);
  const negoWord = s.deal === "sell" && s.nego && chance(r, 0.6) ? pick(r, [" nego", " (nego)", " NEGO", " nego tipis"]) : "";
  const ptxt = priceText(r, s, lowerSafe) + (s.deal === "rent" ? rentSuffix(r, s) : "") + negoWord;
  if (negoWord) noteHas.push("Price negotiable");
  const priceUnlabelledOK = layout === "compact" && s.deal === "sell";
  const priceField = priceUnlabelledOK && chance(r, 0.5) ? ptxt : `${pLabel.replace(/:$/, "").trim()}${pick(r, [": ", " : ", " "])}${ptxt}`;
  add(priceField);

  // --- areas
  const wantLT = s.land !== null && !(s.kind === "land" && chance(r, 0.4));
  const wantLB = s.building !== null && chance(r, 0.75);
  if (s.kind === "land" && s.land !== null) {
    const a = pick(r, [`Luas ${dec(s.land)} m2`, `Luas tanah ${dec(s.land)} m2`, `${dec(s.land)} m2`, `LT ${dec(s.land)}`, `Tanah ${dec(s.land)} m²`, `Luas : ${dec(s.land)} m²`, `LT: ${dec(s.land)} m2`]);
    const dimFactor = [[10, 20], [8, 15], [10, 10], [12, 25], [6, 12], [15, 20]].find(([x, y]) => x * y === s.land);
    add(dimFactor && chance(r, 0.4) ? `Ukuran ${dimFactor[0]}${pick(r, ["x", "X", "×"])}${dimFactor[1]}` : a);
    expect.landArea = s.land;
  } else if (wantLT && wantLB && chance(r, 0.35)) {
    add(pick(r, [`LT/LB ${dec(s.land!)}/${dec(s.building!)}`, `LT ${dec(s.land!)} / LB ${dec(s.building!)}`, `LT ${dec(s.land!)} LB ${dec(s.building!)}`, `LT ${dec(s.land!)} m2 / LB ${dec(s.building!)} m2`, `LB/LT ${dec(s.building!)}/${dec(s.land!)}`]));
    expect.landArea = s.land;
    expect.buildingArea = s.building;
  } else {
    if (wantLT) { add(pick(r, areaVariants(s.land!, "LT"))); expect.landArea = s.land; }
    if (wantLB) { add(pick(r, areaVariants(s.building!, "LB"))); expect.buildingArea = s.building; }
  }
  if (s.kind === "apartment" && s.building !== null && !wantLB) {
    add(pick(r, [`Luas ${dec(s.building)} m2`, `${dec(s.building)} m2`, `Tipe studio ${dec(s.building)} m2`]));
    expect.buildingArea = s.building;
  }

  // --- rooms / watts
  const rooms = roomsText(r, s.bed, s.bath);
  if (rooms.length) { add(rooms[0]); expect.bedrooms = s.bed; expect.bathrooms = s.bath; }
  if (s.watts !== null) { add(wattsText(r, s.watts)); expect.electricityWatts = s.watts; }

  // --- location
  const hasLoc = chance(r, 0.85);
  if (hasLoc) {
    for (const l of locationLine(r, s)) add(l);
    expect.city = s.city;
    expect.district = s.district;
    expect.village = s.village;
  }

  // --- extras
  if (s.cert) { add(pick(r, [s.cert, `Sertifikat : ${s.cert}`, `Surat: ${s.cert}`, `Legalitas ${s.cert}`])); noteHas.push(`Certificate: ${s.cert}`); }
  if (s.facilities.length) {
    const words = s.facilities.map((f) => pick(r, FACS.find(([n]) => n === f)![1]));
    add(pick(r, [`Fasilitas: ${words.join(", ")}`, words.join(", "), `Ada ${words.join(" dan ")}`]));
  }
  for (const t of trapLines(r, s)) add(t);
  const ph = phoneText(r, s.phone);
  if (chance(r, 0.88)) { add(ph.text); expect.contactPhone = ph.expect; }

  // --- assemble by layout
  const decorate = (l: string) => `${emojiOn && chance(r, 0.6) ? pick(r, EMOJI) + " " : ""}${bullets}${l}`;
  if (layout === "list") {
    if (chance(r, 0.4)) lines.push(pick(r, GREET));
    lines.push(headerLine);
    if (chance(r, 0.3)) lines.push("");
    for (const f of fields) lines.push(decorate(f));
    if (chance(r, 0.35)) lines.push(pick(r, TAIL));
  } else if (layout === "paragraph") {
    lines.push(`${headerLine}. ${fields.map((f) => f.replace(/\n/g, ", ")).join(". ")}.${chance(r, 0.4) ? " " + pick(r, TAIL) : ""}`);
  } else {
    lines.push(`${headerLine} ${fields.map((f) => f.replace(/\n/g, " ")).join(" ")}`);
  }
  let text = lines.join("\n");
  if (chance(r, 0.12)) {
    // pasted straight from a WhatsApp chat
    const stamp = pick(r, [`[${int(r, 1, 28)}/${int(r, 1, 12)}/26 ${int(r, 8, 21)}.${String(int(r, 10, 59))}] ${pick(r, ["Budi", "Andi Saputra", "Pak Haji", "Sari ~"])}: `, `${int(r, 1, 28)}/${int(r, 1, 12)}/2026, ${int(r, 8, 21)}.${String(int(r, 10, 59))} - ${pick(r, ["Budi", "Ibu Ani", "Dedi Property"])}: `]);
    text = stamp + text;
  }
  if (upper) text = text.toUpperCase();
  if (lower) text = text.toLowerCase();
  if (chance(r, 0.2)) text = text.replace(/ /g, (m) => (chance(r, 0.15) ? "  " : m));
  if (chance(r, 0.08)) text = text.replace(/ /g, (m) => (chance(r, 0.2) ? " " : m));
  if (chance(r, 0.05)) text = "\n\n" + text + "\n  ";
  return { spec: s, text, expect, noteHas, floors: floorsInHeader };
}

/* ---------------- runner ---------------- */

const CHECK = ["listingType", "propertyType", "price", "rentalPeriod", "landArea", "buildingArea", "bedrooms", "bathrooms", "electricityWatts", "city", "district", "village", "contactPhone"] as const;

export function runGenerated(parse: Parse, _fields: string[], n = 6000, seed = 20241018): number {
  const r = mulberry32(seed);
  const stats: Record<string, { ok: number; bad: number }> = {};
  for (const f of [...CHECK, "notes"]) stats[f] = { ok: 0, bad: 0 };
  const samples: Record<string, string[]> = {};
  let perfect = 0;
  for (let i = 0; i < n; i++) {
    const c = render(r);
    const got = parse(c.text);
    let allOk = true;
    for (const f of CHECK) {
      const want = c.expect[f];
      const have = got[f];
      const ok = JSON.stringify(have) === JSON.stringify(want);
      stats[f][ok ? "ok" : "bad"]++;
      if (!ok) {
        allOk = false;
        (samples[f] ??= []).push(`--- ${f}: want ${JSON.stringify(want)} got ${JSON.stringify(have)}\n${c.text}`);
      }
    }
    const notes = String(got.notes ?? "");
    const notesOk = c.noteHas.every((x) => notes.includes(x));
    stats.notes[notesOk ? "ok" : "bad"]++;
    if (!notesOk) {
      allOk = false;
      (samples.notes ??= []).push(`--- notes: want ${JSON.stringify(c.noteHas)} got ${JSON.stringify(notes)}\n${c.text}`);
    }
    if (allOk) perfect++;
  }
  // Order independence: shuffling the lines after the headline must not change anything the parser extracts.
  const r2 = mulberry32(seed + 1);
  let shuffled = 0, shuffledBad = 0;
  const shuffleSamples: string[] = [];
  for (let i = 0; i < 2500; i++) {
    const c = render(r2);
    const lines = c.text.split("\n");
    if (lines.length < 6) continue;
    const head = lines.slice(0, 2), tail = lines.slice(2);
    for (let k = tail.length - 1; k > 0; k--) { const j = Math.floor(r2() * (k + 1)); [tail[k], tail[j]] = [tail[j], tail[k]]; }
    const a = parse(c.text), b = parse([...head, ...tail].join("\n"));
    shuffled++;
    const diff = CHECK.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    if (diff.length) { shuffledBad++; shuffleSamples.push(`--- changed when lines were reordered: ${diff.map((f) => `${f}: ${JSON.stringify(a[f])} -> ${JSON.stringify(b[f])}`).join(", ")}\n${[...head, ...tail].join("\n")}`); }
  }
  stats.orderIndependence = { ok: shuffled - shuffledBad, bad: shuffledBad };
  if (shuffleSamples.length) samples.orderIndependence = shuffleSamples;
  console.log(`\nGENERATED CORPUS: ${n} ads, ${perfect} fully correct (${((perfect / n) * 100).toFixed(1)}%)`);
  let failed = 0;
  for (const [f, v] of Object.entries(stats)) {
    const acc = (v.ok / (v.ok + v.bad)) * 100;
    const flag = acc < 95 ? "  <-- below the 95% bar" : "";
    if (acc < 95) failed++;
    console.log(`  ${f.padEnd(18)} ${acc.toFixed(2).padStart(6)}%  (${v.bad} wrong)${flag}`);
  }
  const show = Number(process.env.SHOW ?? 3);
  for (const [f, list] of Object.entries(samples)) {
    if (stats[f].bad / (stats[f].ok + stats[f].bad) >= 0.02 || process.env.VERBOSE) console.log(`\n[${f}] first ${Math.min(show, list.length)} of ${list.length} failures:\n${list.slice(0, show).join("\n\n")}`);
  }
  return failed;
}
