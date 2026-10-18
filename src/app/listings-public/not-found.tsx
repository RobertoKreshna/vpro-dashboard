import { NotFoundCard } from "@/components/common/not-found-card";

export const metadata = { title: "Listing not available" };

/** A public listing link whose listing no longer exists. */
export default function PublicListingNotFound() {
  return (
    <NotFoundCard
      title="Listing not available"
      message="This listing may have been sold, rented or removed, or the link is incorrect."
      actions={[{ href: "/listings-public", label: "Browse all listings" }]}
      className="min-h-[calc(100dvh-14rem)] justify-center py-0"
    />
  );
}
