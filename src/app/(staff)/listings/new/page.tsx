import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { facilities, salesCodes } from "@/db/schema";
import { DEFAULT_FACILITIES } from "@/lib/constants";
import { isUuid } from "@/lib/form-utils";
import { PageHeader } from "@/components/common/page-header";
import { ListingForm } from "@/components/listings/listing-form";

export const metadata = { title: "New listing" };

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  // Reviewing a Telegram draft happens inside the Drafts section; keep old links working.
  const { draft } = await searchParams;
  if (draft && isUuid(draft)) redirect(`/drafts/${draft}`);

  const [agents, facs] = await Promise.all([
    db.select().from(salesCodes).where(eq(salesCodes.isActive, true)).orderBy(asc(salesCodes.code)),
    db.select({ name: facilities.name }).from(facilities).orderBy(asc(facilities.name)),
  ]);
  const options = [...new Set([...DEFAULT_FACILITIES, ...facs.map((f) => f.name)])];
  return (
    <>
      <PageHeader title="New listing" />
      <ListingForm agents={agents} facilityOptions={options} />
    </>
  );
}
