import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "drafts", href: "/drafts", label: "Drafts" },
  { key: "telegram", href: "/telegram", label: "Telegram accounts" },
] as const;

/** Tabs shared by the Drafts review queue and the Telegram accounts that feed it (one section in the sidebar). */
export function DraftsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Drafts section" className="mb-5 flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            t.key === active
              ? "border-primary font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
