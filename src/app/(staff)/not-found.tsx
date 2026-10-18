import { NotFoundCard } from "@/components/common/not-found-card";

export const metadata = { title: "Not found" };

/** A staff page whose record doesn't exist (deleted listing or deal, a Telegram draft that was already saved or discarded). */
export default function StaffNotFound() {
  return (
    <NotFoundCard
      title="We can't find that"
      message="It may have been deleted, or the link is out of date. If you opened a Telegram draft, it may already have been saved as a listing or discarded."
      actions={[{ href: "/", label: "Dashboard" }]}
      className="min-h-[calc(100dvh-6.5rem)] justify-center py-0 lg:min-h-[calc(100dvh-3rem)]"
    />
  );
}
