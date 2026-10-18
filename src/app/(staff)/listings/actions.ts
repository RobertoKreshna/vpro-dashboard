"use server";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { invalidateDashboard } from "@/lib/dashboard-cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { facilities, listingDrafts, listingPhotos, listings, salesCodes } from "@/db/schema";
import { changedKeys, logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/constants";
import { decimal, integer, isUuid, money, optStr, str, zodErrors } from "@/lib/form-utils";
import { createClient } from "@/lib/supabase/server";

export type ListingFormState = { errors?: Record<string, string>; message?: string };

const schema = z
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
function parseCoordinates(raw: string): [number, number] | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const LISTING_LABELS = {
  title: "title", listingType: "type", price: "price", rentalPeriod: "rental period", propertyType: "property type",
  address: "address", village: "village", district: "district", city: "city", province: "province",
  postalCode: "postal code", landArea: "land area", buildingArea: "building area", bedrooms: "bedrooms",
  bathrooms: "bathrooms", electricityWatts: "electricity", latitude: "coordinates", longitude: "coordinates",
  salesCode: "sales code", status: "status", notes: "notes", facilities: "facilities",
} as const;

export async function saveListing(
  _prev: ListingFormState,
  fd: FormData,
): Promise<ListingFormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const listingType = str(fd, "listingType");

  const coords = parseCoordinates(str(fd, "coordinates"));
  const parsed = schema.safeParse({
    title: str(fd, "title"),
    listingType,
    price: money(fd, "price") ?? undefined,
    rentalPeriod: listingType === "rent" ? optStr(fd, "rentalPeriod") : null,
    propertyType: str(fd, "propertyType"),
    address: str(fd, "address"),
    village: str(fd, "village"),
    district: str(fd, "district"),
    city: str(fd, "city"),
    province: str(fd, "province"),
    postalCode: optStr(fd, "postalCode"),
    landArea: decimal(fd, "landArea"),
    buildingArea: decimal(fd, "buildingArea"),
    bedrooms: integer(fd, "bedrooms") ?? 0,
    bathrooms: integer(fd, "bathrooms") ?? 0,
    electricityWatts: integer(fd, "electricityWatts"),
    latitude: coords?.[0] ?? null,
    longitude: coords?.[1] ?? null,
    salesCode: str(fd, "salesCode"),
    status: str(fd, "status") || "available",
    notes: optStr(fd, "notes"),
    facilities: fd.getAll("facilities").map(String).filter(Boolean),
  });
  if (!parsed.success) return { errors: zodErrors(parsed.error.issues), message: "Please fix the highlighted fields." };
  const v = parsed.data;

  // Inactive agents can't be assigned to *new* listings (keeping an existing assignment is fine).
  const [agent] = await db.select().from(salesCodes).where(eq(salesCodes.code, v.salesCode));
  if (!agent) return { errors: { salesCode: "Sales code not found" } };
  if (!agent.isActive) {
    const [current] = id ? await db.select({ c: listings.salesCode }).from(listings).where(eq(listings.id, id)) : [];
    if (current?.c !== v.salesCode) return { errors: { salesCode: "This sales code is inactive" } };
  }

  const values = { ...v, facilities: [...new Set(v.facilities)] };
  let listingId = id;
  if (id) {
    const [before] = await db.select().from(listings).where(eq(listings.id, id));
    await db.update(listings).set(values).where(eq(listings.id, id));
    const changed = before ? [...new Set(changedKeys(before, values, LISTING_LABELS))] : [];
    await logActivity({
      actor: user.email, action: "updated", entity: "listing", entityId: id,
      summary: `${v.title}${changed.length ? ` · changed ${changed.join(", ")}` : ""}`,
    });
  } else {
    // A draft can become exactly one listing: claim it first (atomic), so a double-click or two staff at once
    // can't create two listings or attach its photos twice.
    const draftId = str(fd, "draftId");
    if (draftId && !isUuid(draftId)) return { message: "That draft link is invalid. Open it again from the Drafts page." };
    let draftPhotos: string[] = [];
    if (draftId) {
      const [claimed] = await db
        .update(listingDrafts)
        .set({ status: "approved" })
        .where(and(eq(listingDrafts.id, draftId), eq(listingDrafts.status, "pending")))
        .returning({ photos: listingDrafts.photos });
      if (!claimed) return { message: "This draft was already saved as a listing, or discarded. Open the Drafts page." };
      draftPhotos = claimed.photos;
    }
    let row: { id: string };
    try {
      row = await db.transaction(async (tx) => {
        const [created] = await tx.insert(listings).values({ ...values, status: "available" }).returning({ id: listings.id });
        if (draftId) {
          await tx.update(listingDrafts).set({ listingId: created.id }).where(eq(listingDrafts.id, draftId));
          if (draftPhotos.length) {
            await tx.insert(listingPhotos).values(
              draftPhotos.map((path, position) => ({ listingId: created.id, path, position, isCover: position === 0 })),
            );
          }
        }
        return created;
      });
    } catch (e) {
      // Let the reviewer try again instead of losing the draft.
      if (draftId) await db.update(listingDrafts).set({ status: "pending", listingId: null }).where(eq(listingDrafts.id, draftId));
      throw e;
    }
    listingId = row.id;
    if (draftId) {
      await moveDraftPhotos(listingId, draftPhotos);
      revalidatePath("/drafts");
    }
    await logActivity({ actor: user.email, action: "created", entity: "listing", entityId: listingId, summary: `${v.title} · ${v.city}${draftId ? " · from Telegram draft" : ""}` });
  }
  revalidatePath("/listings");
  revalidatePath("/listings-public");
  revalidatePath("/");
  invalidateDashboard();
  redirect(id ? `/listings/${listingId}` : `/listings/${listingId}/edit?created=1`);
}

