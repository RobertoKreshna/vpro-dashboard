import "server-only";
import type { z } from "zod";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { salesCodes } from "@/db/schema";
import { parseIDR } from "@/lib/format";
import { listingSchema, parseCoordinates } from "@/lib/listing-schema";

/** Tab the importer reads, and the title prefix of the template's example row, which is skipped (see scripts/google-sheet/listings-template.gs). */
export const SHEET_TAB = "Listings";
const EXAMPLE_PREFIX = "[CONTOH]";
const MAX_ROWS = 2000;
const MAX_BYTES = 5_000_000;
const MAX_FILE_BYTES = 2_000_000;

type Column =
  | "title" | "listing_type" | "price" | "rental_period" | "property_type" | "address" | "village"
  | "district" | "city" | "province" | "postal_code" | "land_area" | "building_area" | "bedrooms" | "bathrooms"
  | "electricity_watts" | "coordinates" | "sales_code" | "status" | "facilities" | "notes";
const REQUIRED = ["title", "listing_type", "price", "property_type", "address", "village", "district", "city", "province", "sales_code"];

export type PlanRow = {
  line: number;
  title: string;
  action: "create" | "error";
  errors: string[];
};
export type ImportPlan = { rows: PlanRow[]; counts: Record<PlanRow["action"], number> };

type Values = z.output<typeof listingSchema>;
export type PreparedImport = {
  plan: ImportPlan;
  creates: Values[];
  facilityNames: string[];
};

/** Only docs.google.com sheet links are fetched, and the request URL is rebuilt from the sheet id alone. */
function csvUrl(link: string): string | null {
  const m = link.trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (!m) return null;
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(SHEET_TAB)}`;
}

/** RFC 4180 CSV. Parsed by hand because spreadsheet libraries turn "012" into 12. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

type Table = { header: string[]; rows: { line: number; cells: string[] }[] };

/** Header check + row cleanup shared by both sources. `table[0]` is the header row. */
function toTable(table: string[][], where: string): { error: string } | Table {
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return { error: `This doesn't look like the listings template. Missing columns: ${missing.join(", ")}. ${where}` };
  }
  const rows = table.slice(1).map((cells, i) => ({ line: i + 2, cells })).filter((r) => r.cells.some((c) => c.trim() !== ""));
  if (rows.length > MAX_ROWS) return { error: `The file has ${rows.length} rows; the limit is ${MAX_ROWS} per import.` };
  return { header, rows };
}

async function fetchSheet(link: string): Promise<{ error: string } | Table> {
  const url = csvUrl(link);
  if (!url) return { error: "That doesn't look like a Google Sheets link. Copy it from the address bar of the sheet." };
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  } catch {
    return { error: "Couldn't reach Google Sheets. Try again in a moment." };
  }
  const shareHint = "Couldn't read the sheet. Share it as \"Anyone with the link → Viewer\" and check that it has a tab named \"" + SHEET_TAB + "\".";
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("text/csv")) return { error: shareHint };
  const text = await res.text();
  if (text.length > MAX_BYTES) return { error: "The sheet is too large to import in one go." };
  return toTable(parseCsv(text), `Check that the "${SHEET_TAB}" tab exists.`);
}

async function readFile(file: File): Promise<{ error: string } | Table> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: "Upload an Excel file (.xlsx) or a .csv." };
  if (file.size > MAX_FILE_BYTES) return { error: "That file is too large. Keep it under 2 MB (about 2,000 listings)." };
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
  } catch {
    return { error: "Couldn't read that file. Is it a valid Excel or CSV file?" };
  }
  // Prefer the tab named like the template; otherwise the first one.
  const name = wb.SheetNames.find((n) => n.toLowerCase() === SHEET_TAB.toLowerCase()) ?? wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws) return { error: "That file has no sheets." };
  // raw: false → cells as displayed ("012" stays "012", dates and numbers as shown in Excel).
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: true })
    .map((r) => r.map((c) => String(c ?? "")));
  return toTable(table, `Check that the first row has the template's column names.`);
}

export type ImportSource = { link: string } | { file: File };

/** Reads the Google Sheet or Excel file and works out, per row, whether it creates a listing or has errors. Writes nothing. */
export async function prepareImport(source: ImportSource): Promise<{ error: string } | PreparedImport> {
  const sheet = "file" in source ? await readFile(source.file) : await fetchSheet(source.link);
  if ("error" in sheet) return sheet;

  const codes = await db.select({ code: salesCodes.code, isActive: salesCodes.isActive }).from(salesCodes);
  const codeMap = new Map(codes.map((c) => [c.code, c.isActive]));

  const out: PreparedImport = { plan: { rows: [], counts: { create: 0, error: 0 } }, creates: [], facilityNames: [] };

  for (const { line, cells } of sheet.rows) {
    const get = (col: Column) => {
      const i = sheet.header.indexOf(col);
      return i < 0 ? "" : (cells[i] ?? "").trim();
    };
    if (get("title").startsWith(EXAMPLE_PREFIX)) continue;

    const errors: string[] = [];
    const add = (action: PlanRow["action"]) => {
      out.plan.rows.push({ line, title: get("title"), action, errors });
      out.plan.counts[action]++;
    };

    const decimalOf = (col: Column) => {
      const raw = get(col).replace(",", ".");
      if (!raw) return null;
      const n = Number(raw);
      if (!Number.isFinite(n)) { errors.push(`${col}: "${get(col)}" is not a number.`); return null; }
      return n;
    };
    const watts = decimalOf("electricity_watts");
    const coordText = get("coordinates");
    const coords = coordText ? parseCoordinates(coordText) : null;

    const listingType = get("listing_type").toLowerCase();
    const parsed = listingSchema.safeParse({
      title: get("title"),
      listingType,
      price: parseIDR(get("price")) ?? undefined,
      rentalPeriod: listingType === "rent" ? get("rental_period").toLowerCase() || null : null,
      propertyType: get("property_type").toLowerCase(),
      address: get("address"),
      village: get("village"),
      district: get("district"),
      city: get("city"),
      province: get("province"),
      postalCode: get("postal_code") || null,
      landArea: decimalOf("land_area"),
      buildingArea: decimalOf("building_area"),
      bedrooms: Math.trunc(decimalOf("bedrooms") ?? 0),
      bathrooms: Math.trunc(decimalOf("bathrooms") ?? 0),
      electricityWatts: watts === null ? null : Math.trunc(watts),
      latitude: coords?.[0] ?? null,
      longitude: coords?.[1] ?? null,
      salesCode: get("sales_code"),
      status: get("status").toLowerCase() || "available",
      notes: get("notes") || null,
      facilities: get("facilities").split(",").map((f) => f.replace(/\s+/g, " ").trim()).filter(Boolean),
    });
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${String(i.path[0] ?? "row")}: ${i.message}`);
    }
    if (coordText && !coords) errors.push('coordinates: use the format "-6.2088, 106.8456".');

    if (parsed.success) {
      const active = codeMap.get(parsed.data.salesCode);
      if (active === undefined) errors.push(`sales_code: "${parsed.data.salesCode}" doesn't exist in the Dashboard.`);
      else if (!active) errors.push(`sales_code: "${parsed.data.salesCode}" is inactive.`);
    }
    if (errors.length || !parsed.success) { add("error"); continue; }

    const values: Values = { ...parsed.data, facilities: [...new Set(parsed.data.facilities)] };
    out.creates.push(values);
    out.facilityNames.push(...values.facilities);
    add("create");
  }
  out.facilityNames = [...new Set(out.facilityNames)];
  return out;
}
