import Link from "next/link";
import type { ReactNode } from "react";
import { AttendeeShell } from "./shells";

export function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <AttendeeShell>
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl text-sm font-black text-amber-bright transition hover:text-warm-cream"
        >
          ← Back to the cookoff
        </Link>
        <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-amber">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-6xl">{title}</h1>
        <p className="mt-5 text-lg leading-8 text-warm-gray">{summary}</p>

        <div className="legal-copy glass-card mt-8 rounded-[var(--radius-card)] p-6 sm:p-9">
          {children}
        </div>

        <p className="mt-5 text-sm font-bold text-warm-gray">Last updated July 25, 2026.</p>
      </article>
    </AttendeeShell>
  );
}
