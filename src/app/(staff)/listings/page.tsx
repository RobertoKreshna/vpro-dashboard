import Link from "next/link";
import { FileSpreadsheet, Pencil, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { StatusBadge, TypeBadge } from "@/components/common/badges";
import { ListingThumb } from "@/components/common/listing-thumb";
import { ListingFilterBar } from "@/components/listings/listing-filter-bar";
import { PriceText } from "@/components/listings/listing-info";
import {
  getLocationOptions,
  getPriceBounds,
  getSalesCodeOptions,
  parseListingFilters,
  queryListings,
} from "@/lib/listing-queries";

export const metadata = { title: "Listings" };

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseListingFilters(sp);
  const [{ rows, total, pages }, locations, codes, priceBounds] = await Promise.all([
    queryListings("staff", filters),
    getLocationOptions("staff"),
    getSalesCodeOptions("staff"),
    getPriceBounds(),
  ]);

  return (
    <>
      <PageHeader
        title="Listings"
        description="Sold and rented listings are hidden by default — use the status filter to see them."
        actions={
          <>
            <Link href="/listings/import" className={buttonVariants({ size: "lg", variant: "outline" })}>
              <FileSpreadsheet /> Import
            </Link>
            <Link href="/listings/new" className={buttonVariants({ size: "lg" })}>
              <Plus /> New listing
            </Link>
          </>
        }
      />
      <div className="space-y-4">
        <ListingFilterBar compact priceBounds={priceBounds} locations={locations} salesCodes={codes} />
        {/* Phones and tablets: cards. Wide screens: the full table. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
          {rows.length === 0 && (
            <p className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground sm:col-span-2">No listings match these filters.</p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-xl border bg-card p-3 shadow-sm">
              <ListingThumb path={r.coverPath} alt={r.title} className="size-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={r.listingType} />
                  <StatusBadge status={r.status} />
                </div>
                <Link href={`/listings/${r.id}`} className="block font-medium leading-snug hover:underline">{r.title}</Link>
                <div className="font-semibold tabular-nums text-brand-ink">
                  <PriceText price={r.price} listingType={r.listingType} rentalPeriod={r.rentalPeriod} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {r.id} · {[r.district, r.city].filter(Boolean).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.bedrooms} bed · {r.bathrooms} bath · {r.salesCode}
                </p>
              </div>
              <Link
                href={`/listings/${r.id}/edit`}
                aria-label={`Edit ${r.id}`}
                className={buttonVariants({ variant: "ghost", size: "icon" }) + " shrink-0 self-start"}
              >
                <Pencil />
              </Link>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border bg-card shadow-sm lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Photo</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>District</TableHead>
                <TableHead>City / regency</TableHead>
                <TableHead className="text-center">Bed</TableHead>
                <TableHead className="text-center">Bath</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center text-muted-foreground">
                    No listings match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id} className="hover:bg-brand-light/30">
                  <TableCell>
                    <ListingThumb path={r.coverPath} alt={r.title} className="size-14 rounded-lg" />
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    <Link href={`/listings/${r.id}`} className="text-brand-ink hover:underline">{r.id}</Link>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal font-medium">
                    <Link href={`/listings/${r.id}`} className="hover:underline">{r.title}</Link>
                  </TableCell>
                  <TableCell><TypeBadge type={r.listingType} /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    <PriceText price={r.price} listingType={r.listingType} rentalPeriod={r.rentalPeriod} />
                  </TableCell>
                  <TableCell>{r.district}</TableCell>
                  <TableCell>{r.city}</TableCell>
                  <TableCell className="text-center tabular-nums">{r.bedrooms}</TableCell>
                  <TableCell className="text-center tabular-nums">{r.bathrooms}</TableCell>
                  <TableCell>{r.salesCode}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <Link
                      href={`/listings/${r.id}/edit`}
                      aria-label={`Edit ${r.id}`}
                      className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                    >
                      <Pencil />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination basePath="/listings" searchParams={sp} page={filters.page} pages={pages} total={total} />
      </div>
    </>
  );
}
