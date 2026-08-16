import { ExternalLink, Flame, Heart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { GOFUNDME_URL } from "@/lib/gofundme";
import { MobileNavigation, type NavigationRole } from "./mobile-navigation";

function DonateLink() {
  return (
    <a
      href={GOFUNDME_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-amber-bright/45 bg-gradient-to-br from-amber-bright via-amber to-[#d97706] px-3 py-2 text-sm font-black text-[#2b1905] shadow-[var(--glow-action)] transition-[transform,border-color,box-shadow,filter] duration-200 hover:-translate-y-0.5 hover:border-amber-bright hover:brightness-110 hover:shadow-[0_14px_38px_rgb(245_158_11_/_34%)] active:translate-y-px active:scale-[.985] sm:px-4"
    >
      <Heart className="size-4" fill="currentColor" aria-hidden="true" />
      <span>Donate</span>
      <ExternalLink className="hidden size-3.5 sm:block" aria-hidden="true" />
      <span className="sr-only"> on GoFundMe (opens in a new tab)</span>
    </a>
  );
}

function LegalFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/10 py-6 text-center text-sm font-bold text-warm-gray">
      <span>Heritage Chili Cookoff</span>
      <Link className="rounded-md underline decoration-white/20 underline-offset-4 transition hover:text-warm-cream hover:decoration-amber" href="/privacy">
        Privacy
      </Link>
      <Link className="rounded-md underline decoration-white/20 underline-offset-4 transition hover:text-warm-cream hover:decoration-amber" href="/terms">
        Terms
      </Link>
    </footer>
  );
}

export function AttendeeShell({ children, accountLabel, accountAction, navigationRole }: { children: ReactNode; accountLabel?: string; accountAction?: ReactNode; navigationRole?: Exclude<NavigationRole, "admin"> }) {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <Link href="/" className="flex min-h-11 items-center gap-3 rounded-xl font-black"><span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-amber-bright to-autumn-red shadow-[var(--glow-action)]"><Flame className="size-5 text-[#2b1905]" fill="currentColor" /></span><span>Chili Cookoff</span></Link>
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <DonateLink />
            {accountLabel ? accountAction : null}
          </div>
          {navigationRole && accountLabel ? <MobileNavigation role={navigationRole} accountLabel={accountLabel} /> : (
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <DonateLink />
              {accountLabel ? accountAction : null}
            </div>
          )}
        </header>
        <div className="py-10 sm:py-14">{children}</div>
        <LegalFooter />
      </div>
    </main>
  );
}

export function AdminShell({ children, accountLabel, accountAction }: { children: ReactNode; accountLabel: string; accountAction?: ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="glass-card flex items-center justify-between gap-4 rounded-[var(--radius-card)] px-4 py-4 sm:px-5"><Link href="/admin" className="flex min-h-11 min-w-0 items-center gap-3 font-black"><Flame className="size-6 shrink-0 text-amber" fill="currentColor" /><span className="truncate">Cookoff command center</span></Link><div className="hidden min-w-0 items-center gap-2 md:flex"><DonateLink />{accountAction}</div><MobileNavigation role="admin" accountLabel={accountLabel} /></header>
        <div className="py-8">{children}</div>
        <LegalFooter />
      </div>
    </main>
  );
}
