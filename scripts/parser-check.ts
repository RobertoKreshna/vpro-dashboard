/**
 * Regression suite for the free listing parser (src/lib/draft-rules.ts).  Run:  bun run parser:check
 *
 *  1. HAND corpus: realistic WhatsApp ads and the "traps" (numbers that must NOT become a price, area, room count...).
 *  2. GENERATED corpus: thousands of listings rendered in many writing styles, checked field by field.
 *  3. Robustness: odd input never throws and always returns quickly.
 *
 * When a real ad is misread, add it to the HAND corpus (with what a careful human would extract), fix the parser, and
 * it stays fixed. Exit code 1 if anything fails.
 */
import { parseListingRules } from "../src/lib/draft-rules";
import { sanitizeFields } from "../src/lib/draft-sanitize";
import { runGenerated } from "./parser-check-generated";

type Fields = ReturnType<typeof sanitizeFields>;
const parse = (t: string): Fields => sanitizeFields(parseListingRules(t));

type Case = {
  name: string;
  text: string;
  /** Exact expected values (null = must be empty). */
  expect?: Partial<Record<keyof Fields, unknown>>;
  has?: string[]; // facilities that must be present
  hasNot?: string[]; // facilities that must NOT be present
  flags?: string[]; // must appear in `uncertain`
  noFlags?: string[]; // must NOT appear in `uncertain`
  notes?: string[]; // substrings the notes must contain
  notesNot?: string[];
};

const cases: Case[] = [];
const c = (name: string, text: string, o: Omit<Case, "name" | "text"> = {}) => cases.push({ name, text, ...o });
const B = 1e9, J = 1e6;

/* ---------------- whole-ad realism ---------------- */
c("neat list with emoji bullets", `🏠 DIJUAL RUMAH 2 LANTAI 🏠
📍 Jl. Boulevard No. 5, Kel. Pandang, Kec. Panakkukang, Kota Makassar
💰 Harga: Rp 1.200.000.000 (nego)
🛏 KT: 3
🚿 KM: 2
📐 LT 120 m² / LB 90 m²
⚡ Listrik 2200 watt
📄 SHM
Fasilitas: carport, taman, AC
Hubungi: 0812-3456-7890 (Budi)`, { expect: { listingType: "sell", propertyType: "house", price: 1.2 * B, landArea: 120, buildingArea: 90, bedrooms: 3, bathrooms: 2, electricityWatts: 2200, city: "Makassar", district: "Panakkukang", village: "Pandang", province: "Sulawesi Selatan", contactPhone: "081234567890", contactName: "Budi", address: "Jl. Boulevard No. 5" }, has: ["Carport", "Garden", "AC"], notes: ["Certificate: SHM", "Price negotiable"], noFlags: ["price", "location", "bedrooms", "size"] });
c("single chat paragraph", `Dijual cepat rumah di Antang, 2 lantai, 3 kamar tidur, 2 kamar mandi. Luas tanah 120 m2, luas bangunan 100 m2. Listrik 2200 watt, ada carport dan taman. Harga 1,35 M nego. Hubungi 0813-7777-8888`, { expect: { listingType: "sell", propertyType: "house", price: 1.35 * B, landArea: 120, buildingArea: 100, bedrooms: 3, bathrooms: 2, electricityWatts: 2200, contactPhone: "081377778888" }, has: ["Carport", "Garden"], flags: ["location"] });
c("minimal one-liner", `Rumah dijual 650jt LT 72 LB 45 2KT 1KM Antang`, { expect: { listingType: "sell", price: 650 * J, landArea: 72, buildingArea: 45, bedrooms: 2, bathrooms: 1 } });
c("greeting + ALL CAPS broadcast", `Assalamualaikum
DIJUAL CEPAT RUMAH MINIMALIS SHM
LT 90 LB 60 KT 2 KM 1
Harga 450jt NEGO
Hub 0812-1111-2222
Terima kasih`, { expect: { title: "Dijual Cepat Rumah Minimalis SHM", price: 450 * J, landArea: 90, buildingArea: 60, bedrooms: 2, bathrooms: 1, contactPhone: "081211112222" } });
c("english ad", `FOR SALE: House in Makassar, 3 bedrooms, 2 bathrooms, land 150 sqm, building 100 sqm. Price IDR 1.800.000.000. Contact 0812-9999-1111`, { expect: { listingType: "sell", propertyType: "house", price: 1.8 * B, landArea: 150, buildingArea: 100, bedrooms: 3, bathrooms: 2, city: "Makassar" } });
c("all lowercase, no punctuation", `dijual rumah kec panakkukang kota makassar lt 100 lb 80 kt 3 km 2 harga 900jt hub 081234567890`, { expect: { listingType: "sell", price: 900 * J, landArea: 100, buildingArea: 80, bedrooms: 3, bathrooms: 2, district: "Panakkukang", city: "Makassar" } });
c("numbered + dashed lists", `1. Dijual rumah
- Harga: 800jt
- LT: 100 m2
• LB: 70 m2
- KT: 3
- KM: 2`, { expect: { price: 800 * J, landArea: 100, buildingArea: 70, bedrooms: 3, bathrooms: 2 } });
c("not a listing at all", `Halo selamat pagi, apa kabar semuanya?`, { expect: { listingType: null, propertyType: null, price: null, landArea: null, bedrooms: null }, flags: ["listingType", "price", "propertyType"] });
c("very short", `Dijual rumah`, { expect: { listingType: "sell", propertyType: "house", price: null }, flags: ["price", "location"] });
c("empty / whitespace", `   \n  `, { expect: { price: null, listingType: null } });

