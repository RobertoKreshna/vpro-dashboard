import { z } from "zod";

/** Validation shared by the listing form and the Google Sheets import. */
export const listingSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200),
    listingType: z.enum(["sell", "rent"], { error: "Choose Sell or Rent" }),
    price: z.number({ error: "Price is required" }).int().positive("Price must be greater than 0"),
    rentalPeriod: z.enum(["month", "year"]).nullable(),
    propertyType: z.enum(
      ["house", "apartment", "land", "ruko", "office", "warehouse", "villa", "other"],
      { error: "Choose a property type" },
    ),
    address: z.string().min(1, "Address is required").max(300),
    village: z.string().min(1, "Village is required").max(100),
    district: z.string().min(1, "District is required").max(100),
    city: z.string().min(1, "City / regency is required").max(100),
    province: z.string().min(1, "Province is required").max(100),
    postalCode: z.string().regex(/^\d{5}$/, "Postal code must be 5 digits").nullable(),
    landArea: z.number().min(0, "Cannot be negative").nullable(),
    buildingArea: z.number().min(0, "Cannot be negative").nullable(),
    bedrooms: z.number().int().min(0, "Cannot be negative"),
    bathrooms: z.number().int().min(0, "Cannot be negative"),
    electricityWatts: z.number().int().min(0, "Cannot be negative").nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    salesCode: z.string().min(1, "Sales code is required"),
    status: z.enum(["available", "reserved", "sold", "rented"]),
    notes: z.string().max(2000).nullable(),
    facilities: z.array(z.string()),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    path: ["coordinates"],
    message: "Enter coordinates as \"latitude, longitude\", e.g. -6.2088, 106.8456",
  })
  .refine((v) => v.listingType !== "rent" || v.rentalPeriod, {
    path: ["rentalPeriod"],
    message: "Choose the rental period",
  });

/** Accepts what Google Maps copies: "-6.2088, 106.8456" (also "-6.2088 106.8456"). */
export function parseCoordinates(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
