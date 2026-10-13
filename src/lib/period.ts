import { min } from "drizzle-orm";
import { db } from "@/db";
import { deals } from "@/db/schema";
import { today } from "@/lib/tz";

export type Period = "month" | "year" | "all";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;

/** Reads the Month / Year / All time choice (`period`, `m`, `y`) shared by the dashboard and the Sales page. */
export function parsePeriod(sp: SP) {
  const now = today();
  const p = one(sp.period);
  const period: Period = p === "year" || p === "all" ? p : "month";
  const year = Math.min(2100, Math.max(2000, Number(one(sp.y)) || now.year));
  const month = Math.min(12, Math.max(1, Number(one(sp.m)) || now.month));
  let range: { gte?: string; lt?: string } = {};
  let label = "All time";
  if (period === "month") {
    range = { gte: ymd(year, month), lt: month === 12 ? ymd(year + 1, 1) : ymd(year, month + 1) };
    label = new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  } else if (period === "year") {
    range = { gte: ymd(year, 1), lt: ymd(year + 1, 1) };
    label = String(year);
  }
  return { period, year, month, range, label };
}

/** Years to offer in the period picker: from the first deal to now, plus the selected one. */
export async function dealYears(selected: number) {
  const [{ firstDeal }] = await db.select({ firstDeal: min(deals.dealDate) }).from(deals);
  const thisYear = today().year;
  const first = firstDeal ? Number(firstDeal.slice(0, 4)) : thisYear;
  const years: number[] = [];
  for (let y = thisYear; y >= Math.min(first, thisYear); y--) years.push(y);
  if (!years.includes(selected)) {
    years.push(selected);
    years.sort((a, b) => b - a);
  }
  return years;
}
