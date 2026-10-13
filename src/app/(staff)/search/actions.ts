"use server";

import { ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { deals, listings, salesCodes } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export type SearchResults = {
  listings: { id: string; title: string; city: string }[];
  deals: { id: string; buyerName: string; city: string }[];
  salesCodes: { code: string; fullName: string }[];
};

const EMPTY: SearchResults = { listings: [], deals: [], salesCodes: [] };

/** Quick search behind the Ctrl/Cmd+K palette: a few matches each from listings, deals and sales codes. */
export async function globalSearch(q: string): Promise<SearchResults> {
  await requireUser();
  const term = q.trim().slice(0, 100);
  if (term.length < 2) return EMPTY;
  const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
  const [l, d, s] = await Promise.all([
    db
      .select({ id: listings.id, title: listings.title, city: listings.city })
      .from(listings)
      .where(or(ilike(listings.id, like), ilike(listings.title, like), ilike(listings.address, like)))
      .orderBy(listings.id)
      .limit(6),
    db
      .select({ id: deals.id, buyerName: deals.buyerName, city: deals.city })
      .from(deals)
      .where(or(ilike(deals.id, like), ilike(deals.buyerName, like), ilike(deals.listingId, like)))
      .orderBy(deals.id)
      .limit(6),
    db
      .select({ code: salesCodes.code, fullName: salesCodes.fullName })
      .from(salesCodes)
      .where(or(ilike(salesCodes.code, like), ilike(salesCodes.fullName, like)))
      .orderBy(salesCodes.code)
      .limit(4),
  ]);
  return { listings: l, deals: d, salesCodes: s };
}
