import { CalendarDays, Car, Clock, ExternalLink, MapPin } from "lucide-react";
import { Badge, Card } from "./ui";

export function EventDetails() {
  return (
    <Card featured className="relative overflow-hidden">
      <div className="absolute -right-16 -top-16 size-44 rounded-full bg-amber/15 blur-3xl" />
      <Badge tone="amber">RSVP by September 12</Badge>

      <div className="relative mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4">
          <CalendarDays className="size-6 text-amber" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-warm-gray">Event date</p>
          <p className="mt-1 text-xl font-black">Saturday, September 26</p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4">
          <Clock className="size-6 text-amber" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-warm-gray">Event time</p>
          <p className="mt-1 text-xl font-black">4:30–6:30 PM</p>
        </div>
      </div>

      <div className="relative mt-4 rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-6 shrink-0 text-amber" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-black">McKendree United Methodist Church</h2>
            <p className="mt-2 leading-6 text-warm-gray">
              Park in the McKendree Garage at 140 6th Avenue North, between Church and Commerce Streets. The church entrance is on the garage&apos;s 4th floor, the Johnny Cash/purple level.
            </p>
            <p className="mt-2 leading-6 text-warm-gray">
              Walking? Use the front entrance at 523 Church Street.
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex items-start gap-3 rounded-[var(--radius-control)] border border-amber/25 bg-amber/10 p-4 sm:p-5">
        <Car className="mt-0.5 size-6 shrink-0 text-amber-bright" aria-hidden="true" />
        <div>
          <h2 className="font-black">Free validated parking</h2>
          <p className="mt-2 leading-6 text-warm-gray">
            Do not follow the QR-code prompts in the garage. Scan the validation code at the event and complete the process before leaving, or the automated system will charge you.
          </p>
          <a
            href="https://mckendreenashville.com/facilities/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 font-black text-amber-bright underline decoration-amber/40 underline-offset-4 transition hover:text-warm-cream hover:decoration-warm-cream"
          >
            More parking information
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </Card>
  );
}
