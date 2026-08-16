"use client";
/* eslint-disable @next/next/no-img-element -- authenticated object URLs */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronLeft, CircleDollarSign, CircleHelp, Flame, ImagePlus, LockKeyhole, Mail, Pencil, Trash2, Users, Vote, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { centsToInput, formatCents, parseCurrencyToCents } from "@/lib/currency";
import { NOTICE_VERSIONS, type NoticeKey, type NoticeStatus } from "@/lib/notices";
import { AttendeeNav } from "./attendee-nav";
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Input, LoadingState } from "./ui";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;
type Dashboard = {
  attendee: { displayName: string | null; role: "guest" | "contestant"; partySize: number; checkedIn: boolean; checkInCode: string | null; participation: { disabled: boolean; reason: string | null } };
  votes: { issued: number; cast: number; available: number; usableNow: boolean; history: { chiliId: number; chiliName: string; count: number }[] };
  pledges: { totalCents: number; hasInitial: boolean };
  event: { votingIsOpen: boolean; resultsAreFinal: boolean; suggestedAdditionalVoteCents: number; suggestedChiliEntryCents: number; chiliEntryIsOpen: boolean; minPartySize: number; maxPartySize: number };
  chili: ChiliModel | null;
  notices: { noticeKey: string; noticeVersion: number; status: NoticeStatus }[];
};
type ChiliModel = { id: number; name: string | null; description: string | null; spiceLevel: number | null; status: "draft" | "active" | "inactive" | "disqualified"; complete: boolean; imageUrl: string | null; tags: Tag[] };
type Tag = { id: number; name: string; slug: string; description?: string | null };

function usePrivateImage(authFetch: AuthFetch, url: string | null) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    authFetch(url).then(async (response) => {
      if (!response.ok) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (!cancelled) setSource(objectUrl);
    }).catch(() => undefined);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [authFetch, url]);
  return url ? source : null;
}

function ChiliImage({ authFetch, chili, className = "" }: { authFetch: AuthFetch; chili: ChiliModel; className?: string }) {
  const source = usePrivateImage(authFetch, chili.imageUrl);
  return source
    ? <img src={source} alt={chili.name ? `${chili.name} chili` : "Chili entry"} className={`object-cover ${className}`} />
    : <div className={`grid place-items-center bg-gradient-to-br from-amber/15 to-autumn-red/15 text-amber ${className}`}><Flame className="size-10" aria-hidden="true" /></div>;
}

type TourTarget = "checkin" | "rsvp" | "chili";
type TourStep = { noticeKey: NoticeKey; target: TourTarget; title: string; message: string };

