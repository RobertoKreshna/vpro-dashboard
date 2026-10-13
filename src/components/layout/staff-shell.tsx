"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, History, Home, LayoutDashboard, LogOut, Menu, Search, Users, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CommandPalette } from "@/components/layout/command-palette";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Listings", icon: Home },
  { href: "/deals", label: "Done Deals", icon: Handshake },
  { href: "/sales-codes", label: "Sales", icon: Users },
  { href: "/activity", label: "Activity", icon: History },
];

export function StaffShell({
  email,
  signOutAction,
  children,
}: {
  email: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const nav = (
    <>
      <div className="flex h-16 items-center border-b px-5">
        <Link href="/" aria-label="V-PRO dashboard">
          <Logo className="text-2xl" />
        </Link>
      </div>
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearchOpen(true);
          }}
          className="flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-brand-light/40"
        >
          <Search className="size-4" /> Search…
          <kbd className="ml-auto hidden rounded border bg-muted px-1.5 text-[11px] font-medium lg:inline">Ctrl / ⌘ K</kbd>
        </button>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary font-semibold text-white shadow-sm"
                  : "text-foreground hover:bg-brand-light/60",
              )}
            >
              <Icon className="size-4.5" /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="truncate text-xs text-muted-foreground" title={email}>{email}</p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
        <Link href="/listings-public" className="block px-3 text-xs text-brand-ink hover:underline">
          View public dashboard
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar lg:flex">{nav}</aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 lg:hidden">
        <Logo className="text-xl" />
        <button
          aria-label="Open menu"
          className="rounded-lg p-2 hover:bg-muted"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-dvh w-72 max-w-[85%] flex-col bg-sidebar shadow-xl">
            <button
              aria-label="Close menu"
              className="absolute right-3 top-4 rounded-lg p-1.5 hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <X className="size-5" />
            </button>
            {nav}
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
