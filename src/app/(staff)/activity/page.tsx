import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { PageHeader } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;
const ENTITIES = [
  { value: "", label: "All" },
  { value: "listing", label: "Listings" },
  { value: "deal", label: "Deals" },
  { value: "sales_code", label: "Sales codes" },
] as const;
const ENTITY_LABEL: Record<string, string> = { listing: "Listing", deal: "Deal", sales_code: "Sales code", auth: "Sign-in", telegram_user: "Telegram user" };
const ACTION_STYLE: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-900",
  updated: "bg-sky-100 text-sky-900",
  deleted: "bg-rose-100 text-rose-900",
  exported: "bg-amber-100 text-amber-900",
  login_failed: "bg-rose-100 text-rose-900",
};

/** Where the changed record lives now; deleted records have no page. */
function hrefFor(entity: string, id: string, action: string) {
  if (action === "deleted" || action === "exported" || action === "login_failed") return null;
  if (entity === "listing") return `/listings/${id}`;
  if (entity === "deal") return `/deals/${id}/edit`;
  if (entity === "telegram_user") return "/telegram";
  return `/sales-codes?q=${encodeURIComponent(id)}`;
}

const when = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const entity = ENTITIES.some((e) => e.value && e.value === one(sp.entity)) ? one(sp.entity) : "";
  const page = Math.max(1, Math.floor(Number(one(sp.page))) || 1);
  const where = entity ? eq(activityLog.entity, entity) : undefined;

  const [[{ n }], rows] = await Promise.all([
    db.select({ n: count() }).from(activityLog).where(where),
    db.select().from(activityLog).where(where).orderBy(desc(activityLog.at)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
  ]);
  const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Activity" description="Who created, changed or deleted listings, deals and sales codes." />
      <div className="mb-4 flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <Link
            key={e.value}
            href={e.value ? `/activity?entity=${e.value}` : "/activity"}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium",
              entity === e.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {e.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border bg-card py-12 text-center text-sm text-muted-foreground">
          Nothing recorded yet. Changes made from now on will appear here.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-sm">
          {rows.map((r) => {
            const href = hrefFor(r.entity, r.entityId, r.action);
            const id = <span className="font-semibold tabular-nums">{r.entityId}</span>;
            return (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                <div className="flex shrink-0 items-center gap-2 sm:w-44">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", ACTION_STYLE[r.action])}>
                    {r.action.replace("_", " ")}
                  </span>
                  <span className="text-muted-foreground">{ENTITY_LABEL[r.entity] ?? r.entity}</span>
                </div>
                <div className="min-w-0 flex-1">
                  {href ? <Link href={href} className="text-brand-ink hover:underline">{id}</Link> : id}
                  <span className="text-muted-foreground"> · </span>
                  <span className="break-words">{r.summary}</span>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground sm:text-right">
                  <div>{r.actor}</div>
                  <div>{when.format(r.at)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && <Pagination basePath="/activity" searchParams={sp} page={page} pages={pages} total={n} />}
    </>
  );
}