function DashboardTour({ authFetch, mode, steps, targetRefs, onTargetChange, onClose }: {
  authFetch: AuthFetch;
  mode: "auto" | "replay";
  steps: TourStep[];
  targetRefs: Record<TourTarget, RefObject<HTMLDivElement | null>>;
  onTargetChange: (target: TourTarget | null) => void;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];
  const noticeKeySignature = [...new Set(steps.map((item) => item.noticeKey))].join("|");
  const noticeKeys = useMemo(() => noticeKeySignature.split("|").filter(Boolean) as NoticeKey[], [noticeKeySignature]);
  const stepTarget = step?.target;

  const recordAll = useCallback(async (status: NoticeStatus) => {
    await Promise.all(noticeKeys.map((noticeKey) => authFetch(`/api/notices/${encodeURIComponent(noticeKey)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => undefined)));
  }, [authFetch, noticeKeys]);

  useEffect(() => {
    if (mode === "auto") void recordAll("seen");
  }, [mode, recordAll]);

  useEffect(() => {
    if (!stepTarget) return;
    onTargetChange(stepTarget);
    targetRefs[stepTarget].current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => dialogRef.current?.focus(), 350);
    return () => onTargetChange(null);
  }, [onTargetChange, stepTarget, targetRefs]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mode === "auto") void recordAll("dismissed");
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, onClose, recordAll]);

  if (!step) return null;
  const isLast = stepIndex === steps.length - 1;
  function skip() { if (mode === "auto") void recordAll("dismissed"); onClose(); }
  function advance() {
    if (!isLast) setStepIndex((current) => current + 1);
    else { if (mode === "auto") void recordAll("completed"); onClose(); }
  }

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dashboard-tour-title" aria-describedby="dashboard-tour-message" tabIndex={-1} className="glass-card fixed inset-x-0 bottom-0 z-[60] rounded-t-[var(--radius-feature)] border-x-0 border-b-0 p-5 shadow-2xl outline-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(28rem,calc(100vw-3rem))] sm:rounded-[var(--radius-feature)] sm:border">
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-amber-bright">Quick tour · {stepIndex + 1} of {steps.length}</p><h2 id="dashboard-tour-title" className="mt-2 text-2xl font-black">{step.title}</h2></div><button type="button" aria-label="Skip tour" onClick={skip} className="grid size-11 shrink-0 place-items-center rounded-full text-warm-gray transition hover:bg-white/10 hover:text-warm-cream"><X className="size-5" /></button></div>
    <p id="dashboard-tour-message" className="mt-3 leading-7 text-warm-gray">{step.message}</p>
    <div className="mt-5 flex items-center justify-between gap-3"><Button type="button" variant="secondary" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ChevronLeft className="size-4" /> Back</Button><div className="flex items-center gap-3"><button type="button" onClick={skip} className="min-h-11 px-2 text-sm font-black text-warm-gray underline-offset-4 hover:text-warm-cream hover:underline">Skip</button><Button type="button" onClick={advance}>{isLast ? "Done" : "Next"}{!isLast ? <ArrowRight className="size-4" /> : <CheckCircle2 className="size-4" />}</Button></div></div>
  </div>;
}

export function DashboardView({ authFetch }: { authFetch: AuthFetch }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tourMode, setTourMode] = useState<"auto" | "replay" | null>(null);
  const [tourTarget, setTourTarget] = useState<TourTarget | null>(null);
  const autoTourStarted = useRef(false);
  const checkinRef = useRef<HTMLDivElement>(null);
  const rsvpRef = useRef<HTMLDivElement>(null);
  const chiliRef = useRef<HTMLDivElement>(null);
  const targetRefs = useMemo(() => ({ checkin: checkinRef, rsvp: rsvpRef, chili: chiliRef }), []);
  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await authFetch("/api/dashboard", { cache: "no-store" });
      const body = await response.json() as { data?: Dashboard; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "We could not load your dashboard.");
      setDashboard(body.data);
      if (!autoTourStarted.current) {
        const eligibleKeys: NoticeKey[] = ["attendee_dashboard_tutorial"];
        if (body.data.attendee.role === "contestant") eligibleKeys.push("contestant_chili_tutorial");
        const hasPending = eligibleKeys.some((noticeKey) => {
          const state = body.data!.notices.find((item) => item.noticeKey === noticeKey && item.noticeVersion === NOTICE_VERSIONS[noticeKey]);
          return !state || state.status === "seen";
        });
        autoTourStarted.current = true;
        if (hasPending) setTourMode("auto");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not load your dashboard."); }
  }, [authFetch]);
  // Dashboard data is an external server resource.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} action={<Button onClick={() => void load()}>Try again</Button>} />;
  if (!dashboard) return <Card><LoadingState label="Ladling up your dashboard…" /></Card>;

  const { attendee, votes, pledges, event, chili } = dashboard;
  const eligibleKeys: NoticeKey[] = ["attendee_dashboard_tutorial", ...(attendee.role === "contestant" ? ["contestant_chili_tutorial" as const] : [])];
  const activeKeys = tourMode === "replay" ? eligibleKeys : eligibleKeys.filter((noticeKey) => {
    const state = dashboard.notices.find((item) => item.noticeKey === noticeKey && item.noticeVersion === NOTICE_VERSIONS[noticeKey]);
    return !state || state.status === "seen";
  });
  const tourSteps: TourStep[] = activeKeys.flatMap((noticeKey) => noticeKey === "attendee_dashboard_tutorial" ? [
    { noticeKey, target: "checkin", title: "Your event check-in", message: attendee.checkedIn ? "You're checked in. This card confirms that your party has arrived and your votes are unlocked when voting is open." : "Here’s your check-in code. When you arrive at the event, head to a staff member and show them this code to let them know that your party and, if applicable, your chili have arrived." },
    { noticeKey, target: "rsvp", title: "Update your RSVP", message: "Here you can make changes to your party and your pledge amount. Party changes will be locked once you’ve been checked in, but you can continue updating your pledge." },
  ] : [
    { noticeKey, target: "chili", title: "Finish your chili entry", message: "Here’s the incomplete draft for your chili. Select Finish chili entry to add its information. Your chili will remain a draft until it is checked in on the day of the event." },
  ]);
  const spotlightClass = "relative z-50 scroll-mt-28 rounded-[var(--radius-card)] ring-4 ring-amber-bright shadow-[0_0_0_9999px_rgb(0_0_0_/_76%),0_0_42px_rgb(245_158_11_/_45%)]";
  const votingMessage = attendee.participation.disabled
    ? attendee.participation.reason ?? "An organizer has paused participation for this account."
    : !attendee.checkedIn
      ? `Your ${votes.issued} allocated ${votes.issued === 1 ? "vote is" : "votes are"} ready, but they unlock only after event check-in.`
      : event.resultsAreFinal ? "Voting has ended and the results are final."
      : !event.votingIsOpen ? "Voting is currently closed. Your vote balance and history are safe."
      : votes.available === 0 ? "You’ve used every available vote. Nicely committed."
      : "Voting is open and your available votes are ready to cast.";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5">
      <AttendeeNav current="dashboard" />

      <div ref={checkinRef} className={tourTarget === "checkin" ? spotlightClass : ""}>
        <Card featured>
          <div className="flex flex-wrap items-start justify-between gap-4"><div><Badge tone={attendee.checkedIn ? "amber" : "neutral"}>{attendee.checkedIn ? "Checked in" : "Check-in needed"}</Badge><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Welcome back{attendee.displayName ? `, ${attendee.displayName}` : ""}.</h1></div>{!attendee.checkedIn && attendee.checkInCode ? <div className="rounded-[var(--radius-control)] border border-amber/25 bg-amber/10 px-5 py-3 text-center"><p className="text-xs font-black uppercase tracking-widest text-warm-gray">Check-in code</p><p className="font-mono text-3xl font-black tracking-[.18em] text-amber-bright">{attendee.checkInCode}</p></div> : null}</div>
          <div className="mt-6 flex gap-3 rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber" /><p className="leading-6 text-warm-gray">{votingMessage}</p></div>
          <button type="button" onClick={() => setTourMode("replay")} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-warm-gray underline-offset-4 hover:text-warm-cream hover:underline"><CircleHelp className="size-4" /> Show me around</button>
        </Card>
      </div>

      {attendee.participation.disabled ? <ErrorState title="Participation paused" message={votingMessage} /> : null}
      {!pledges.hasInitial ? <Card featured className="border-amber/30"><Badge tone="amber">One step left</Badge><h2 className="mt-4 text-2xl font-black">Finish your RSVP pledge</h2><p className="mt-2 text-warm-gray">Choose any nonnegative amount, including zero, to complete the initial pledge step.</p><Button className="mt-5 w-full sm:w-auto" onClick={() => window.location.assign("/pledge")}>Choose pledge amount <ArrowRight className="size-4" /></Button></Card> : null}

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Participation summary">
        <Card><Vote className="size-6 text-amber" /><p className="mt-4 text-sm font-bold text-warm-gray">Available votes</p><p className="text-4xl font-black">{votes.available}</p><p className="mt-2 text-sm text-warm-gray">{votes.cast} cast of {votes.issued} issued</p></Card>
        <Card><CircleDollarSign className="size-6 text-amber" /><p className="mt-4 text-sm font-bold text-warm-gray">Total pledged</p><p className="text-4xl font-black">{formatCents(pledges.totalCents)}</p><p className="mt-2 text-sm text-warm-gray">Across your pledge history</p></Card>
        <Card><Users className="size-6 text-amber" /><p className="mt-4 text-sm font-bold text-warm-gray">Your party</p><p className="text-4xl font-black">{attendee.partySize}</p><p className="mt-2 text-sm text-warm-gray">{attendee.checkedIn ? "Checked in" : "Waiting for check-in"}</p></Card>
      </section>

      <div ref={rsvpRef} className={tourTarget === "rsvp" ? spotlightClass : ""}><AccountDetailsControls authFetch={authFetch} dashboard={dashboard} onSaved={load} /></div>

      {attendee.role === "guest" && event.chiliEntryIsOpen ? <GuestChiliEntryCard authFetch={authFetch} suggestedPledgeCents={event.suggestedChiliEntryCents} /> : null}

      {attendee.role === "contestant" ? <div ref={chiliRef} className={tourTarget === "chili" ? spotlightClass : ""}><ContestantCard authFetch={authFetch} chili={chili} /></div> : null}

      <Card>
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-bold text-warm-gray">Your activity</p><h2 className="text-2xl font-black">Vote history</h2></div><Vote className="size-7 text-amber" /></div>
        {votes.history.length ? <ul className="mt-5 divide-y divide-white/10">{votes.history.map((item) => <li key={item.chiliId} className="flex min-h-14 items-center justify-between gap-4 py-3"><span className="font-bold">{item.chiliName}</span><Badge tone="amber">{item.count} {item.count === 1 ? "vote" : "votes"}</Badge></li>)}</ul> : <div className="mt-5"><EmptyState title="No votes cast yet" message={!attendee.checkedIn ? "Check in at the event before casting your first vote." : !event.votingIsOpen ? "Your history will appear here when voting opens and you cast a vote." : "Browse the chilis when you’re ready to choose."} /></div>}
      </Card>
      <aside className="rounded-[var(--radius-control)] border border-white/10 bg-white/[.035] px-5 py-4 text-center text-sm text-warm-gray sm:text-left">
        <p><strong className="text-warm-cream">Have questions?</strong> Contact us at <a href="mailto:hhomoelle@yahoo.com" className="inline-flex min-h-11 items-center gap-2 font-black text-amber-bright underline decoration-amber/40 underline-offset-4 transition hover:text-warm-cream hover:decoration-warm-cream"><Mail className="size-4" aria-hidden="true" />hhomoelle@yahoo.com</a>.</p>
      </aside>
      {tourMode && tourSteps.length ? <DashboardTour authFetch={authFetch} mode={tourMode} steps={tourSteps} targetRefs={targetRefs} onTargetChange={setTourTarget} onClose={() => { setTourTarget(null); setTourMode(null); }} /> : null}
    </motion.div>
  );
}

function GuestChiliEntryCard({ authFetch, suggestedPledgeCents }: { authFetch: AuthFetch; suggestedPledgeCents: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(suggestedPledgeCents));
  const [submitting, setSubmitting] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const amountCents = parseCurrencyToCents(amount);

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    if (amountCents === null || submitting) return;
    setSubmitting(true); setEntryError(null);
    try {
      const storageKey = "chili-cookoff:add-chili-entry:idempotency-key";
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await authFetch("/api/registration/chili-entry", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ amountCents }),
      });
      const body = await response.json() as { data?: { purpose: "chili_entry"; pledgedCents: number; totalPledgedCents: number; gofundmeUrl: string | null; nextRoute: string; continueRoute: string; continueLabel: string }; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Your chili entry could not be added.");
      sessionStorage.removeItem(storageKey);
      sessionStorage.setItem("chili-cookoff:last-pledge", JSON.stringify(body.data));
      window.location.assign(body.data.nextRoute);
    } catch (caught) {
      setEntryError(caught instanceof Error ? caught.message : "Your chili entry could not be added.");
      setSubmitting(false);
    }
  }

  return <Card featured className="border-autumn-red/30">
    <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-autumn-red/15 text-red-light"><Flame className="size-6" aria-hidden="true" /></span><div><Badge tone="red">Entries still open</Badge><h2 className="mt-3 text-2xl font-black">Want to bring a chili after all?</h2><p className="mt-2 max-w-2xl leading-6 text-warm-gray">Add an entry before the event begins. We’ll turn your RSVP into an entrant RSVP and create a draft for your chili.</p></div></div>
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!submitting) { setOpen(nextOpen); setEntryError(null); } }}>
      <DialogPrimitive.Trigger asChild><Button className="mt-5 w-full sm:w-auto">Enter a chili <ArrowRight className="size-4" /></Button></DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <DialogPrimitive.Content className="glass-card fixed inset-x-3 bottom-3 z-[60] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[var(--radius-feature)] p-6 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,34rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:p-8">
          <DialogPrimitive.Title className="text-3xl font-black">Add your chili entry</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-3 leading-7 text-warm-gray">The suggested additional pledge for entering a chili is <strong className="text-warm-cream">{formatCents(suggestedPledgeCents)}</strong>. Adjust it or enter zero. This records a pledge only; no payment happens in the app.</DialogPrimitive.Description>
          <form onSubmit={addEntry} className="mt-6 grid gap-5">
            <label className="font-black" htmlFor="guest-chili-pledge">Additional pledge amount<span className="relative mt-2 block"><span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-amber">$</span><Input id="guest-chili-pledge" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="pl-9 text-xl font-black" /></span></label>
            {amountCents === null ? <p role="alert" className="text-sm font-bold text-red-light">Enter a valid amount, such as 10, 10.00, or 0.</p> : null}
            {entryError ? <ErrorState title="Your entry wasn’t added" message={entryError} /> : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><DialogPrimitive.Close asChild><Button type="button" variant="secondary" disabled={submitting}>Not yet</Button></DialogPrimitive.Close><Button type="submit" disabled={amountCents === null || submitting}>{submitting ? "Adding your entry…" : amountCents === 0 ? "Add entry with $0 pledge" : `Add entry & pledge ${formatCents(amountCents ?? 0)}`}<ArrowRight className="size-4" /></Button></div>
          </form>
          <DialogPrimitive.Close asChild><button type="button" disabled={submitting} aria-label="Close" className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-warm-gray transition hover:bg-white/10 hover:text-warm-cream disabled:opacity-50"><X className="size-5" /></button></DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </Card>;
}

function ContestantCard({ authFetch, chili }: { authFetch: AuthFetch; chili: ChiliModel | null }) {
  if (!chili) return <Card featured><Badge tone="red">Entry missing</Badge><h2 className="mt-4 text-2xl font-black">Submit your chili details</h2><p className="mt-2 text-warm-gray">Your contestant RSVP is ready, but your draft entry still needs its public details.</p><Button className="mt-5 w-full sm:w-auto" onClick={() => window.location.assign("/chili/edit")}>Start chili entry <ArrowRight className="size-4" /></Button></Card>;
  return <Card featured className="overflow-hidden p-0 sm:p-0"><div className="grid sm:grid-cols-[12rem_1fr]"><ChiliImage authFetch={authFetch} chili={chili} className="h-48 w-full sm:h-full" /><div className="p-6 sm:p-8"><div className="flex flex-wrap gap-2"><Badge tone={chili.complete ? "amber" : "red"}>{chili.complete ? chili.status : "Incomplete draft"}</Badge>{chili.status === "inactive" ? <Badge tone="red">Inactive</Badge> : null}</div><h2 className="mt-4 text-3xl font-black">{chili.name?.trim() || "Your untitled chili"}</h2>{chili.spiceLevel !== null ? <p className="mt-2 font-bold text-amber-bright">Heat level {chili.spiceLevel} of 5</p> : null}<p className="mt-3 line-clamp-3 text-warm-gray">{chili.description?.trim() || "Add a title, description, and heat level to complete your entry."}</p>{chili.status === "draft" ? <p className="mt-3 rounded-xl border border-amber/20 bg-amber/10 p-3 text-sm leading-6 text-warm-gray"><strong className="text-warm-cream">Why it’s a draft:</strong> Your chili has not arrived at the event yet. When you check in, an organizer will confirm the pot is there and activate your entry for voting.</p> : null}{chili.tags.length ? <div className="mt-4 flex flex-wrap gap-2">{chili.tags.map((tag) => <Badge key={tag.id}>{tag.name}</Badge>)}</div> : null}<Button className="mt-6 w-full sm:w-auto" onClick={() => window.location.assign("/chili/edit")}><Pencil className="size-4" /> {chili.complete ? "Edit chili" : "Finish chili entry"}</Button></div></div></Card>;
}

function AccountDetailsControls({ authFetch, dashboard, onSaved }: { authFetch: AuthFetch; dashboard: Dashboard; onSaved: () => Promise<void> }) {
  const [partySize, setPartySize] = useState(dashboard.attendee.partySize);
  const [pledgeAmount, setPledgeAmount] = useState(centsToInput(dashboard.pledges.totalCents));
  const [saving, setSaving] = useState<"party" | "pledge" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const pledgeCents = parseCurrencyToCents(pledgeAmount);

  async function savePartySize() {
    setSaving("party"); setNotice(null); setControlError(null);
    try {
      const response = await authFetch("/api/registration/party-size", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ partySize }) });
      const body = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Your party size could not be updated.");
      setNotice(`Your party size is now ${partySize}. Your base vote allocation was updated too.`);
      await onSaved();
    } catch (caught) { setControlError(caught instanceof Error ? caught.message : "Your party size could not be updated."); }
    finally { setSaving(null); }
  }

  async function savePledge() {
    if (pledgeCents === null) return;
    setSaving("pledge"); setNotice(null); setControlError(null);
    try {
      const response = await authFetch("/api/pledges/total", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ totalPledgedCents: pledgeCents }) });
      const body = await response.json() as { error?: { message: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Your pledge could not be updated.");
      setNotice(`Your total pledge is now ${formatCents(pledgeCents)}.`);
      await onSaved();
    } catch (caught) { setControlError(caught instanceof Error ? caught.message : "Your pledge could not be updated."); }
    finally { setSaving(null); }
  }

  return <Card><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-warm-gray">RSVP details</p><h2 className="text-2xl font-black">Need to make a change?</h2></div>{dashboard.attendee.checkedIn ? <Badge tone="neutral"><LockKeyhole className="mr-1 size-3" /> Party locked</Badge> : null}</div><div className="mt-6 grid gap-5 md:grid-cols-2"><div className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4"><label className="font-black" htmlFor="dashboard-party-size">Party size</label><p className="mt-1 text-sm leading-6 text-warm-gray">{dashboard.attendee.checkedIn ? "Locked because your party has already checked in." : "Editable until your party checks in. Your base vote allocation changes with it."}</p><div className="mt-4 flex gap-3"><Input id="dashboard-party-size" type="number" min={dashboard.event.minPartySize} max={dashboard.event.maxPartySize} value={partySize} disabled={dashboard.attendee.checkedIn} onChange={(event) => setPartySize(Number(event.target.value))} /><Button disabled={dashboard.attendee.checkedIn || saving !== null || partySize === dashboard.attendee.partySize || partySize < dashboard.event.minPartySize || partySize > dashboard.event.maxPartySize} onClick={() => void savePartySize()}>{saving === "party" ? "Saving…" : "Update"}</Button></div></div><div className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4"><label className="font-black" htmlFor="dashboard-pledge">Total pledge</label><p className="mt-1 text-sm leading-6 text-warm-gray">You can update this anytime. This changes your stated total; it does not process a payment.</p><div className="mt-4 flex gap-3"><span className="relative flex-1"><span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-amber">$</span><Input id="dashboard-pledge" inputMode="decimal" value={pledgeAmount} onChange={(event) => setPledgeAmount(event.target.value)} className="pl-8" /></span><Button disabled={saving !== null || pledgeCents === null || pledgeCents === dashboard.pledges.totalCents} onClick={() => void savePledge()}>{saving === "pledge" ? "Saving…" : "Update"}</Button></div>{pledgeCents === null ? <p className="mt-2 text-sm font-bold text-red-light">Enter a valid dollar amount.</p> : null}</div></div>{notice ? <p role="status" className="mt-4 rounded-xl border border-amber/20 bg-amber/10 p-3 text-sm font-bold">{notice}</p> : null}{controlError ? <div className="mt-4"><ErrorState title="That change didn’t save" message={controlError} /></div> : null}</Card>;
}

export function ChiliEditorView({ authFetch }: { authFetch: AuthFetch }) {
  const [chili, setChili] = useState<ChiliModel | null | undefined>(undefined);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spiceLevel, setSpiceLevel] = useState(0);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existingImage = usePrivateImage(authFetch, chili?.imageUrl ?? null);
  const localPreview = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [chiliResponse, tagResponse] = await Promise.all([authFetch("/api/chilis/mine", { cache: "no-store" }), authFetch("/api/tags", { cache: "no-store" })]);
      const chiliBody = await chiliResponse.json() as { data?: ChiliModel | null; error?: { message: string } };
      const tagBody = await tagResponse.json() as { data?: Tag[]; error?: { message: string } };
      if (!chiliResponse.ok || chiliBody.data === undefined) throw new Error(chiliBody.error?.message ?? "We could not load your chili entry.");
      if (!tagResponse.ok || !tagBody.data) throw new Error(tagBody.error?.message ?? "We could not load the available tags.");
      setChili(chiliBody.data); setAvailableTags(tagBody.data);
      setName(chiliBody.data?.name ?? ""); setDescription(chiliBody.data?.description ?? ""); setSpiceLevel(chiliBody.data?.spiceLevel ?? 0); setTagIds(chiliBody.data?.tags.map((tag) => tag.id) ?? []);
      dirtyRef.current = false; setDirty(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not load your chili entry."); }
  }, [authFetch]);
  // Chili and tag data are external server resources.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function change<T>(setter: (value: T) => void, value: T) { setter(value); dirtyRef.current = true; setDirty(true); }
  function cancel() {
    if (dirty && !window.confirm("Leave without saving your chili changes?")) return;
    dirtyRef.current = false;
    setDirty(false);
    window.location.assign("/dashboard");
  }
  function chooseFile(selected: File | null) {
    if (!selected) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) { setError("Choose a JPEG, PNG, or WebP image."); return; }
    if (selected.size > 5 * 1024 * 1024) { setError("Choose an image no larger than 5 MiB."); return; }
    setError(null); setFile(selected); setRemoveImage(false); dirtyRef.current = true; setDirty(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim() || !description.trim()) { setError("Add both a title and description before saving."); return; }
    setSaving(true); setError(null);
    try {
      const response = await authFetch(chili ? `/api/chilis/${chili.id}` : "/api/chilis", { method: chili ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description, spiceLevel, tagIds }) });
      const body = await response.json() as { data?: ChiliModel; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Your chili details could not be saved.");
      const saved = body.data;
      if (file) {
        const form = new FormData(); form.set("image", file);
        const imageResponse = await authFetch(`/api/chilis/${saved.id}/image`, { method: "POST", body: form });
        const imageBody = await imageResponse.json() as { error?: { message: string } };
        if (!imageResponse.ok) throw new Error(`Your details were saved, but the image was not: ${imageBody.error?.message ?? "Please try the image again."}`);
      } else if (removeImage && saved.imageUrl) {
        const imageResponse = await authFetch(`/api/chilis/${saved.id}/image`, { method: "DELETE" });
        const imageBody = await imageResponse.json() as { error?: { message: string } };
        if (!imageResponse.ok) throw new Error(`Your details were saved, but the image could not be removed: ${imageBody.error?.message ?? "Please try again."}`);
      }
      dirtyRef.current = false; setDirty(false); window.location.assign("/dashboard");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your chili could not be saved."); setSaving(false); }
  }

  if (chili === undefined && !error) return <Card><LoadingState label="Opening your chili notebook…" /></Card>;
  if (chili === undefined) return <ErrorState message={error ?? "We could not load your chili entry."} action={<Button onClick={() => void load()}>Try again</Button>} />;
  const imageSource = localPreview ?? (!removeImage ? existingImage : null);

  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-3xl"><Card featured><Badge tone="amber">Contestant entry</Badge><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">{chili ? "Edit your chili." : "Submit your chili."}</h1><p className="mt-3 max-w-2xl leading-7 text-warm-gray">Give tasters enough detail to find their new favorite pot.</p>{!chili || chili.status === "draft" ? <div className="mt-5 flex gap-3 rounded-[var(--radius-control)] border border-amber/25 bg-amber/10 p-4"><LockKeyhole className="mt-0.5 size-5 shrink-0 text-amber" /><p className="text-sm leading-6 text-warm-gray"><strong className="text-warm-cream">Your entry stays a draft until event check-in.</strong> When you arrive with your chili, an organizer will confirm the pot is there and activate it for voting. You can keep editing the details in the meantime.</p></div> : null}
    <form onSubmit={submit} className="mt-8 grid gap-7">
      <fieldset><legend className="font-black">Chili image <span className="font-normal text-warm-gray">(optional)</span></legend><div className="mt-3 grid gap-4 sm:grid-cols-[10rem_1fr] sm:items-center">{imageSource ? <>{/* Private or local object URL; Next Image cannot authenticate it. */}<img src={imageSource} alt="Current chili preview" className="h-40 w-full rounded-[var(--radius-control)] object-cover" /></> : <div className="grid h-40 place-items-center rounded-[var(--radius-control)] border border-dashed border-white/15 bg-black/15 text-amber"><Flame className="size-10" /></div>}<div className="grid gap-3"><label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white/10 bg-white/5 px-5 py-3 text-sm font-black hover:bg-white/10"><ImagePlus className="size-4" />{imageSource ? "Replace image" : "Add image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>{imageSource ? <Button type="button" variant="secondary" onClick={() => { setFile(null); setRemoveImage(true); dirtyRef.current = true; setDirty(true); }}><Trash2 className="size-4" />Remove image</Button> : null}<p className="text-xs leading-5 text-warm-gray">JPEG, PNG, or WebP. Maximum 5 MiB.</p></div></div></fieldset>
      <label className="font-black" htmlFor="chili-name">Title<Input id="chili-name" className="mt-2" maxLength={100} required value={name} onChange={(event) => change(setName, event.target.value)} placeholder="Sunday Best Chili" /></label>
      <label className="font-black" htmlFor="heat-level">Heat level<select id="heat-level" className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[rgb(38_33_29_/_88%)] px-4 py-3 text-warm-cream focus:border-amber focus:outline-none" value={spiceLevel} onChange={(event) => change(setSpiceLevel, Number(event.target.value))}>{[0,1,2,3,4,5].map((level) => <option key={level} value={level}>{level} of 5{level === 0 ? " · Mild" : level === 5 ? " · Scorching" : ""}</option>)}</select></label>
      <label className="font-black" htmlFor="chili-description">Description<textarea id="chili-description" className="mt-2 min-h-36 w-full rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[rgb(38_33_29_/_88%)] px-4 py-3 text-warm-cream placeholder:text-[var(--color-muted)] focus:border-amber focus:outline-none" maxLength={2000} required value={description} onChange={(event) => change(setDescription, event.target.value)} placeholder="Tell everyone what makes this pot special…" /></label>
      <fieldset><legend className="font-black">Tags <span className="font-normal text-warm-gray">(optional)</span></legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{availableTags.map((tag) => <div key={tag.id} className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 px-4 py-2"><Checkbox checked={tagIds.includes(tag.id)} onCheckedChange={(checked) => change(setTagIds, checked ? [...tagIds, tag.id] : tagIds.filter((id) => id !== tag.id))} label={tag.name} />{tag.description ? <p className="ml-9 text-xs text-warm-gray">{tag.description}</p> : null}</div>)}</div></fieldset>
      {error ? <ErrorState title="Your entry needs attention" message={error} /> : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={cancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving your chili…" : "Save chili"}<CheckCircle2 className="size-4" /></Button></div>
    </form></Card></motion.div>;
}
