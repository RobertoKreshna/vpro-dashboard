import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { facilities, listingDrafts, salesCodes } from "@/db/schema";
import { PageHeader } from "@/components/common/page-header";
import { ListingForm, type ListingFormValues } from "@/components/listings/listing-form";
import { DEFAULT_FACILITIES, photoUrl } from "@/lib/constants";
import type { DraftFields } from "@/lib/draft-extract";
import { formatIDR } from "@/lib/format";
import { isUuid } from "@/lib/form-utils";

export const metadata = { title: "Review draft" };
export const dynamic = "force-dynamic";

/** Parsed draft -> form defaults. Nulls are dropped so the form's own defaults apply. */
function prefillFrom(f: Partial<DraftFields>): Partial<Omit<ListingFormValues, "id">> {
  const contact = [f.contactName, f.contactPhone].filter(Boolean).join(" ");
  const notes = [f.notes, contact ? `Contact: ${contact}` : null].filter(Boolean).join("\n");
  const out = {
    title: f.title, listingType: f.listingType, price: f.price, rentalPeriod: f.rentalPeriod,
    propertyType: f.propertyType, address: f.address, village: f.village, district: f.district, city: f.city,
    province: f.province, postalCode: f.postalCode, landArea: f.landArea, buildingArea: f.buildingArea,
    bedrooms: f.bedrooms, bathrooms: f.bathrooms, electricityWatts: f.electricityWatts,
    facilities: f.facilities, latitude: f.latitude, longitude: f.longitude, notes: notes || null,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null)) as Partial<Omit<ListingFormValues, "id">>;
}

/** Reviews one Telegram draft inside the Drafts section: the listing form, pre-filled, next to what was originally sent. */
export default async function ReviewDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [draft] = await db.select().from(listingDrafts).where(eq(listingDrafts.id, id));
  if (!draft || draft.status !== "pending") notFound();

  const [agents, facs] = await Promise.all([
    db.select().from(salesCodes).where(eq(salesCodes.isActive, true)).orderBy(asc(salesCodes.code)),
    db.select({ name: facilities.name }).from(facilities).orderBy(asc(facilities.name)),
  ]);
  const options = [...new Set([...DEFAULT_FACILITIES, ...facs.map((f) => f.name)])];
  const f = draft.parsed as Partial<DraftFields>;

  return (
    <>
      <Link href="/drafts" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to drafts
      </Link>
      <PageHeader
        title="Review draft"
        description={`Sent by ${draft.submittedBy ?? "unknown"}${f.price ? ` · ${formatIDR(f.price)}` : ""}. Check every field, then save it as a listing.`}
      />
      {!!f.uncertain?.length && (
        <p className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <span className="font-semibold">Check:</span> {f.uncertain.join(", ")}
        </p>
      )}
      <details className="mb-4 rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Original message</summary>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{draft.rawText || "(no text)"}</pre>
      </details>
      {draft.photos.length > 0 && (
        <div className="mb-4 rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">{draft.photos.length} photo(s) from Telegram, attached when you save (first = cover)</p>
          <div className="flex gap-2 overflow-x-auto">
            {draft.photos.map((path) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={path} src={photoUrl(path) ?? ""} alt="" className="size-24 shrink-0 rounded-lg bg-muted object-cover" />
            ))}
          </div>
        </div>
      )}
      <ListingForm
        draftId={draft.id}
        prefill={prefillFrom(f)}
        agents={agents}
        facilityOptions={options}
        cancelHref="/drafts"
        submitLabel="Save listing"
        hidePhotoNote
      />
    </>
  );
}
