import type { DraftFields } from "@/lib/draft-extract";

const PROPERTY_TYPES = ["house", "apartment", "land", "ruko", "office", "warehouse", "villa", "other"];

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

const num = (v: unknown, min: number, max: number) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const int = (v: unknown, min: number, max: number) => {
  const n = num(v, min, max);
  return n === null ? null : Math.round(n);
};

/**
 * Forces any parser output (rules or Claude) into values the listing form and database accept:
 * known enums, finite numbers inside sane ranges, bounded strings. Anything else becomes null for the reviewer.
 */
export function sanitizeFields(raw: Partial<Record<keyof DraftFields, unknown>>): DraftFields {
  const listingType = raw.listingType === "sell" || raw.listingType === "rent" ? raw.listingType : null;
  const propertyType = typeof raw.propertyType === "string" && PROPERTY_TYPES.includes(raw.propertyType) ? raw.propertyType : null;
  const price = int(raw.price, 100_000, 1e13);
  const postal = str(raw.postalCode, 10);

  const facilities = Array.isArray(raw.facilities)
    ? [...new Set(raw.facilities.map((f) => str(f, 40)).filter((f): f is string => !!f && f.length >= 2))].slice(0, 20)
    : [];
  const uncertain = Array.isArray(raw.uncertain) ? raw.uncertain.map((u) => str(u, 40)).filter((u): u is string => !!u) : [];
  for (const [name, value] of [["listingType", listingType], ["price", price], ["propertyType", propertyType]] as const) {
    if (value === null && !uncertain.includes(name)) uncertain.push(name);
  }

  return {
    title: str(raw.title, 200),
    listingType,
    price,
    rentalPeriod: listingType === "rent" && (raw.rentalPeriod === "month" || raw.rentalPeriod === "year") ? raw.rentalPeriod : null,
    propertyType,
    address: str(raw.address, 300),
    village: str(raw.village, 100),
    district: str(raw.district, 100),
    city: str(raw.city, 100),
    province: str(raw.province, 100),
    postalCode: postal && /^\d{5}$/.test(postal) ? postal : null,
    landArea: num(raw.landArea, 1, 1e8),
    buildingArea: num(raw.buildingArea, 1, 1e8),
    bedrooms: int(raw.bedrooms, 0, 50),
    bathrooms: int(raw.bathrooms, 0, 50),
    electricityWatts: int(raw.electricityWatts, 100, 1e6),
    facilities,
    contactPhone: str(raw.contactPhone, 30),
    notes: str(raw.notes, 2000),
    uncertain: [...new Set(uncertain)],
  };
}
