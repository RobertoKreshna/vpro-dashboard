/**
 * Google Sheets template for importing listings into the Dashboard.
 *
 * Setup (once): open the sheet → Extensions → Apps Script → paste this file → run setup() → authorize.
 * Importing adds every row as a new listing, so run an import once per batch and delete imported rows afterwards.
 *
 * Keep the allowed values below in sync with src/lib/constants.ts and the listing schema.
 */

const SHEET = "Listings";
const CODES_SHEET = "Sales Codes";
// The importer skips any row whose title starts with [CONTOH].
const LAST_ROW = 2000; // dropdowns and checks are applied down to this row

// header → [width, note]. Order here is the column order in the sheet.
const COLUMNS = [
  ["title", 260, "Required, max 200 chars"],
  ["listing_type", 110, "Required"],
  ["price", 130, "Required. Whole number, no dots or \"Rp\""],
  ["rental_period", 110, "Required when listing_type is rent"],
  ["property_type", 120, "Required"],
  ["address", 260, "Required, max 300 chars"],
  ["village", 140, "Required (kelurahan/desa)"],
  ["district", 140, "Required (kecamatan)"],
  ["city", 140, "Required (kota/kabupaten)"],
  ["province", 140, "Required"],
  ["postal_code", 100, "Exactly 5 digits"],
  ["land_area", 100, "m², decimals allowed"],
  ["building_area", 110, "m², decimals allowed"],
  ["bedrooms", 90, "Whole number, default 0"],
  ["bathrooms", 90, "Whole number, default 0"],
  ["electricity_watts", 120, "Whole number, e.g. 2200"],
  ["coordinates", 170, "\"lat, lng\" as copied from Google Maps"],
  ["sales_code", 110, "Required. Must exist and be active in the Dashboard"],
  ["status", 100, "Default available"],
  ["facilities", 260, "Comma separated, e.g. AC, Carport, Gym"],
  ["notes", 260, "Max 2000 chars"],
];

const DROPDOWNS = {
  listing_type: ["sell", "rent"],
  rental_period: ["month", "year"],
  property_type: ["house", "apartment", "land", "ruko", "office", "warehouse", "villa", "other"],
  status: ["available", "reserved", "sold", "rented"],
};

const EXAMPLE = {
  title: "[CONTOH] Rumah 2 lantai di Pondok Indah",
  listing_type: "sell",
  price: 4500000000,
  rental_period: "",
  property_type: "house",
  address: "Jl. Metro Alam 5 No. 12",
  village: "Pondok Pinang",
  district: "Kebayoran Lama",
  city: "Jakarta Selatan",
  province: "DKI Jakarta",
  postal_code: "12310",
  land_area: 300,
  building_area: 250,
  bedrooms: 4,
  bathrooms: 3,
  electricity_watts: 4400,
  coordinates: "-6.2655, 106.7838",
  sales_code: "SLS-001",
  status: "available",
  facilities: "AC, Carport, Swimming pool",
  notes: "Contoh baris, tidak ikut diimport.",
};

function setup() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  const col = (name) => COLUMNS.findIndex((c) => c[0] === name) + 1;
  const letter = (name) => columnLetter(col(name));

  // Header
  sheet.clear();
  sheet.clearNotes();
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS.map((c) => c[0])])
    .setFontWeight("bold").setBackground("#1f2937").setFontColor("#ffffff");
  COLUMNS.forEach(([name, width, note], i) => {
    sheet.setColumnWidth(i + 1, width);
    sheet.getRange(1, i + 1).setNote(note);
  });
  sheet.setFrozenRows(1);

  // Example row (row 2)
  sheet.getRange(2, 1, 1, COLUMNS.length).setValues([COLUMNS.map((c) => EXAMPLE[c[0]])])
    .setFontColor("#6b7280").setFontStyle("italic").setBackground("#f3f4f6");

  // Sales codes live on their own tab so the dropdown can follow them.
  const codes = ss.getSheetByName(CODES_SHEET) || ss.insertSheet(CODES_SHEET);
  if (codes.getLastRow() === 0) {
    codes.getRange("A1").setValue("sales_code").setFontWeight("bold");
    codes.getRange("A2").setValue("SLS-001");
    codes.getRange("C1").setValue("Isi daftar sales code yang aktif di Dashboard (satu per baris, kolom A).");
  }

  // Dropdowns
  const rows = LAST_ROW - 1;
  Object.entries(DROPDOWNS).forEach(([name, values]) => {
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    sheet.getRange(2, col(name), rows).setDataValidation(rule);
  });
  sheet.getRange(2, col("sales_code"), rows).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(codes.getRange("A2:A"), true).setAllowInvalid(false).build(),
  );

  // Format checks
  const whole = (name) => sheet.getRange(2, col(name), rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
      .setHelpText("Whole number >= 0").build());
  ["bedrooms", "bathrooms", "electricity_watts", "land_area", "building_area"].forEach(whole);
  sheet.getRange(2, col("price"), rows).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThan(0).setAllowInvalid(false)
      .setHelpText("Whole number > 0, no dots or Rp").build());
  sheet.getRange(2, col("postal_code"), rows).setNumberFormat("@").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=OR(${letter("postal_code")}2="",REGEXMATCH(${letter("postal_code")}2&"","^\\d{5}$"))`)
      .setAllowInvalid(false).setHelpText("Exactly 5 digits").build());
  sheet.getRange(2, col("coordinates"), rows).setNumberFormat("@").setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireFormulaSatisfied(`=OR(${letter("coordinates")}2="",REGEXMATCH(${letter("coordinates")}2&"","^-?\\d+(\\.\\d+)?\\s*[,\\s]\\s*-?\\d+(\\.\\d+)?$"))`)
      .setAllowInvalid(false).setHelpText("e.g. -6.2088, 106.8456").build());

  // Highlight rent rows missing rental_period.
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND($${letter("listing_type")}2="rent",$${letter("rental_period")}2="")`)
      .setBackground("#fecaca").setRanges([sheet.getRange(2, col("rental_period"), rows)]).build(),
  ]);

  ss.setActiveSheet(sheet);
}

function columnLetter(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
