import { Skeleton } from "@/components/ui/skeleton";

/** Shown straight away while a staff page's server work finishes, instead of a frozen screen. */
export default function StaffLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[134px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </div>
  );
}
