"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { facilities, listings } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { invalidateDashboard } from "@/lib/dashboard-cache";
import { rateLimit } from "@/lib/rate-limit";
import { prepareImport, type ImportPlan, type ImportSource } from "@/lib/sheet-import";

export type ImportResult = { error?: string; plan?: ImportPlan; done?: { created: number; skipped: number } };

async function guard() {
  const user = await requireUser();
  const limit = rateLimit(`sheet-import:${user.id}`, 20, 60_000);
  return limit.ok ? { user } : { error: `Too many requests. Try again in ${limit.retryAfter}s.` };
}

/** The form carries either a Google Sheets `link` or an uploaded `file`. */
function sourceOf(fd: FormData): ImportSource | null {
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) return { file };
  const link = String(fd.get("link") ?? "").trim();
  return link ? { link } : null;
}
const NO_SOURCE = { error: "Paste a Google Sheets link or choose a file." };

/** Reads the source and reports what an import would do. Changes nothing. */
export async function previewImport(fd: FormData): Promise<ImportResult> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const source = sourceOf(fd);
  if (!source) return NO_SOURCE;
  const prepared = await prepareImport(source);
  return "error" in prepared ? { error: prepared.error } : { plan: prepared.plan };
}

/**
 * Re-reads the source (the preview may be minutes old, and the browser's copy of it is never trusted) and applies
 * every valid row as a new listing in one transaction. Rows with errors are skipped, not imported halfway.
 */
export async function applyImport(fd: FormData): Promise<ImportResult> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const source = sourceOf(fd);
  if (!source) return NO_SOURCE;
  const prepared = await prepareImport(source);
  if ("error" in prepared) return { error: prepared.error };
  const { plan, creates, facilityNames } = prepared;

  try {
    await db.transaction(async (tx) => {
      if (facilityNames.length) await tx.insert(facilities).values(facilityNames.map((name) => ({ name }))).onConflictDoNothing();
      if (creates.length) await tx.insert(listings).values(creates);
    });
  } catch (e) {
    console.error("sheet import failed", e);
    return { error: "The import failed and nothing was saved. If it keeps happening, try again." };
  }

  const done = { created: creates.length, skipped: plan.counts.error };
  if (done.created) {
    await logActivity({
      actor: g.user.email, action: "imported", entity: "listing", entityId: "sheet",
      summary: `Google Sheets import · ${done.created} created${done.skipped ? `, ${done.skipped} skipped` : ""}`,
    });
    revalidatePath("/listings");
    revalidatePath("/listings-public");
    revalidatePath("/");
    invalidateDashboard();
  }
  return { plan, done };
}
