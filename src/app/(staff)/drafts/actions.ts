"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listingDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/form-utils";
import { PHOTO_BUCKET } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

export async function discardDraft(id: string) {
  await requireUser();
  if (!isUuid(id)) return;
  const [gone] = await db
    .update(listingDrafts)
    .set({ status: "discarded" })
    .where(and(eq(listingDrafts.id, id), eq(listingDrafts.status, "pending")))
    .returning({ photos: listingDrafts.photos });
  if (gone?.photos.length) {
    const supabase = await createClient();
    await supabase.storage.from(PHOTO_BUCKET).remove(gone.photos);
  }
  revalidatePath("/drafts");
  revalidatePath("/", "layout"); // the sidebar count
}
