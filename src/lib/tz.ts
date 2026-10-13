/** The agency works in Makassar (WITA, UTC+8); server code runs in UTC, so "today" and "this month" must be read here. */
export const TIME_ZONE = "Asia/Makassar";

const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's calendar date in Makassar. `month` is 1-12. */
export function today(): { year: number; month: number; day: number } {
  const p = Object.fromEntries(parts.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}
