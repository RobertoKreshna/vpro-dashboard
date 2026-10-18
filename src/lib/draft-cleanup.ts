import { and, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { listingDrafts } from "@/db/schema";

/** Pending drafts nobody reviewed are removed (with their photos, which are publicly readable) after this long. */
export const DRAFT_TTL_DAYS = 30;

/**
 * Deletes pending drafts older than the TTL (and their stored photos) plus discarded rows older than the TTL.
 * Approved drafts are kept: their photos now belong to a listing. Runs when staff open the Drafts page, so no cron needed.
 * `removePhotos` is passed in so the caller's own (staff) session performs the storage deletes.
 */
export async function pruneStaleDrafts(removePhotos: (paths: string[]) => Promise<unknown>): Promise<number> {
  const cutoff = new Date(Date.now() - DRAFT_TTL_DAYS * 86_400_000);
  const stale = await db
    .select({ id: listingDrafts.id, photos: listingDrafts.photos })
    .from(listingDrafts)
    .where(and(inArray(listingDrafts.status, ["pending", "discarded"]), lt(listingDrafts.createdAt, cutoff)))
    .limit(200);
  if (!stale.length) return 0;
  const paths = stale.flatMap((d) => d.photos);
  if (paths.length) await removePhotos(paths);
  await db.delete(listingDrafts).where(inArray(listingDrafts.id, stale.map((d) => d.id)));
  return stale.length;
}
