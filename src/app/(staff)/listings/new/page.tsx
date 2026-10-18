import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { facilities, listingDrafts, salesCodes } from "@/db/schema";
import { DEFAULT_FACILITIES } from "@/lib/constants";
import { PageHeader } from "@/components/common/page-header";
import { ListingForm, type ListingFormValues } from "@/components/listings/listing-form";
import { photoUrl } from "@/lib/constants";
import { isUuid } from "@/lib/form-utils";
import type { DraftFields } from "@/lib/draft-extract";

export const metadata = { title: "New listing" };

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

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft: draftId } = await searchParams;
  let draft: typeof listingDrafts.$inferSelect | undefined;
  if (draftId) {
    if (!isUuid(draftId)) notFound();
    [draft] = await db.select().from(listingDrafts).where(eq(listingDrafts.id, draftId));
    if (!draft || draft.status !== "pending") notFound();
  }
  const [agents, facs] = await Promise.all([
    db.select().from(salesCodes).where(eq(salesCodes.isActive, true)).orderBy(asc(salesCodes.code)),
    db.select({ name: facilities.name }).from(facilities).orderBy(asc(facilities.name)),
  ]);
  const options = [...new Set([...DEFAULT_FACILITIES, ...facs.map((f) => f.name)])];
  return (
    <>
      <PageHeader title="New listing" description={draft ? "Pre-filled from a Telegram draft. Check every field before saving." : undefined} />
      {draft && (
        <details className="mb-4 rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Original message</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{draft.rawText}</pre>
        </details>
      )}
      {draft && draft.photos.length > 0 && (
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
        draftId={draft?.id}
        prefill={draft ? prefillFrom(draft.parsed as Partial<DraftFields>) : undefined}
        agents={agents} facilityOptions={options} />
    </>
  );
}
