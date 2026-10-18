"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Handshake, History, Home, Inbox, LayoutDashboard, Send, Users } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { globalSearch, type SearchResults } from "@/app/(staff)/search/actions";

const PAGES = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Listings", icon: Home },
  { href: "/drafts", label: "Drafts", icon: Inbox },
  { href: "/deals", label: "Done Deals", icon: Handshake },
  { href: "/sales-codes", label: "Sales", icon: Users },
  { href: "/telegram", label: "Telegram", icon: Send },
  { href: "/activity", label: "Activity", icon: History },
];
const NONE: SearchResults = { listings: [], deals: [], salesCodes: [] };

/** Ctrl/Cmd+K quick search: jump to a page, a listing, a deal or a sales code. Open it from `open` / `onOpenChange`. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  // The results remember which search they answer, so "No results" never flashes before the answer arrives.
  const [answer, setAnswer] = React.useState<{ term: string; data: SearchResults }>({ term: "", data: NONE });
  const term = query.trim();
  const searching = term.length >= 2;
  const done = answer.term === term;
  const results = searching ? answer.data : NONE;

  // Ctrl/Cmd+K anywhere in the staff area.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Search as you type (after a short pause). A late answer for an older search is dropped.
  React.useEffect(() => {
    if (term.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      globalSearch(term)
        .then((data) => !stale && setAnswer({ term, data }))
        .catch(() => !stale && setAnswer({ term, data: NONE }));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [term]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  const found = results.listings.length + results.deals.length + results.salesCodes.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Quick search" description="Search listings, deals and sales codes, or jump to a page.">
      {/* Results come from the server, so cmdk's own filtering is off. */}
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search listings, deals, sales codes…" />
        <CommandList>
          {searching && done && !found && <CommandEmpty>No results.</CommandEmpty>}
          {searching && !done && !found && <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>}
          {results.listings.length > 0 && (
            <CommandGroup heading="Listings">
              {results.listings.map((l) => (
                <CommandItem key={l.id} value={`listing-${l.id}`} onSelect={() => go(`/listings/${l.id}`)}>
                  <Home /> <span className="font-medium tabular-nums">{l.id}</span>
                  <span className="truncate text-muted-foreground">{l.title} · {l.city}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.deals.length > 0 && (
            <CommandGroup heading="Done deals">
              {results.deals.map((d) => (
                <CommandItem key={d.id} value={`deal-${d.id}`} onSelect={() => go(`/deals/${d.id}/edit`)}>
                  <Handshake /> <span className="font-medium tabular-nums">{d.id}</span>
                  <span className="truncate text-muted-foreground">{d.buyerName} · {d.city}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.salesCodes.length > 0 && (
            <CommandGroup heading="Sales codes">
              {results.salesCodes.map((s) => (
                <CommandItem key={s.code} value={`sales-${s.code}`} onSelect={() => go(`/sales-codes?q=${encodeURIComponent(s.code)}`)}>
                  <Users /> <span className="font-medium">{s.code}</span>
                  <span className="truncate text-muted-foreground">{s.fullName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!searching && (
            <CommandGroup heading="Go to">
              {PAGES.map(({ href, label, icon: Icon }) => (
                <CommandItem key={href} value={`page-${href}`} onSelect={() => go(href)}>
                  <Icon /> {label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