/* ---------------- listing type ---------------- */
c("dijual / disewakan both in title", `DIJUAL / DISEWAKAN rumah type 45 harga 500jt`, { expect: { listingType: "sell" }, flags: ["listingType"] });
c("rumah kost FOR SALE is a sale, not a rental", `RUMAH KOST DIJUAL 12 kamar Rp 2,5 M Jl. Perintis`, { expect: { listingType: "sell", price: 2.5 * B } });
c("kost for rent", `KOST DISEWAKAN putri Rp 1,2jt/bulan Jl. Tamalate`, { expect: { listingType: "rent", price: 1.2 * J, rentalPeriod: "month" } });
c("kontrakan with rb", `Kontrakan 2 kamar Rp 800rb/bulan`, { expect: { listingType: "rent", price: 800_000, rentalPeriod: "month" } });
c("over kredit", `OVER KREDIT rumah cluster, cicilan jalan, bayar DP 50jt, Harga 400jt`, { expect: { listingType: "sell", price: 400 * J } });
c("rent type inferred from /bulan only", `Rumah 3 kamar Rp 3jt/bulan Jl. Veteran`, { expect: { listingType: "rent", price: 3 * J, rentalPeriod: "month" } });
c("rent: investment mention in a sale ad", `Dijual rumah, hasil sewa 3jt/bulan. Harga 600jt`, { expect: { listingType: "sell", price: 600 * J } });

/* ---------------- WILD: how agents really type (vocabulary the generator does not use) ---------------- */
c("wild: perumahan with contact 'Ibu'", `*DIJUAL RUMAH SIAP HUNI*
Perumahan Griya Antang Permai blok B2 no 7
Kec. Manggala Makassar
LT 105 / LB 70
KT 3 KM 2
Listrik 1300
Carport, Taman depan, Dapur bersih, Ruang tamu luas
SHM
Harga 685 jt (nego sampai deal)
Hub Ibu Rina 0812 4455 6677`, { expect: { price: 685 * J, landArea: 105, buildingArea: 70, bedrooms: 3, bathrooms: 2, electricityWatts: 1300, district: "Manggala", city: "Makassar", contactName: "Rina", contactPhone: "081244556677", propertyType: "house" }, notes: ["Certificate: SHM", "Price negotiable"] });
c("wild: street number + floors + BU", `RUMAH DIJUAL CEPAT BU!!!
Jl. Sultan Alauddin 2 (depan UNM)
2 lantai, 4 KT, 3 KM, carport 2 mobil
LT 200 m2, LB 250m2
Hrg 1.8M nego
Hub: 081355667788`, { expect: { price: 1.8 * B, landArea: 200, buildingArea: 250, bedrooms: 4, bathrooms: 3, listingType: "sell" }, notes: ["Floors: 2"] });
c("wild: kos-kosan", `KOS KOSAN PUTRI DISEWAKAN
Jl. Tamalate 1 no 12
8 kamar, AC, kamar mandi dalam, wifi, parkir
1,2jt/bln (include listrik)`, { expect: { listingType: "rent", price: 1.2 * J, rentalPeriod: "month", bedrooms: 8 }, has: ["AC"] });
c("wild: ruko with 2,5 lantai", `Dijual ruko 2,5 lantai di jalan raya Perintis, cocok untuk usaha. LT 80 LB 160. Harga 3,2 M nego tipis. SHM. WA 0852 1111 2222`, { expect: { propertyType: "ruko", price: 3.2 * B, landArea: 80, buildingArea: 160, bedrooms: null }, notes: ["Floors: 2,5"] });
c("wild: land in hectares with price per m2 in rb", `TANAH MURAH DIJUAL!!! Luas 2.5 Ha, SHM atas nama pribadi, lokasi Pangkep (dekat jalan poros), harga 75rb/m2 nego. Hub 0813 5555 6666`, { expect: { propertyType: "land", landArea: 25000, price: 1_875_000_000, city: "Pangkajene Dan Kepulauan" } });
c("wild: villa nightly rate is not monthly", `Villa disewakan harian/mingguan/bulanan, Rp 1.500.000/malam. Kolam renang pribadi, 4 KT`, { expect: { listingType: "rent", price: 1_500_000, rentalPeriod: null, propertyType: "villa", bedrooms: 4 }, flags: ["rentalPeriod"] });
c("wild: warehouse luas + bangunan", `GUDANG DISEWAKAN di Kawasan Industri Makassar (KIMA). Luas 1000 m2 bangunan 800 m2. Listrik 23.000 VA. Sewa Rp 150jt/thn nego. Contact: Pak Haji 0821 3333 4444`, { expect: { propertyType: "warehouse", landArea: 1000, buildingArea: 800, electricityWatts: 23000, price: 150 * J, rentalPeriod: "year", contactName: "Haji" } });
c("wild: rumah subsidi", `RUMAH SUBSIDI DP 0% angsuran 1jt-an/bln. Tipe 30/60. Harga 166jt`, { expect: { price: 166 * J, buildingArea: 30, landArea: 60, propertyType: "house" } });
c("wild: english agent, billion + number-first areas", `House for sale in Makassar - 4 BR 3 BA - 200 sqm land / 150 sqm building - Freehold (SHM) - Asking price IDR 2.5 billion`, { expect: { listingType: "sell", propertyType: "house", price: 2.5 * B, bedrooms: 4, bathrooms: 3, landArea: 200, buildingArea: 150, city: "Makassar" }, notes: ["Certificate: SHM"] });
c("wild: phone-typing abbreviations", `dijual rmh 2 lt shm lt 90 lb 100 kt 3 km 2 hrg 900jt nego hub 08123456789`, { expect: { propertyType: "house", listingType: "sell", landArea: 90, buildingArea: 100, bedrooms: 3, bathrooms: 2, price: 900 * J, contactPhone: "08123456789" } });
c("wild: Jl without dot + landmark in brackets", `Dijual Rumah di Jl Pettarani (belakang Mal Panakkukang) LT 120 LB 100 3KT 2KM 1.9M`, { expect: { price: 1.9 * B, landArea: 120, buildingArea: 100, bedrooms: 3, bathrooms: 2 } });
c("wild: Hanya + KPR + DP", `Hanya 350jt! Rumah type 36 di Maros. KPR bisa. DP 5jt`, { expect: { price: 350 * J, buildingArea: 36, city: "Maros" } });
c("wild: kontrak min 1 tahun, per year price", `Dikontrakkan rumah 2 lantai dekat kampus UNHAS. 4 KT, 3 KM. Kontrak min 1 tahun. Harga 45jt/tahun. Hub 0813 7777 8888`, { expect: { listingType: "rent", price: 45 * J, rentalPeriod: "year", bedrooms: 4, bathrooms: 3 } });
c("wild: over kredit with cicilan, DP and cash price", `Over kredit rumah cluster Griya Tamalanrea. Cicilan 1,8jt/bln sisa 12 thn. Bayar DP 25jt (harga cash 330jt)`, { expect: { listingType: "sell", price: 330 * J } });
c("wild: BPHTB mention", `Dijual rumah baru, KT 2 + 1 KM 1, Rp 495.000.000 ( TERMASUK BPHTB )`, { expect: { price: 495 * J, bedrooms: 2, bathrooms: 1 } });
c("wild: land in are", `Dijual tanah 15 are di Bantaeng harga 600jt`, { expect: { landArea: 1500, price: 600 * J, city: "Bantaeng" } });
c("wild: several listings in one post is flagged", `Dijual:
1. Rumah Antang 650jt LT 72
2. Ruko Perintis 2,5M LT 100
3. Tanah Gowa 300jt 10x20`, { flags: ["price", "propertyType"] });
c("wild: copied from a WhatsApp chat with timestamp", `[18/10/26 13.45] Budi Property: DIJUAL RUMAH
Harga 800jt
LT 100 LB 70`, { expect: { price: 800 * J, landArea: 100, buildingArea: 70, listingType: "sell" } });
c("wild: exported chat line format", `18/10/2026, 13.45 - Andi: Dijual rumah 450jt LT 72 hub 081234567890`, { expect: { price: 450 * J, landArea: 72, contactPhone: "081234567890" } });
c("wild: marketing numbers are not fields", `Dijual rumah Rp 750jt. Lokasi strategis 5 menit ke tol, dekat 3 sekolah dan 2 pasar. Tersedia 10 unit, sisa 2 unit. Bonus 2 AC`, { expect: { price: 750 * J, bedrooms: null, bathrooms: null } });
c("wild: Tanah 1.25M (price after an area word)", `Dijual BU TANAH 1.25M Luas tanah 1000 m2`, { expect: { price: 1.25 * B, landArea: 1000 } });
c("wild: 'meter KM 1' is a bathroom", `Dijual rumah Luas bangunan 80 meter KM 1 Alamat: Jl. AP Pettarani No. 89`, { expect: { bathrooms: 1, buildingArea: 80 } });
c("wild: dimension at end of sentence", `Tanah dijual. Ukuran 12x25. Harga 900jt.`, { expect: { landArea: 300, price: 900 * J } });
c("wild: emoji + unicode bullets", `🏡 DIJUAL RUMAH
➡️ Harga: 700jt
✔️ LT 100
▪️ LB 80
● KT 3
◆ KM 2
► Listrik 2200`, { expect: { price: 700 * J, landArea: 100, buildingArea: 80, bedrooms: 3, bathrooms: 2, electricityWatts: 2200 } });
c("wild: SHM written as hak milik", `Dijual rumah sertifikat hak milik 500jt`, { notes: ["Certificate: SHM"] });
c("wild: harga per bulan inside sale ad does not become the price", `Dijual rumah Rp 800jt. Bisa disewakan, estimasi sewa 4jt/bulan`, { expect: { listingType: "sell", price: 800 * J } });

