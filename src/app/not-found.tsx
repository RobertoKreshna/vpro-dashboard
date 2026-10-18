import { Logo } from "@/components/brand/logo";
import { NotFoundCard } from "@/components/common/not-found-card";

export const metadata = { title: "Page not found" };

/** Any URL that matches no route at all. Rendered without the staff sidebar, so it works for signed-out visitors too. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <Logo className="text-4xl" />
      <NotFoundCard
        title="Page not found"
        message="The page you're looking for doesn't exist, or the link is out of date."
        actions={[{ href: "/", label: "Dashboard" }]}
        className="py-8"
      />
    </main>
  );
}
