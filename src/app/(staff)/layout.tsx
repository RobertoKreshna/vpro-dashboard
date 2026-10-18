import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { listingDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { StaffShell } from "@/components/layout/staff-shell";

export const metadata = { robots: { index: false, follow: false } };

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // The badge is a convenience: if counting fails, the page must still load.
  const draftCount = await db
    .select({ n: count() })
    .from(listingDrafts)
    .where(eq(listingDrafts.status, "pending"))
    .then((r) => r[0]?.n ?? 0)
    .catch(() => 0);
  return (
    <StaffShell email={user.email ?? ""} signOutAction={signOut} draftCount={draftCount}>
      {children}
    </StaffShell>
  );
}
