import { Suspense } from "react";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from "drizzle-orm";
import { Building2, CalendarCheck, ChartPie, Handshake, MapPin, Trophy } from "lucide-react";
import { db } from "@/db";
import { deals, listings, salesCodes } from "@/db/schema";
import { PageHeader } from "@/components/common/page-header";
import { DealsTrendChart } from "@/components/dashboard/deals-trend-chart";
import { dashCache } from "@/lib/dashboard-cache";
import { getDealMix } from "@/lib/deal-mix";
import { getDealTrend, type TrendBy } from "@/lib/deal-trend";
import { seriesColor } from "@/lib/trend-helpers";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { dealYears, parsePeriod, type Period } from "@/lib/period";
import { ListingMap } from "@/components/listings/listing-map-loader";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionError } from "@/components/common/section-error";
import { LazyMount } from "@/components/common/lazy-mount";
import { getMapCounts, getMapPoints, parseListingFilters } from "@/lib/listing-queries";
import { compactIDR, formatIDR } from "@/lib/format";
import { today } from "@/lib/tz";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** The overview map opens on this province; picking "Indonesia" in the map overrides it (`province=` in the URL). */
const DEFAULT_PROVINCE = "Sulawesi Selatan";

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="rounded-lg bg-brand-light/60 p-1.5 text-brand-ink"><Icon className="size-4" /></span>
        {label}
      </div>
      <div className="whitespace-nowrap text-2xl font-bold tracking-tight xl:text-3xl">{value}</div>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const cachedMapCounts = dashCache(getMapCounts, "map-counts");
const cachedMapPoints = dashCache(getMapPoints, "map-points");
const cachedTrend = dashCache(getDealTrend, "trend");
const cachedYears = dashCache(dealYears, "years");
const cachedMix = dashCache(getDealMix, "mix");

const getStats = dashCache(async (monthStart: string, monthEnd: string) => {
  const [byType, [month]] = await Promise.all([
    db
      .select({ type: listings.listingType, n: count() })
      .from(listings)
      .where(inArray(listings.status, ["available", "reserved"]))
      .groupBy(listings.listingType),
    db
      .select({ n: count(), value: sql<number>`coalesce(${sum(deals.finalPrice)}, 0)::float8` })
      .from(deals)
      .where(and(gte(deals.dealDate, monthStart), lt(deals.dealDate, monthEnd))),
  ]);
  return { byType, month };
}, "stats");

const getTopSales = dashCache(async (gteDate?: string, ltDate?: string) => {
  return db
    .select({
      code: deals.salesCode,
      name: salesCodes.fullName,
      n: count(),
      value: sql<number>`coalesce(sum(${deals.finalPrice}), 0)::float8`,
    })
    .from(deals)
    .innerJoin(salesCodes, eq(salesCodes.code, deals.salesCode))
    .where(and(gteDate ? gte(deals.dealDate, gteDate) : undefined, ltDate ? lt(deals.dealDate, ltDate) : undefined))
    .groupBy(deals.salesCode, salesCodes.fullName)
    .orderBy(desc(count()), desc(sql`sum(${deals.finalPrice})`))
    .limit(5);
}, "top-sales");

// The page shell renders straight away; each section below streams in as its own queries finish.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // The staff overview map covers every active listing (available + reserved) unless a status is chosen.
  const mapFilters = parseListingFilters({ ...sp, status: sp.status ?? "active", province: sp.province ?? DEFAULT_PROVINCE });
  const { period, year: pYear, month: pMonth, range, label: periodLabel } = parsePeriod(sp);
  const by = (["total", "payment", "sales"].includes(one(sp.by)) ? one(sp.by) : "total") as TrendBy;

  const where = mapFilters.village || mapFilters.district || mapFilters.city || mapFilters.province;
  const listingsQs = new URLSearchParams({ status: "all" });
  for (const k of ["province", "city", "district", "village"] as const) if (mapFilters[k]) listingsQs.set(k, mapFilters[k]);

  const now = today();
  const monthName = new Date(now.year, now.month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Dashboard" description={`Overview for ${monthName}`} />
      <SectionError title="Overview">
        <Suspense fallback={<StatsSkeleton />}>
          <Stats monthName={monthName} />
        </Suspense>
      </SectionError>

      <div className="mt-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-brand-ink" /> Listings map</h2>
          <span className="text-xs text-muted-foreground">Active listings (available + reserved)</span>
        </div>
        <div className="lg:h-[560px]">
          <LazyMount fallback={<Skeleton className="h-[380px] sm:h-[480px] lg:h-full" />}>
            <SectionError title="Listings map">
              <Suspense fallback={<Skeleton className="h-[380px] sm:h-[480px] lg:h-full" />}>
                <MapSection filters={mapFilters} />
              </Suspense>
            </SectionError>
          </LazyMount>
        </div>
        {where && (
          <p className="mt-3 text-sm">
            <Link href={`/listings?${listingsQs}`} className="font-medium text-brand-ink hover:underline">
              Open listings in {where} →
            </Link>
          </p>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Deals</h2>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <SectionError title="Period picker">
          <Suspense fallback={<Skeleton className="h-10 w-72" />}>
            <PeriodPicker period={period} month={pMonth} year={pYear} label={periodLabel} />
          </Suspense>
        </SectionError>
      </div>

      <div className="mt-4">
        <SectionError title="Deal trend">
          <Suspense fallback={<Skeleton className="h-[480px] rounded-xl" />}>
            <TrendSection period={period} year={pYear} month={pMonth} by={by} periodLabel={periodLabel} />
          </Suspense>
        </SectionError>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <SectionError title="Deal distribution">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <DealMixCard range={range} periodLabel={periodLabel} />
          </Suspense>
        </SectionError>
        <SectionError title="Top sales codes">
          <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
            <TopSales range={range} periodLabel={periodLabel} />
          </Suspense>
        </SectionError>
      </div>
    </>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[134px] rounded-xl" />
      ))}
    </div>
  );
}