/**
 * Telegram photos arrive under drafts/<draft-id>/. Once the listing exists, file them under <listing-id>/ like
 * every other photo. A photo that fails to move simply keeps working from its draft path.
 */
async function moveDraftPhotos(listingId: string, paths: string[]) {
  if (!paths.length) return;
  const storage = (await createClient()).storage.from(PHOTO_BUCKET);
  await Promise.all(
    paths.map(async (from) => {
      const to = `${listingId}/${from.split("/").pop()}`;
      const { error } = await storage.move(from, to);
      if (error) return console.error(`moving ${from} failed`, error.message);
      try {
        await db.update(listingPhotos).set({ path: to }).where(and(eq(listingPhotos.listingId, listingId), eq(listingPhotos.path, from)));
      } catch (e) {
        console.error(`re-pointing ${from} failed, moving it back`, e);
        await storage.move(to, from);
      }
    }),
  );
}

export async function deleteListing(id: string): Promise<{ error?: string }> {
  const user = await requireUser();
  const [gone] = await db.select({ title: listings.title }).from(listings).where(eq(listings.id, id));
  const photos = await db.select({ path: listingPhotos.path }).from(listingPhotos).where(eq(listingPhotos.listingId, id));
  if (photos.length) {
    const supabase = await createClient();
    await supabase.storage.from(PHOTO_BUCKET).remove(photos.map((p) => p.path));
  }
  // Deals keep their copied property details; their listing link is nulled by the FK.
  await db.delete(listings).where(eq(listings.id, id));
  await logActivity({ actor: user.email, action: "deleted", entity: "listing", entityId: id, summary: gone?.title ?? id });
  revalidatePath("/listings");
  revalidatePath("/listings-public");
  revalidatePath("/");
  invalidateDashboard();
  return {};
}

export async function addFacility(name: string): Promise<{ facilities: string[]; error?: string }> {
  await requireUser();
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 40) {
    return { facilities: await listFacilities(), error: "Facility name must be 2–40 characters" };
  }
  await db.insert(facilities).values({ name: clean }).onConflictDoNothing();
  return { facilities: await listFacilities() };
}

async function listFacilities() {
  const rows = await db.select({ name: facilities.name }).from(facilities).orderBy(asc(facilities.name));
  return rows.map((r) => r.name);
}

/* ------------------------------ photos ------------------------------ */

export async function registerPhotos(listingId: string, paths: string[]) {
  await requireUser();
  const valid = paths.filter((p) => p.startsWith(`${listingId}/`));
  if (!valid.length) return;
  const [{ max, hasCover }] = await db
    .select({
      max: sql<number>`coalesce(max(${listingPhotos.position}), -1)::int`,
      hasCover: sql<boolean>`coalesce(bool_or(${listingPhotos.isCover}), false)`,
    })
    .from(listingPhotos)
    .where(eq(listingPhotos.listingId, listingId));
  await db.insert(listingPhotos).values(
    valid.map((path, i) => ({
      listingId,
      path,
      position: max + 1 + i,
      isCover: !hasCover && i === 0,
    })),
  );
  revalidateListing(listingId);
}

export async function reorderPhotos(listingId: string, orderedIds: string[]) {
  await requireUser();
  await db.transaction(async (tx) => {
    for (const [i, photoId] of orderedIds.entries()) {
      await tx
        .update(listingPhotos)
        .set({ position: i })
        .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
    }
  });
  revalidateListing(listingId);
}

export async function setCoverPhoto(listingId: string, photoId: string) {
  await requireUser();
  await db.transaction(async (tx) => {
    await tx.update(listingPhotos).set({ isCover: false }).where(eq(listingPhotos.listingId, listingId));
    await tx
      .update(listingPhotos)
      .set({ isCover: true })
      .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)));
  });
  revalidateListing(listingId);
}

export async function deletePhoto(listingId: string, photoId: string) {
  await requireUser();
  const [photo] = await db
    .delete(listingPhotos)
    .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, listingId)))
    .returning();
  if (!photo) return;
  const supabase = await createClient();
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
  if (photo.isCover) {
    const [next] = await db
      .select({ id: listingPhotos.id })
      .from(listingPhotos)
      .where(and(eq(listingPhotos.listingId, listingId), ne(listingPhotos.id, photoId)))
      .orderBy(asc(listingPhotos.position))
      .limit(1);
    if (next) await db.update(listingPhotos).set({ isCover: true }).where(eq(listingPhotos.id, next.id));
  }
  revalidateListing(listingId);
}

function revalidateListing(id: string) {
  invalidateDashboard();
  revalidatePath(`/listings/${id}`);
  revalidatePath(`/listings/${id}/edit`);
  revalidatePath("/listings");
  revalidatePath("/listings-public");
  revalidatePath(`/listings-public/${id}`);
}
