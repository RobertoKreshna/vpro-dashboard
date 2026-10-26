import "server-only";
import { db } from "@/db";
import { activityLog } from "@/db/schema";

type Entry = {
  actor: string | null | undefined;
  action: "created" | "updated" | "deleted" | "exported" | "imported" | "login_failed";
  entity: "listing" | "deal" | "sales_code" | "auth" | "telegram_user";
  entityId: string;
  summary: string;
};

/** Records who changed what. A logging failure must never block the change itself. */
export async function logActivity(e: Entry) {
  try {
    await db.insert(activityLog).values({ ...e, actor: e.actor || "unknown", summary: e.summary.slice(0, 300) });
  } catch (err) {
    console.error("activity log failed", err);
  }
}

/** Names of the keys whose values differ between two rows (dates and arrays compared by value). */
export function changedKeys<T extends Record<string, unknown>>(before: T, after: Partial<T>, labels: Partial<Record<keyof T, string>>) {
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : JSON.stringify(v ?? null));
  return (Object.keys(labels) as (keyof T)[])
    .filter((k) => k in after && norm(before[k]) !== norm(after[k]))
    .map((k) => labels[k] as string);
}