/* ---------------- WILD 2: more classes of real-world writing ---------------- */
c("wild2: number words for rooms", `Dijual rumah dua lantai, tiga kamar tidur, dua kamar mandi, harga 700jt`, { expect: { bedrooms: 3, bathrooms: 2, price: 700 * J }, notes: ["Floors: 2"] });
c("wild2: empat kamar tidur", `Dijual rumah empat kamar tidur satu kamar mandi 900jt`, { expect: { bedrooms: 4, bathrooms: 1 } });
c("wild2: 3+1 before the label", `Dijual rumah 3+1 KT 2 KM harga 800jt`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("wild2: 3 + 1 with spaces", `Dijual rumah 3 + 1 kamar tidur, 2 kamar mandi`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("wild2: KM/WC combined label", `Dijual rumah KT 3 KM/WC 2 harga 800jt`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("wild2: approximate area ±", `Dijual tanah LT ± 120 m2 harga 300jt`, { expect: { landArea: 120 } });
c("wild2: approximate area ~", `Dijual rumah LT ~150 LB ~90`, { expect: { landArea: 150, buildingArea: 90 } });
c("wild2: jutaan", `Dijual rumah harga 800 jutaan nego`, { expect: { price: 800 * J } });
c("wild2: jtan per bulan", `Disewakan rumah 2,5jtan/bln`, { expect: { price: 2.5 * J, rentalPeriod: "month" } });
c("wild2: district named Ujung Tanah", `Dijual ruko Kec. Ujung Tanah, Kota Makassar harga 2M`, { expect: { district: "Ujung Tanah", city: "Makassar" } });
c("wild2: village named Taman Sari", `Dijual rumah Kel. Taman Sari, Kec. Panakkukang, Kota Makassar`, { expect: { village: "Taman Sari", district: "Panakkukang" } });
c("wild2: price on the next line after the label", `Dijual rumah\nHarga:\n850 jt\nLT 100`, { expect: { price: 850 * J, landArea: 100 } });
c("wild2: Rp with spaces in digits", `Dijual rumah Rp 850 000 000`, { expect: { price: 850 * J } });
c("wild2: 'Harga 450' without unit is not guessed", `Dijual rumah LT 72 Harga 450 nego`, { expect: { price: null }, flags: ["price"] });
c("wild2: tanah with LT 7x15", `Dijual tanah LT 7x15 harga 300jt`, { expect: { landArea: 105 } });
c("wild2: 10x25 = 250 m2", `Dijual tanah ukuran 10x25 = 250 m2 harga 500jt`, { expect: { landArea: 250 } });
c("wild2: Hrg.850jt no space", `Dijual rumah Hrg.850jt LT 100`, { expect: { price: 850 * J } });
c("wild2: H: shorthand is not a price label but jt is enough", `Dijual rumah H: 850jt`, { expect: { price: 850 * J } });
c("wild2: bathrooms 'WC 2'", `Dijual rumah 3 kamar tidur WC 2`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("wild2: 'kamar 3' only", `Dijual rumah kamar 3`, { expect: { bedrooms: 3 } });
c("wild2: rent per year with min contract text", `Disewakan ruko Rp 85.000.000/tahun minimal 2 tahun`, { expect: { price: 85 * J, rentalPeriod: "year" } });

/* ---------------- price formats ---------------- */
for (const [txt, val, label] of [
  ["Rp 1.200.000.000", 1.2 * B, "full digits"], ["Rp. 1.200.000.000,-", 1.2 * B, "with ,-"], ["Rp1,2M", 1.2 * B, "Rp1,2M"], ["1,2 M", 1.2 * B, "1,2 M"], ["1.2M", 1.2 * B, "1.2M dot"],
  ["1,2 Miliar", 1.2 * B, "miliar"], ["1,2 milyar", 1.2 * B, "milyar"], ["1200 jt", 1.2 * B, "1200 jt"], ["1.200 juta", 1.2 * B, "1.200 juta"], ["IDR 1.200.000.000", 1.2 * B, "IDR"],
  ["Rp 1,250,000,000", 1.25 * B, "comma thousands"], ["850jt", 850 * J, "850jt"], ["850 JT", 850 * J, "850 JT"], ["Rp.850jt", 850 * J, "Rp.850jt"], ["850 Juta", 850 * J, "850 Juta"],
  ["Rp 850.000.000,-", 850 * J, "850 with ,-"], ["Rp 12,5 jt", 12.5 * J, "12,5 jt"], ["1,35 M", 1.35 * B, "1,35 M"], ["Rp 2 M", 2 * B, "2 M"], ["0,5 M", 0.5 * B, "0,5 M"],
] as [string, number, string][]) {
  c(`price format: ${label}`, `Dijual rumah LT 100\nHarga: ${txt} nego`, { expect: { price: val } });
}
c("price: 1,8m lowercase after Harga", `Dijual rumah harga 1,8m`, { expect: { price: 1.8 * B } });
c("price: 1,8M uppercase no label", `Dijual rumah type 45 1,8M di Antang`, { expect: { price: 1.8 * B } });
c("price: bare number, no Rp/label", `Dijual rumah 850.000.000 nego`, { expect: { price: 850 * J } });
c("price: label then newline then value", `Harga\nRp 750.000.000\nDijual rumah`, { expect: { price: 750 * J } });
c("price drop: dari X jadi Y", `TURUN HARGA! Dijual rumah dari 1,8M jadi 1,5M`, { expect: { price: 1.5 * B } });
c("price: range takes the low end and flags", `Dijual rumah Harga 500-600jt`, { expect: { price: 500 * J }, flags: ["price"] });
c("price: two units listed, first wins and flags", `Dijual: Unit A Harga 850jt, Unit B Harga 1,2M`, { expect: { price: 850 * J }, flags: ["price"] });
c("price: full-width digits and colon", `Dijual rumah\nHarga：１,２ M`, { expect: { price: 1.2 * B } });
c("price: non-breaking spaces + zero-width chars", `Dijual rumah\nHarga: Rp 1.200.000.000​`, { expect: { price: 1.2 * B } });

/* ---------------- numbers that are NOT the price ---------------- */
c("trap: DP and cicilan after the price", `Dijual rumah Harga 850jt. DP 50jt, cicilan 5jt/bulan`, { expect: { price: 850 * J, listingType: "sell" } });
c("trap: only DP/cicilan, no price", `Dijual rumah DP 50jt cicilan 3jt/bulan`, { expect: { price: null }, flags: ["price"] });
c("trap: cashback + komisi + fee", `Dijual rumah Rp 700jt. Cashback 10jt. Komisi 2,5%. Fee agen 5jt`, { expect: { price: 700 * J } });
c("trap: deposit on a rental", `Disewakan rumah Rp 3jt/bulan, deposit 6jt`, { expect: { price: 3 * J, rentalPeriod: "month" } });
c("trap: distance in meters", `Dijual rumah Rp 900jt, jarak 500 m dari pantai, 100 M dari jalan raya`, { expect: { price: 900 * J } });
c("trap: no price but distance only", `Dijual rumah dekat pantai jarak 500 m, 100 M dari jalan`, { expect: { price: null } });
c("trap: phone number is not money", `Dijual rumah hub 081234567890`, { expect: { price: null, contactPhone: "081234567890" } });
c("trap: dotted phone is not money", `Dijual rumah WA 0812.3456.7890 harga 700jt`, { expect: { price: 700 * J, contactPhone: "081234567890" } });
c("trap: year in text", `Dijual rumah dibangun tahun 2020 harga 800jt`, { expect: { price: 800 * J } });
c("trap: postal code", `Dijual rumah Makassar 90245 harga 800jt`, { expect: { price: 800 * J } });
c("trap: house/RT/RW/blok numbers", `Dijual rumah Jl. Mawar Blok A12 No. 5 RT 03/RW 05 harga 650jt`, { expect: { price: 650 * J, bedrooms: null, bathrooms: null } });
c("trap: percent", `Dijual rumah 600jt diskon 5% bunga 0%`, { expect: { price: 600 * J } });

/* ---------------- price per m2 ---------------- */
c("land priced per m2", `Tanah dijual\nLuas 500 m2\nHarga 2jt/m2`, { expect: { propertyType: "land", landArea: 500, price: 1 * B } });
c("land per meter wording", `Dijual tanah LT 300 harga Rp 2,5 jt per meter`, { expect: { landArea: 300, price: 750 * J } });
c("per m2 but no area: price unknown, flagged", `Dijual tanah harga 2jt/m2`, { expect: { price: null }, flags: ["price"] });

/* ---------------- rentals ---------------- */
c("rent per year (thn)", `Disewakan rumah 30jt/thn`, { expect: { listingType: "rent", price: 30 * J, rentalPeriod: "year" } });
c("rent per tahun (Sewa Rp .. per tahun)", `DISEWAKAN GUDANG\nSewa Rp 180.000.000 per tahun`, { expect: { listingType: "rent", price: 180 * J, rentalPeriod: "year", propertyType: "warehouse" } });
c("rent perbulan (no space)", `Disewakan rumah Rp 2.500.000 perbulan`, { expect: { rentalPeriod: "month", price: 2_500_000 } });
c("rent: both periods, the one next to the price wins", `Disewakan rumah 3jt/bulan atau 33jt/tahun`, { expect: { price: 3 * J, rentalPeriod: "month" } });
c("rent: min sewa 1 tahun does not make it yearly", `Disewakan rumah Rp 3jt/bulan, min sewa 1 tahun`, { expect: { rentalPeriod: "month" } });
c("rent without a period is flagged", `Disewakan rumah Rp 35jt`, { expect: { listingType: "rent", rentalPeriod: null }, flags: ["rentalPeriod"] });
c("sale never gets a period", `Dijual rumah 500jt`, { expect: { rentalPeriod: null } });

/* ---------------- property types ---------------- */
for (const [txt, type] of [
  ["Dijual rumah 2 lantai", "house"], ["Dijual ruko 3 lantai", "ruko"], ["Dijual rumah toko strategis", "ruko"], ["Dijual rukan", "office"], ["Dijual kantor", "office"],
  ["Dijual tanah", "land"], ["Dijual kavling siap bangun", "land"], ["Dijual lahan luas", "land"], ["Dijual apartemen", "apartment"], ["Dijual condotel", "apartment"],
  ["Dijual studio", "apartment"], ["Dijual villa", "villa"], ["Dijual vila", "villa"], ["Dijual gudang", "warehouse"], ["Dijual pabrik", "warehouse"],
  ["Dijual cluster minimalis", "house"], ["Dijual townhouse", "house"], ["Dijual kost 10 kamar", "other"], ["Dijual kios", "other"], ["For sale warehouse", "warehouse"],
] as [string, string][]) c(`type: ${txt}`, txt, { expect: { propertyType: type } });
c("type: first word in the title wins over later mentions", `DIJUAL RUMAH dekat kantor camat dan ruko`, { expect: { propertyType: "house" }, noFlags: ["propertyType"] });
c("type: 'Jl. Rumah Sakit' in the address does not make it a house", `Dijual ruko Jl. Rumah Sakit No. 3`, { expect: { propertyType: "ruko" } });
c("type: nothing in the title, two kinds in the body is flagged", `Info properti\nada rumah dan tanah luas`, { flags: ["propertyType"] });

/* ---------------- areas ---------------- */
c("area: LT/LB pair", `Rumah dijual LT/LB 120/90`, { expect: { landArea: 120, buildingArea: 90 } });
c("area: reversed LB/LT pair", `Rumah dijual LB/LT 90/120`, { expect: { landArea: 120, buildingArea: 90 } });
c("area: dotted labels", `Rumah dijual L.T 120 L.B 90`, { expect: { landArea: 120, buildingArea: 90 } });
c("area: words with meter", `Rumah dijual luas tanah 120 meter luas bangunan 90 meter`, { expect: { landArea: 120, buildingArea: 90 } });
c("area: tanah/bangunan with units", `Rumah dijual tanah 120 m2 / bangunan 90 m2`, { expect: { landArea: 120, buildingArea: 90 } });
c("area: decimal comma", `Rumah dijual LT 120,5 m2`, { expect: { landArea: 120.5 } });
c("area: thousand separator", `Tanah dijual 1.200 m2`, { expect: { landArea: 1200 } });
c("area: hectare", `Tanah dijual 2 hektar harga 5M`, { expect: { landArea: 20000, price: 5 * B } });
c("area: ha abbreviation", `Dijual tanah 1,5 ha`, { expect: { landArea: 15000 } });
c("area: dimensions 10x20", `TANAH KAVLING DIJUAL\nUkuran 10x20\nHarga 450jt`, { expect: { landArea: 200, price: 450 * J } });
c("area: dimensions with ×", `Kavling 8×15 harga 300jt`, { expect: { landArea: 120 } });
c("area: building dimensions", `Rumah dijual LT 200 ukuran bangunan 8x12`, { expect: { landArea: 200, buildingArea: 96 } });
c("area: tipe 36/72", `Rumah type 36/72 harga 450jt`, { expect: { buildingArea: 36, landArea: 72 } });
c("area: tipe 45 only", `Rumah tipe 45 harga 450jt`, { expect: { buildingArea: 45 } });
c("area trap: 'lt 2' is a floor", `Rumah 2 lt, LT 90 LB 80`, { expect: { landArea: 90, buildingArea: 80 } });
c("area trap: apartment 'lt 15' is a floor", `Apartemen lt 15 studio 28 m2 Rp 3,5jt/bulan disewakan`, { expect: { landArea: null, buildingArea: 28 } });
c("area: land ad 'Luas 500 m2'", `Tanah dijual Luas 500 m2`, { expect: { landArea: 500 } });
c("area: ruko bare m2 is the building", `Dijual ruko 3 lantai luas 240 m2`, { expect: { buildingArea: 240 } });
c("area: house with only 'Luas 120 m2' is ambiguous, not guessed", `Dijual rumah luas 120 m2`, { expect: { landArea: null, buildingArea: null }, notes: ["120"], flags: ["size"] });
c("area: 'LT 120M' capital M is not a price", `Dijual rumah LT 120M LB 90M harga 800jt`, { expect: { landArea: 120, buildingArea: 90, price: 800 * J } });

/* ---------------- rooms ---------------- */
for (const [txt, bed, bath] of [
  ["KT 3 KM 2", 3, 2], ["KT: 3\nKM: 2", 3, 2], ["3 KT / 2 KM", 3, 2], ["3KT 2KM", 3, 2], ["3 kamar tidur, 2 kamar mandi", 3, 2], ["Kamar tidur 3, kamar mandi 2", 3, 2],
  ["Kamar tidur: 4\nKamar mandi: 3", 4, 3], ["3BR/2BA", 3, 2], ["3 BR 2 BA", 3, 2], ["Bedroom 3 Bathroom 2", 3, 2], ["3 bedrooms, 2 bathrooms", 3, 2], ["KT 3+1 KM 2", 3, 2],
  ["3 kamar tidur + 2 kamar mandi", 3, 2], ["KT 3 / KM 2", 3, 2], ["K.T 3 K.M 2", 3, 2], ["Kamar Tidur : 3 Kamar Mandi : 2", 3, 2], ["3 kamar", 3, null], ["2 WC", null, 2],
  ["LB 90 KT 3 KM 2", 3, 2], ["LT 120 LB 90 3KT 2KM", 3, 2], ["Rumah 2 lantai 3 kamar tidur 2 kamar mandi", 3, 2],
] as [string, number | null, number | null][]) c(`rooms: ${txt.replace(/\n/g, " | ")}`, `Dijual rumah\n${txt}`, { expect: { bedrooms: bed, bathrooms: bath } });
c("rooms trap: Km road marker with words", `Dijual rumah Jl. Perintis Kemerdekaan Km 10\n3 kamar tidur, 2 kamar mandi`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("rooms trap: Km road marker with abbreviations", `Dijual rumah Jl. Perintis Kemerdekaan Km 10\nKT 3 KM 2`, { expect: { bedrooms: 3, bathrooms: 2 } });
c("rooms trap: Km road marker alone", `Dijual rumah Jl. Poros Malino Km 12 harga 500jt`, { expect: { bathrooms: null, price: 500 * J } });
c("rooms trap: Km marker on a Lokasi line", `Lokasi: Poros Malino Km 12\nDijual rumah KT 2 KM 1`, { expect: { bathrooms: 1, bedrooms: 2 } });
c("rooms: 'kamar mandi dalam' has no count", `Dijual rumah kamar mandi dalam, 3 kamar tidur`, { expect: { bedrooms: 3, bathrooms: null } });
c("rooms trap: carport/floors are not rooms", `Dijual rumah 2 lantai, carport 2 mobil, 3 kamar tidur`, { expect: { bedrooms: 3 } });
c("rooms: kost 10 kamar", `KOST DIJUAL 10 kamar Rp 1,5 M`, { expect: { bedrooms: 10 } });

/* ---------------- electricity ---------------- */
for (const [txt, w] of [["Listrik 2200 watt", 2200], ["Listrik: 4400 VA", 4400], ["PLN 3500", 3500], ["Daya 1.300 watt", 1300], ["Listrik 10.000 VA", 10000], ["2200w", 2200], ["2200 watt", 2200], ["Daya listrik 1300", 1300], ["listrik 900 va", 900]] as [string, number][]) {
  c(`electricity: ${txt}`, `Dijual rumah harga 800jt\n${txt}`, { expect: { electricityWatts: w, price: 800 * J } });
}
c("electricity trap: year/price near it", `Dijual rumah Harga 1.500.000.000 listrik 2200`, { expect: { electricityWatts: 2200, price: 1.5 * B } });
c("electricity: none", `Dijual rumah tahun 2020`, { expect: { electricityWatts: null } });

/* ---------------- phone ---------------- */
for (const [txt, p] of [
  ["0812-3456-7890", "081234567890"], ["0812 3456 7890", "081234567890"], ["081234567890", "081234567890"], ["+62 812-9999-0000", "+6281299990000"], ["628129999000", "628129999000"],
  ["0811-4444-555", "08114444555"], ["0812.5555.1234", "081255551234"], ["0852-1234-5678", "085212345678"], ["+6281234567890", "+6281234567890"],
] as [string, string][]) c(`phone: ${txt}`, `Dijual rumah 500jt\nWA ${txt}`, { expect: { contactPhone: p, price: 500 * J } });
c("phone: landline when no mobile", `Dijual rumah 500jt telp 0411-456789`, { expect: { contactPhone: "0411456789", price: 500 * J } });
c("phone: first of several", `Dijual rumah 500jt hub 0812-1111-2222 / 0813-3333-4444`, { expect: { contactPhone: "081211112222" } });
c("phone: name before", `Dijual rumah 500jt Hubungi Pak Budi 0812-1111-2222`, { expect: { contactName: "Budi" } });
c("phone: name in brackets after", `Dijual rumah 500jt WA 0812-1111-2222 (Andi)`, { expect: { contactName: "Andi" } });

/* ---------------- location ---------------- */
c("loc: no commas", `Dijual rumah Kec Panakkukang Kota Makassar harga 500jt`, { expect: { district: "Panakkukang", city: "Makassar", province: "Sulawesi Selatan" } });
c("loc: lowercase", `dijual rumah kec. panakkukang, kota makassar`, { expect: { district: "Panakkukang", city: "Makassar" } });
c("loc: Kab. Gowa", `Dijual tanah Kab. Gowa Kec. Bontomarannu`, { expect: { city: "Gowa", district: "Bontomarannu" } });
c("loc: labelled lines", `Dijual rumah\nKelurahan: Pandang\nKecamatan: Panakkukang\nKota: Makassar`, { expect: { village: "Pandang", district: "Panakkukang", city: "Makassar" } });
c("loc: desa", `Dijual tanah Desa Bontomarannu Kab Gowa`, { expect: { village: "Bontomarannu", city: "Gowa" } });
c("loc: multi-word district", `Dijual rumah Kec. Tamalanrea Jaya, Kota Makassar`, { expect: { district: "Tamalanrea Jaya", city: "Makassar" } });
c("loc: city alone, no 'Kota'", `Dijual rumah di Makassar harga 500jt`, { expect: { city: "Makassar", province: "Sulawesi Selatan" } });
c("loc: Sulsel alias", `Dijual rumah Gowa Sulsel`, { expect: { city: "Gowa", province: "Sulawesi Selatan" } });
c("loc: another province", `Dijual rumah Kec. Coblong Kota Bandung`, { expect: { city: "Bandung", province: "Jawa Barat", district: "Coblong" } });
c("loc: unknown city after Kota", `Dijual rumah Kota Kendari`, { expect: { city: "Kendari" } });
c("loc trap: 'dalam kota yang strategis' is not a city", `Dijual rumah di dalam kota yang strategis harga 700jt`, { expect: { city: null }, flags: ["location"] });
c("loc trap: 'kec' inside another word", `Dijual rumah kecil harga 300jt`, { expect: { district: null } });
c("loc trap: 'Bone' the word vs the regency", `Dijual rumah dekat tulang bone`, { expect: { city: null } });
c("loc: Bone regency capitalised", `Dijual rumah di Bone`, { expect: { city: "Bone" } });
c("loc: unlabelled neighbourhood is flagged", `Dijual rumah di Antang harga 500jt`, { flags: ["location"] });
c("loc: address from 'Daerah'", `Dijual kavling Daerah Sudiang, Kota Makassar`, { expect: { city: "Makassar", address: "Sudiang" } });
c("loc: komplek address", `Dijual rumah Perumahan Citraland Blok A12 No 5 Kota Makassar`, { expect: { city: "Makassar" } });
c("loc: Jl with number and admin parts stripped", `Dijual rumah Jl. Boulevard No. 5, Kel. Pandang, Kec. Panakkukang, Kota Makassar`, { expect: { address: "Jl. Boulevard No. 5", village: "Pandang" } });
c("loc: postal code", `Dijual rumah Kode Pos: 90245`, { expect: { postalCode: "90245" } });
c("loc: coordinates", `Dijual tanah Lokasi: -5.1477, 119.4327`, { expect: { latitude: -5.1477, longitude: 119.4327 } });
c("loc: coordinates inside a maps link", `Dijual tanah https://www.google.com/maps/@-5.147712,119.432731,17z`, { expect: { latitude: -5.147712, longitude: 119.432731 }, notes: ["Maps:"] });
c("loc: short maps link kept in notes", `Dijual rumah https://maps.app.goo.gl/AbCdEf123`, { notes: ["https://maps.app.goo.gl/AbCdEf123"] });
c("loc trap: far-away numbers are not coordinates", `Dijual rumah 12.3456, 200.1234`, { expect: { latitude: null, longitude: null } });

/* ---------------- notes, certificate, facilities ---------------- */
for (const [txt, cert] of [["SHM", "SHM"], ["Sertifikat Hak Milik", "SHM"], ["SHGB", "SHGB"], ["HGB", "HGB"], ["Girik", "Girik"], ["AJB", "AJB"], ["PPJB", "PPJB"]] as [string, string][]) {
  c(`cert: ${txt}`, `Dijual rumah ${txt}`, { notes: [`Certificate: ${cert}`] });
}
c("notes: harga pas", `Dijual rumah 500jt harga pas`, { notes: ["Price fixed"] });
c("notes: nego tipis", `Dijual rumah 500jt nego tipis`, { notes: ["Price negotiable"] });
c("notes: orientation, road, floors", `Dijual rumah 2 lantai hadap selatan lebar jalan 6 m`, { notes: ["Faces Selatan", "Road width: 6 m", "Floors: 2"] });
c("notes: free-text lines kept", `Dijual rumah\nFasilitas: sumur bor, canopy, kitchen set\nKeterangan: siap huni`, { notes: ["sumur bor", "siap huni"] });
c("facilities: standard set", `Dijual rumah carport garasi kolam renang taman AC water heater CCTV security gym`, { has: ["Carport", "Garage", "Swimming pool", "Garden", "AC", "Water heater", "CCTV", "Security 24h", "Gym"] });
c("facilities: furnished", `Disewakan apartemen full furnished`, { has: ["Furnished"] });
c("facilities trap: unfurnished / non furnished", `Disewakan rumah unfurnished. Apartemen lain non furnished`, { hasNot: ["Furnished"] });
c("facilities trap: 'ac' inside words", `Dijual rumah dekat sekolah dan pacuan kuda`, { hasNot: ["AC"] });

/* ---------------- title ---------------- */
c("title: skips greeting lines", `Selamat pagi\nAssalamualaikum\nDIJUAL RUMAH 2 LANTAI SHM\nHarga 800jt`, { expect: { title: "Dijual Rumah 2 Lantai SHM" } });
c("title: not all caps stays as typed", `Dijual rumah type 45 di Antang\nHarga 400jt`, { expect: { title: "Dijual rumah type 45 di Antang" } });
c("title: long line is cut at a word", `Dijual rumah ${"sangat strategis ".repeat(12)}`, {});
c("title: synthesized when nothing usable", `Rp 500jt LT 100`, {});

/* ============================== run ============================== */
const FIELDS: (keyof Fields)[] = ["title", "listingType", "price", "rentalPeriod", "propertyType", "address", "village", "district", "city", "province", "postalCode", "landArea", "buildingArea", "bedrooms", "bathrooms", "electricityWatts", "contactPhone", "contactName", "latitude", "longitude"];
let failed = 0;
const failures: string[] = [];
for (const k of cases) {
  const got = parse(k.text);
  const bad: string[] = [];
  for (const [f, want] of Object.entries(k.expect ?? {})) {
    const have = got[f as keyof Fields];
    if (JSON.stringify(have) !== JSON.stringify(want)) bad.push(`${f}: want ${JSON.stringify(want)} got ${JSON.stringify(have)}`);
  }
  for (const x of k.has ?? []) if (!got.facilities.includes(x)) bad.push(`missing facility ${x} (got ${got.facilities.join(",") || "none"})`);
  for (const x of k.hasNot ?? []) if (got.facilities.includes(x)) bad.push(`unexpected facility ${x}`);
  for (const x of k.flags ?? []) if (!got.uncertain.includes(x)) bad.push(`should flag "${x}" (flags: ${got.uncertain.join(",") || "none"})`);
  for (const x of k.noFlags ?? []) if (got.uncertain.includes(x)) bad.push(`should NOT flag "${x}"`);
  for (const x of k.notes ?? []) if (!(got.notes ?? "").includes(x)) bad.push(`notes should contain "${x}" (notes: ${JSON.stringify(got.notes)})`);
  for (const x of k.notesNot ?? []) if ((got.notes ?? "").includes(x)) bad.push(`notes should NOT contain "${x}"`);
  if (bad.length) {
    failed++;
    failures.push(`FAIL  ${k.name}\n        ${bad.join("\n        ")}`);
  }
}
console.log(`HAND CORPUS: ${cases.length - failed}/${cases.length} passed`);
if (failures.length) console.log(failures.join("\n"));

/* ---- robustness: never throws, always fast, output always well-formed ---- */
const hostile: Record<string, string> = {
  digits: "harga " + "1".repeat(4000), dots: "Rp " + "1.".repeat(2000), commas: "harga " + "1,000".repeat(800), spaces: "Jl" + " ".repeat(4000) + "x",
  words: "kec " + "a ".repeat(2000), kota: "Kota " + "Makassar ".repeat(400), newlines: "\n".repeat(5000) + "dijual", jl: "Jl. ".repeat(1500), unicode: "🏠".repeat(3000),
  bigRooms: "kamar tidur 081234567890123 KT 99999999999 LT 99999999999999999999", kt: "KT ".repeat(2000), nums: "1 ".repeat(3000), mixed: "Rp 1.2 M 3 KT 2 KM LT 100 ".repeat(150),
  ltLines: "lt\n".repeat(2000), rpLines: "Rp\n".repeat(2000), labels: "lokasi: ".repeat(700), harga: "harga ".repeat(1000), kecLines: "kec\n".repeat(2000), colons: ":".repeat(5000),
  dashes: "- ".repeat(3000), digitsDots: "1.2.3.4.5.".repeat(500), plus: "+".repeat(5000), slashes: "1/".repeat(2500), parens: "(".repeat(5000), caps: "DIJUAL RUMAH ".repeat(400),
  empty: "", ws: "   \n\t ", nulls: "\u0000\u0000dijual\u0000", rtl: "‮dijual rumah‬ 500jt", longline: "a".repeat(100000),
};
parse("warm up Dijual rumah"); // first call compiles the Unicode regexes; don't count that
let robustFail = 0;
let slowest = 0;
let slowestName = "";
for (const [name, text] of Object.entries(hostile)) {
  const t = performance.now();
  try {
    const r = parse(text);
    if (r.price !== null && (r.price < 100_000 || r.price > 1e13)) throw new Error(`price out of range ${r.price}`);
    if (r.bedrooms !== null && (r.bedrooms < 0 || r.bedrooms > 50)) throw new Error(`bedrooms out of range ${r.bedrooms}`);
    if (!Array.isArray(r.uncertain) || !Array.isArray(r.facilities)) throw new Error("malformed output");
  } catch (e) {
    robustFail++;
    console.log(`FAIL  robustness: ${name}: ${(e as Error).message}`);
  }
  const ms = performance.now() - t;
  if (ms > slowest) [slowest, slowestName] = [ms, name];
  if (ms > 120) {
    robustFail++;
    console.log(`FAIL  robustness: ${name} took ${ms.toFixed(0)} ms`);
  }
}
console.log(`ROBUSTNESS: ${Object.keys(hostile).length - robustFail}/${Object.keys(hostile).length} ok (slowest: ${slowestName} ${slowest.toFixed(0)} ms)`);

const genFailed = runGenerated(parse, FIELDS as string[]);
process.exit(failed || robustFail || genFailed ? 1 : 0);
