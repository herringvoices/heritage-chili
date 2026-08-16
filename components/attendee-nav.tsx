import Link from "next/link";

export type AttendeeSection = "dashboard" | "chilis" | "standings" | "votes";

export function AttendeeNav({ current }: { current: AttendeeSection }) {
  const links: { section: AttendeeSection; href: string; label: string }[] = [
    { section: "dashboard", href: "/dashboard", label: "Dashboard" },
    { section: "chilis", href: "/chilis", label: "Chilis" },
    { section: "standings", href: "/standings", label: "Standings" },
    { section: "votes", href: "/votes/add", label: "Get more votes" },
  ];
  return <nav aria-label="Attendee navigation" className="mb-6 hidden gap-2 overflow-x-auto pb-1 text-sm font-black md:flex">{links.map((link) => {
    const active = link.section === current;
    return <Link key={link.section} aria-current={active ? "page" : undefined} href={link.href} className={`min-h-11 shrink-0 rounded-full px-5 py-3 ${active ? "bg-amber text-[#2b1905]" : "border border-white/10 bg-white/5"}`}>{link.label}</Link>;
  })}</nav>;
}