async function Stats({ monthName }: { monthName: string }) {
  const { year, month: m } = today();
  const iso = (y: number, mo: number) => `${mo > 12 ? y + 1 : y}-${String(mo > 12 ? 1 : mo).padStart(2, "0")}-01`;

  const { byType, month } = await getStats(iso(year, m), iso(year, m + 1));
  const sell = byType.find((r) => r.type === "sell")?.n ?? 0;
  const rent = byType.find((r) => r.type === "rent")?.n ?? 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Stat icon={Building2} label="Active listings" value={String(sell + rent)} hint={`${sell} for sale · ${rent} for rent (available + reserved)`} />
      <Stat icon={Handshake} label="Deals this month" value={String(month.n)} hint={monthName} />
      <Stat icon={CalendarCheck} label="Deal value this month" value={formatIDR(month.value)} hint="Sum of final agreed prices" />
    </div>
  );
}

async function MapSection({ filters }: { filters: Parameters<typeof getMapCounts>[0] }) {
  const [counts, points] = await Promise.all([cachedMapCounts(filters), cachedMapPoints(filters)]);
  return <ListingMap counts={counts} points={points} listingBase="/listings" defaultProvince={DEFAULT_PROVINCE} />;
}

async function PeriodPicker({ period, month, year, label }: { period: Period; month: number; year: number; label: string }) {
  const years = await cachedYears(year);
  return <PeriodFilter period={period} month={month} year={year} years={years} label={label} />;
}

async function TrendSection({
  period,
  year,
  month,
  by,
  periodLabel,
}: {
  period: Period;
  year: number;
  month: number;
  by: TrendBy;
  periodLabel: string;
}) {
  // All three splits are fetched together (each is cached for a minute) so the chart's switch is instant.
  const [total, payment, sales] = await Promise.all(
    (["total", "payment", "sales"] as const).map((b) => cachedTrend({ period, year, month, by: b })),
  );
  return <DealsTrendChart trends={{ total, payment, sales }} initialBy={by} periodLabel={periodLabel} />;
}

async function TopSales({ range, periodLabel }: { range: { gte?: string; lt?: string }; periodLabel: string }) {
  const top = await getTopSales(range.gte, range.lt);
  const maxN = Math.max(1, ...top.map((t) => t.n));

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Trophy className="size-4 text-brand-ink" /> Top sales codes</h2>
          <p className="mt-1 text-xs text-muted-foreground">By number of deals · {periodLabel}</p>
        </div>
      </div>
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No deals in this period. <Link href="/deals/new" className="text-brand-ink hover:underline">Record a deal</Link>.
        </p>
      ) : (
        <ol className="space-y-3">
          {top.map((t, i) => (
            <li key={t.code}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{i + 1}. {t.code} <span className="font-normal text-muted-foreground">· {t.name}</span></span>
                <span className="tabular-nums">{t.n} deal{t.n > 1 ? "s" : ""} · {formatIDR(t.value)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-brand-light/50" role="presentation">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(t.n / maxN) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

async function DealMixCard({ range, periodLabel }: { range: { gte?: string; lt?: string }; periodLabel: string }) {
  const mix = await cachedMix(range.gte, range.lt);
  const { sale, rent } = mix.types;
  const payments = mix.payments;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 font-semibold"><ChartPie className="size-4 text-brand-ink" /> Deal distribution</h2>
        <p className="mt-1 text-xs text-muted-foreground">By deal value · {periodLabel}</p>
      </div>
      {mix.total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No deals in this period.</p>
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-medium">Sale vs rent</h3>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="presentation">
              <div className="bg-yellow-400" style={{ width: `${(sale.value / mix.total) * 100}%` }} />
              <div className="bg-sky-400" style={{ width: `${(rent.value / mix.total) * 100}%` }} />
            </div>
            <div className="mt-2 space-y-1 text-sm">
              {[
                { row: sale, dot: "bg-yellow-400" },
                { row: rent, dot: "bg-sky-400" },
              ].map(({ row, dot }) => (
                <div key={row.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${dot}`} aria-hidden />{row.name} · {pct(row.value, mix.total)}%</span>
                  <span className="tabular-nums text-muted-foreground">{row.n} deal{row.n === 1 ? "" : "s"} · {compactIDR(row.value)}</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-medium">Payment type</h3>
            <ul className="space-y-2.5">
              {payments.map((p) => (
                <li key={p.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: seriesColor(p.name) }} aria-hidden />
                      {p.name} · {pct(p.value, mix.total)}%
                    </span>
                    <span className="tabular-nums text-muted-foreground">{p.n} deal{p.n === 1 ? "" : "s"} · {compactIDR(p.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                    <div className="h-full rounded-full" style={{ width: `${(p.value / mix.total) * 100}%`, background: seriesColor(p.name) }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
