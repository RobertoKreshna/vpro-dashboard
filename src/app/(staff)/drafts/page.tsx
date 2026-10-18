import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db } from "@/db";
import { listingDrafts } from "@/db/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import type { DraftFields } from "@/lib/draft-extract";
import { PHOTO_BUCKET, photoUrl } from "@/lib/constants";
import { DRAFT_TTL_DAYS, pruneStaleDrafts } from "@/lib/draft-cleanup";
import { createClient } from "@/lib/supabase/server";
import { formatIDR } from "@/lib/format";
import { discardDraft } from "./actions";

export const metadata = { title: "Listing drafts" };
export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });

export default async function DraftsPage() {
  // Housekeeping must never break the page.
  try {
    const storage = (await createClient()).storage.from(PHOTO_BUCKET);
    await pruneStaleDrafts((paths) => storage.remove(paths));
  } catch (e) {
    console.error("draft cleanup failed", e);
  }
  const rows = await db
    .select()
    .from(listingDrafts)
    .where(eq(listingDrafts.status, "pending"))
    .orderBy(desc(listingDrafts.createdAt))
    .limit(100);

  return (
    <>
      <PageHeader
        title="Listing drafts"
        description={`Messages submitted through the Telegram bot. Review, fix anything wrong, then save as a listing. Unreviewed drafts are deleted after ${DRAFT_TTL_DAYS} days.`}
      />
      {rows.length === 0 && (
        <p className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
          No drafts waiting. Paste a WhatsApp listing into the Telegram bot to create one.
        </p>
      )}
      <div className="space-y-3">
        {rows.map((r) => {
          const f = r.parsed as Partial<DraftFields>;
          return (
            <article key={r.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">{f.title ?? (r.rawText ? "Untitled" : "Photos only, no text yet")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {[f.listingType, f.propertyType, f.price ? formatIDR(f.price) : null, [f.district, f.city].filter(Boolean).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.submittedBy ?? "unknown"} · {when.format(r.createdAt)}
                    {f.contactPhone ? ` · ${f.contactPhone}` : ""}
                  </p>
                  {!!f.uncertain?.length && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">Check: {f.uncertain.join(", ")}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <form action={discardDraft.bind(null, r.id)}>
                    <Button type="submit" variant="outline"><Trash2 /> Discard</Button>
                  </form>
                  <Link href={`/listings/new?draft=${r.id}`} className={buttonVariants()}>Review</Link>
                </div>
              </div>
              {r.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {r.photos.map((path) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={path} src={photoUrl(path) ?? ""} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg bg-muted object-cover" />
                  ))}
                </div>
              )}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Original message</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-xs">{r.rawText || "(no text)"}</pre>
              </details>
            </article>
          );
        })}
      </div>
    </>
  );
}
