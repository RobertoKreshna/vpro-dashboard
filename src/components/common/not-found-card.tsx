import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NotFoundAction = { href: string; label: string };

/** Shared body of every 404 page: big code, a plain explanation, and where to go next (first action is primary). */
export function NotFoundCard({
  title,
  message,
  actions,
  className,
}: {
  title: string;
  message: string;
  actions: NotFoundAction[];
  className?: string;
}) {
  return (
    <section className={cn("mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center", className)}>
      <p aria-hidden className="text-7xl font-extrabold tracking-tight text-brand/90 sm:text-8xl">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {actions.map((a, i) => (
          <Link key={a.href} href={a.href} className={buttonVariants({ size: "lg", variant: i === 0 ? "default" : "outline" })}>
            {a.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
