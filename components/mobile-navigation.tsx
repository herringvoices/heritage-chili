"use client";

import { SignOutButton } from "@clerk/clerk-react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ClipboardCheck,
  ExternalLink,
  Flame,
  Gauge,
  Heart,
  ListChecks,
  LogOut,
  Menu,
  Settings2,
  Soup,
  Trophy,
  UserRound,
  Users,
  Vote,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GOFUNDME_URL } from "@/lib/gofundme";

export type NavigationRole = "guest" | "contestant" | "admin";

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof Gauge;
  match?: (pathname: string) => boolean;
};

export function navigationForRole(role: NavigationRole): NavigationItem[] {
  if (role === "admin") {
    return [
      { href: "/admin", label: "Overview", icon: Gauge, match: (path) => path === "/admin" },
      { href: "/admin/check-in", label: "Check in", icon: ClipboardCheck },
      { href: "/admin/users", label: "Attendees", icon: Users },
      { href: "/admin/chilis", label: "Chilis", icon: Soup },
      { href: "/admin/pledges", label: "Pledges", icon: Heart },
      { href: "/admin/event", label: "Event", icon: Settings2 },
      { href: "/admin/results", label: "Results", icon: Trophy },
      { href: "/admin/audit", label: "Audit", icon: ListChecks },
    ];
  }

  const attendeeItems: NavigationItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: Gauge },
    { href: "/chilis", label: "Chilis", icon: Soup },
    { href: "/standings", label: "Standings", icon: Trophy },
    { href: "/votes/add", label: "Get more votes", icon: Vote },
  ];

  if (role === "contestant") {
    attendeeItems.splice(1, 0, { href: "/chili/edit", label: "My chili", icon: Flame });
  }

  return attendeeItems;
}

function isCurrent(item: NavigationItem, pathname: string) {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MobileNavigation({ role, accountLabel }: { role: NavigationRole; accountLabel: string }) {
  const pathname = usePathname();
  const items = navigationForRole(role);
  const roleLabel = role === "admin" ? "Administrator" : role === "contestant" ? "Entrant" : "Guest";

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-warm-cream transition hover:border-amber/35 hover:bg-white/10 md:hidden"
        >
          <Menu className="size-6" aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-nav-overlay fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm md:hidden" />
        <Dialog.Content className="mobile-nav-drawer fixed inset-y-0 right-0 z-[80] flex w-[min(88vw,23rem)] flex-col border-l border-amber/20 bg-[#181512] p-5 shadow-[-24px_0_70px_rgb(0_0_0_/_55%)] md:hidden">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-xl font-black">
                <Flame className="size-5 text-amber" fill="currentColor" aria-hidden="true" />
                Chili Cookoff
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm font-bold text-warm-gray">
                {roleLabel} navigation
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close navigation" className="grid size-11 shrink-0 place-items-center rounded-full text-warm-gray transition hover:bg-white/10 hover:text-warm-cream">
                <X className="size-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <nav aria-label={`${roleLabel} navigation`} className="mt-5 grid gap-2 overflow-y-auto">
            {items.map((item) => {
              const active = isCurrent(item, pathname);
              const Icon = item.icon;
              return (
                <Dialog.Close key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 font-black transition ${
                      active
                        ? "bg-amber text-[#2b1905] shadow-[var(--glow-action)]"
                        : "border border-transparent text-warm-cream hover:border-white/10 hover:bg-white/10"
                    }`}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </Dialog.Close>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-white/10 pt-5">
            <a
              href={GOFUNDME_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-bright via-amber to-[#d97706] px-4 py-3 font-black text-[#2b1905] shadow-[var(--glow-action)]"
            >
              <Heart className="size-5" fill="currentColor" aria-hidden="true" />
              Donate
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only"> on GoFundMe (opens in a new tab)</span>
            </a>
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber/15 text-amber">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{accountLabel}</p>
                <p className="text-xs font-bold text-warm-gray">{roleLabel}</p>
              </div>
            </div>
            <SignOutButton redirectUrl="/">
              <button type="button" className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left font-black text-warm-gray transition hover:bg-white/10 hover:text-warm-cream">
                <LogOut className="size-5 text-amber" aria-hidden="true" />
                Log out
              </button>
            </SignOutButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
