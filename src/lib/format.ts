const idr = new Intl.NumberFormat("id-ID");
const idrExact = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1500000 -> "Rp. 1.500.000,00" (Indonesian separators: dot for thousands, comma for decimals) */
export function formatIDR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `Rp. ${idrExact.format(n)}`;
}

const idShort = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** 1.500.000.000 -> "Rp 1,5 M", 12.000.000 -> "Rp 12 jt" */
export function compactIDR(n: number): string {
  if (n >= 1e12) return `Rp ${idShort.format(n / 1e12)} T`;
  if (n >= 1e9) return `Rp ${idShort.format(n / 1e9)} M`;
  if (n >= 1e6) return `Rp ${idShort.format(n / 1e6)} jt`;
  return `Rp ${idr.format(Math.round(n))}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return idr.format(n);
}

/** "2026-10-06" or Date -> "06/10/2026" */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Parses "1.500.000", "Rp 1,500,000" or "1500000" into a number. */
export function parseIDR(v: FormDataEntryValue | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
