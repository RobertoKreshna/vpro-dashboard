import "server-only";
import { and, count, gte, lt, lte, max, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { deals, salesCodes } from "@/db/schema";
import { shiftMonthBack } from "@/lib/trend-helpers";
import { today } from "@/lib/tz";

export type TrendBy = "total" | "payment" | "sales";
export type Granularity = "day" | "month";

export type DealTrend = {
  granularity: Granularity;
  /** One entry per day / month in the period, in order ("2026-10-03" or "2026-10"), including empty ones. */
  buckets: string[];
  series: { name: string; values: number[]; counts: number[]; total: number }[];
  /** Same days one month earlier (month + total) or same months one year earlier (year + total), aligned by index; null where last month is shorter. */
  prev?: { buckets: (string | null)[]; values: number[]; counts: number[]; total: number; totalCount: number };
  /** What `prev` is a year / month earlier than. */
  prevKind?: "month" | "year";
  /** Days (month view) or months (year view) that have happened; later buckets are not drawn. */
  elapsed?: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Deal value (sum of final price) over time for the chosen period, split by total / payment type (per bank) / sales code. */
export async function getDealTrend(opts: {
  period: "month" | "year" | "all";
  year: number;
  month: number; // 1-12
  by: TrendBy;
}): Promise<DealTrend> {
  const { period, year, month, by } = opts;
  const granularity: Granularity = period === "month" ? "day" : "month";

  let gteDate: string | undefined;
  let ltDate: string | undefined;
  let buckets: string[] = [];
  if (period === "month") {
    gteDate = `${year}-${pad(month)}-01`;
    ltDate = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
    const days = new Date(year, month, 0).getDate();
    buckets = Array.from({ length: days }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
  } else if (period === "year") {
    gteDate = `${year}-01-01`;
    ltDate = `${year + 1}-01-01`;
    buckets = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  } else {
    const [{ lo, hi }] = await db.select({ lo: min(deals.dealDate), hi: max(deals.dealDate) }).from(deals);
    if (lo && hi) {
      let y = Number(lo.slice(0, 4)), m = Number(lo.slice(5, 7));
      const endY = Number(hi.slice(0, 4)), endM = Number(hi.slice(5, 7));
      while (y < endY || (y === endY && m <= endM)) {
        buckets.push(`${y}-${pad(m)}`);
        if (++m > 12) { m = 1; y++; }
      }
    }
  }

  const bucketExpr = granularity === "day" ? sql`to_char(${deals.dealDate}, 'YYYY-MM-DD')` : sql`to_char(${deals.dealDate}, 'YYYY-MM')`;
  const seriesExpr =
    by === "payment"
      ? sql`case when ${deals.paymentType} = 'cash' then 'Cash'
               when ${deals.paymentType} = 'bank' then coalesce(${deals.bankName}, 'Bank (unspecified)')
               else 'Not recorded' end`
      : by === "sales"
        ? sql`${deals.salesCode}`
        : sql`'Total'`;

  // The three queries don't depend on each other, so run them together.
  const compare = by === "total" && period !== "all";
  const [rows, salesRows, prev] = await Promise.all([
    db
      .select({
        bucket: sql<string>`${bucketExpr}`,
        series: sql<string>`${seriesExpr}`,
        value: sql<number>`coalesce(sum(${deals.finalPrice}), 0)::float8`,
        n: count(),
      })
      .from(deals)
      .where(and(gteDate ? gte(deals.dealDate, gteDate) : undefined, ltDate ? lt(deals.dealDate, ltDate) : undefined))
      .groupBy(sql`1, 2`),
    by === "sales" ? db.select({ code: salesCodes.code, name: salesCodes.fullName }).from(salesCodes) : [],
    compare ? (period === "month" ? getPrevMonth(buckets) : getPrevYear(year)) : undefined,
  ]);

  const names = new Map<string, string>();
  for (const s of salesRows) names.set(s.code, `${s.code} · ${s.name.split(" ")[0]}`);

  const index = new Map(buckets.map((b, i) => [b, i]));
  const bySeries = new Map<string, { values: number[]; counts: number[]; total: number }>();
  for (const r of rows) {
    const i = index.get(r.bucket);
    if (i === undefined) continue;
    const label = names.get(r.series) ?? r.series;
    const s = bySeries.get(label) ?? { values: buckets.map(() => 0), counts: buckets.map(() => 0), total: 0 };
    s.values[i] += r.value;
    s.counts[i] += r.n;
    s.total += r.value;
    bySeries.set(label, s);
  }

  // Biggest lines first. Every payment type / bank / salesperson gets its own line (nothing is folded away).
  const ranked = [...bySeries.entries()].sort((a, b) => b[1].total - a[1].total);

  const trend: DealTrend = { granularity, buckets, series: ranked.map(([name, s]) => ({ name, ...s })) };
  if (prev) {
    const now = today();
    trend.prev = prev;
    trend.prevKind = period === "month" ? "month" : "year";
    trend.elapsed =
      period === "month"
        ? year === now.year && month === now.month ? now.day : buckets.length
        : year === now.year ? now.month : 12;
  }
  return trend;
}

/** Last year's monthly totals, Jan-Dec, aligned with this year's 12 buckets. */
async function getPrevYear(year: number) {
  const py = year - 1;
  const prevBuckets = Array.from({ length: 12 }, (_, i) => `${py}-${pad(i + 1)}`);
  const rows = await db
    .select({
      bucket: sql<string>`to_char(${deals.dealDate}, 'YYYY-MM')`,
      value: sql<number>`coalesce(sum(${deals.finalPrice}), 0)::float8`,
      n: count(),
    })
    .from(deals)
    .where(and(gte(deals.dealDate, `${py}-01-01`), lt(deals.dealDate, `${year}-01-01`)))
    .groupBy(sql`1`);
  const values = prevBuckets.map(() => 0);
  const counts = prevBuckets.map(() => 0);
  for (const r of rows) {
    const i = prevBuckets.indexOf(r.bucket);
    if (i < 0) continue;
    values[i] += r.value;
    counts[i] += r.n;
  }
  return {
    buckets: prevBuckets as (string | null)[],
    values,
    counts,
    total: values.reduce((a, b) => a + b, 0),
    totalCount: counts.reduce((a, b) => a + b, 0),
  };
}

/** Last month's daily totals for the same number of days (day 31 of a 31-day month has no match in a 30-day one). */
async function getPrevMonth(buckets: string[]) {
  const last = shiftMonthBack(buckets[buckets.length - 1]);
  const n = Number(last.slice(8));
  const first = `${last.slice(0, 7)}-01`;
  const prevBuckets = buckets.map((_, i) => (i < n ? `${last.slice(0, 7)}-${pad(i + 1)}` : null));
  const rows = await db
    .select({
      bucket: sql<string>`to_char(${deals.dealDate}, 'YYYY-MM-DD')`,
      value: sql<number>`coalesce(sum(${deals.finalPrice}), 0)::float8`,
      n: count(),
    })
    .from(deals)
    .where(and(gte(deals.dealDate, first), lte(deals.dealDate, last)))
    .groupBy(sql`1`);
  const index = new Map(prevBuckets.map((b, i) => [b, i]));
  const values = buckets.map(() => 0);
  const counts = buckets.map(() => 0);
  for (const r of rows) {
    const i = index.get(r.bucket);
    if (i === undefined) continue;
    values[i] += r.value;
    counts[i] += r.n;
  }
  return {
    buckets: prevBuckets,
    values,
    counts,
    total: values.reduce((a, b) => a + b, 0),
    totalCount: counts.reduce((a, b) => a + b, 0),
  };
}
