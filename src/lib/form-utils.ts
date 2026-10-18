import { parseIDR } from "@/lib/format";

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;

/** Accepts "120", "120,5" or "120.5"; returns null when empty/invalid. */
export function decimal(fd: FormData, k: string): number | null {
  const raw = str(fd, k).replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function integer(fd: FormData, k: string): number | null {
  const n = decimal(fd, k);
  return n === null ? null : Math.trunc(n);
}

export const money = (fd: FormData, k: string) => parseIDR(fd.get(k));

export function zodErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const i of issues) errors[String(i.path[0])] ??= i.message;
  return errors;
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
