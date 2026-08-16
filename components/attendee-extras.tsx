"use client";
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/set-state-in-effect -- authenticated API data is synchronized after mount */

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CircleDollarSign, Flame, Medal, Minus, Plus, Trophy, Vote } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { centsToInput, formatCents, parseCurrencyToCents } from "@/lib/currency";
import { AttendeeNav } from "./attendee-nav";
import type { PledgeResult } from "./onboarding-flow";
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState } from "./ui";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;
type AddVotesDashboard = {
  attendee: { partySize: number; participation: { disabled: boolean; reason: string | null } };
  votes: { issued: number; available: number };
  event: { suggestedAdditionalVoteCents: number };
};
type Ranking = { rank: number; chiliId: number; name: string; contestantName: string; imageUrl: string | null; tied: boolean };
type Standings = {
  state: "hidden" | "pre-voting" | "empty" | "partially-ranked" | "live-unofficial" | "finalized";
  rankings: Ranking[];
  hasTies: boolean;
  progress: { totalPledgedCents: number; goalCents: number };
};

async function responseData<T>(response: Response) {
  const body = await response.json() as { data?: T; error?: { message: string } };
  if (!response.ok || body.data === undefined) throw new Error(body.error?.message ?? "The request could not be completed.");
  return body.data;
}

function idempotencyKey() {
  const storageKey = "chili-cookoff:additional-votes:idempotency-key";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

export function AddVotesView({ authFetch }: { authFetch: AuthFetch }) {
  const [dashboard, setDashboard] = useState<AddVotesDashboard | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"quantity" | "pledge">("quantity");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setDashboard(await responseData<AddVotesDashboard>(await authFetch("/api/dashboard", { cache: "no-store" }))); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "We could not load your vote balance."); }
  }, [authFetch]);
  useEffect(() => { void load(); }, [load]);

  const requestedVoteCount = Number(quantity);
  const quantityValid = Number.isSafeInteger(requestedVoteCount) && requestedVoteCount > 0;
  const suggestedCents = quantityValid && dashboard ? requestedVoteCount * dashboard.event.suggestedAdditionalVoteCents : 0;
  const amountCents = parseCurrencyToCents(amount);

  function continueToPledge(event: React.FormEvent) {
    event.preventDefault();
    if (!quantityValid || !dashboard || dashboard.attendee.participation.disabled) return;
    setAmount(centsToInput(suggestedCents));
    setStep("pledge");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!quantityValid || amountCents === null || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const result = await responseData<PledgeResult>(await authFetch("/api/pledges/additional-votes", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey() },
        body: JSON.stringify({ requestedVoteCount, amountCents }),
      }));
      sessionStorage.setItem("chili-cookoff:last-pledge", JSON.stringify(result));
      sessionStorage.removeItem("chili-cookoff:additional-votes:idempotency-key");
      window.location.assign(result.nextRoute);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your votes could not be added."); setSubmitting(false); }
  }

  if (!dashboard && !error) return <><AttendeeNav current="votes" /><Card><LoadingState label="Counting your votes…" /></Card></>;
  if (!dashboard) return <><AttendeeNav current="votes" /><ErrorState message={error ?? "Your vote balance is unavailable."} action={<Button onClick={() => void load()}>Try again</Button>} /></>;
  if (dashboard.attendee.participation.disabled) return <><AttendeeNav current="votes" /><ErrorState title="Additional votes unavailable" message={dashboard.attendee.participation.reason ?? "An organizer has paused participation for this account."} action={<Button onClick={() => window.location.assign("/dashboard")}>Back to dashboard</Button>} /></>;

  return <><AttendeeNav current="votes" /><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl"><Card featured>
    <Badge tone="amber">{step === "quantity" ? "Step 1 of 2 · Votes" : "Step 2 of 2 · Pledge"}</Badge>
    {step === "quantity" ? <>
      <Vote className="mt-6 size-9 text-amber" aria-hidden="true" />
      <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Get more votes.</h1>
      <p className="mt-4 leading-7 text-warm-gray">Choose how many additional votes you want. This will not change your party size of {dashboard.attendee.partySize}.</p>
      <form onSubmit={continueToPledge} className="mt-8 grid gap-6">
        <fieldset>
          <legend className="w-full text-center font-black">Additional votes</legend>
          <div className="mx-auto mt-4 grid max-w-md grid-cols-[5rem_1fr_5rem] items-center gap-3 sm:grid-cols-[6rem_1fr_6rem] sm:gap-5">
            <Button
              type="button"
              variant="secondary"
              className="size-20 rounded-full p-0 sm:size-24"
              aria-label="Remove one additional vote"
              disabled={requestedVoteCount <= 1}
              onClick={() => setQuantity(String(Math.max(1, requestedVoteCount - 1)))}
            >
              <Minus className="size-8 sm:size-10" strokeWidth={3} aria-hidden="true" />
            </Button>
            <output
              className="text-center text-6xl font-black tabular-nums text-amber-bright drop-shadow-[0_0_22px_rgb(245_158_11_/_25%)] sm:text-7xl"
              aria-live="polite"
              aria-label={`${requestedVoteCount} additional ${requestedVoteCount === 1 ? "vote" : "votes"}`}
            >
              {requestedVoteCount}
            </output>
            <Button
              type="button"
              className="size-20 rounded-full p-0 sm:size-24"
              aria-label="Add one additional vote"
              disabled={requestedVoteCount >= 10_000}
              onClick={() => setQuantity(String(Math.min(10_000, requestedVoteCount + 1)))}
            >
              <Plus className="size-8 sm:size-10" strokeWidth={3} aria-hidden="true" />
            </Button>
          </div>
        </fieldset>
        {!quantityValid ? <p role="alert" className="-mt-4 text-sm font-bold text-[#f3a59e]">Enter a positive whole number.</p> : null}
        <div className="rounded-[var(--radius-control)] border border-amber/20 bg-amber/10 p-5"><p className="text-sm font-bold text-warm-gray">Suggested additional pledge</p><p className="mt-1 text-3xl font-black text-amber-bright">{formatCents(suggestedCents)}</p><p className="mt-2 text-sm text-warm-gray">You can change this amount on the next screen.</p></div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={() => window.location.assign("/dashboard")}><ArrowLeft className="size-4" />Cancel</Button><Button type="submit" disabled={!quantityValid}>Continue <ArrowRight className="size-4" /></Button></div>
      </form>
    </> : <>
      <CircleDollarSign className="mt-6 size-9 text-amber" aria-hidden="true" />
      <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Choose your pledge.</h1>
      <p className="mt-4 leading-7 text-warm-gray">You’re adding {requestedVoteCount} {requestedVoteCount === 1 ? "vote" : "votes"}. Adjust the suggested pledge freely. No payment happens in this app.</p>
      <form onSubmit={submit} className="mt-8 grid gap-6">
        <label className="font-black" htmlFor="additional-pledge-amount">Pledge amount<span className="relative mt-2 block"><span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-amber">$</span><Input id="additional-pledge-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="pl-9 text-xl font-black" /></span></label>
        {amountCents === null ? <p role="alert" className="-mt-4 text-sm font-bold text-[#f3a59e]">Enter a valid nonnegative dollar amount.</p> : null}
        {error ? <ErrorState title="Votes not added" message={error} /> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={() => setStep("quantity")} disabled={submitting}><ArrowLeft className="size-4" />Change vote count</Button><Button type="submit" disabled={amountCents === null || submitting}>{submitting ? "Confirming pledge…" : <>Confirm pledge <ArrowRight className="size-4" /></>}</Button></div>
      </form>
    </>}
  </Card></motion.div></>;
}

function usePrivateImage(authFetch: AuthFetch, url: string | null) {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let objectUrl: string | null = null; let cancelled = false;
    authFetch(url).then(async (response) => { if (!response.ok) return; objectUrl = URL.createObjectURL(await response.blob()); if (!cancelled) setSource(objectUrl); }).catch(() => undefined);
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [authFetch, url]);
  return source;
}

function RankedImage({ ranking, authFetch }: { ranking: Ranking; authFetch: AuthFetch }) {
  const source = usePrivateImage(authFetch, ranking.imageUrl);
  return source ? <img src={source} alt={`${ranking.name} chili`} className="h-44 w-full object-cover" /> : <div role="img" aria-label={`No image available for ${ranking.name}`} className="grid h-44 w-full place-items-center bg-gradient-to-br from-amber/20 to-autumn-red/15"><Flame className="size-10 text-amber" /></div>;
}

function PledgeProgress({ progress }: { progress: Standings["progress"] }) {
  const percent = progress.goalCents <= 0 ? (progress.totalPledgedCents > 0 ? 100 : 0) : (progress.totalPledgedCents / progress.goalCents) * 100;
  const fill = Math.max(0, Math.min(100, percent));
  const above = Math.max(0, progress.totalPledgedCents - progress.goalCents);
  return <Card featured><CircleDollarSign className="size-8 text-amber" /><h2 className="mt-4 text-2xl font-black">Fundraiser progress</h2><div className="mt-5 flex flex-wrap items-end justify-between gap-3"><p className="text-3xl font-black">{formatCents(progress.totalPledgedCents)}</p><p className="font-bold text-warm-gray">Goal: {formatCents(progress.goalCents)}</p></div><div className="mt-4 h-4 overflow-hidden rounded-full border border-white/10 bg-black/25" role="progressbar" aria-label="Fundraiser pledge progress" aria-valuetext={`${formatCents(progress.totalPledgedCents)} pledged toward a ${formatCents(progress.goalCents)} goal`} aria-valuemin={0} aria-valuemax={Math.max(progress.goalCents, 1)} aria-valuenow={Math.max(0, Math.min(progress.totalPledgedCents, Math.max(progress.goalCents, 1)))}><div className="h-full rounded-full bg-gradient-to-r from-amber-bright via-amber to-autumn-red transition-[width]" style={{ width: `${fill}%` }} /></div>{above > 0 ? <p className="mt-4 font-black text-amber-bright">Goal crushed by {formatCents(above)}. Look at us go.</p> : <p className="mt-4 text-sm text-warm-gray">Every pledge is a stated commitment; contributions happen separately.</p>}</Card>;
}

export function StandingsView({ authFetch }: { authFetch: AuthFetch }) {
  const [standings, setStandings] = useState<Standings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { try { setStandings(await responseData<Standings>(await authFetch("/api/standings", { cache: "no-store" }))); setError(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "Standings could not be loaded."); } }, [authFetch]);
  useEffect(() => { void load(); }, [load]);
  const emptySlots = useMemo(() => standings ? Math.max(0, 3 - standings.rankings.length) : 0, [standings]);
  if (error) return <><AttendeeNav current="standings" /><ErrorState message={error} action={<Button onClick={() => void load()}>Try again</Button>} /></>;
  if (!standings) return <><AttendeeNav current="standings" /><Card><LoadingState label="Checking the leaderboard…" /></Card></>;

  const messages = {
    hidden: ["Standings are taking a suspense break.", "Organizers have hidden the rankings for now. No peeking under the lid."],
    "pre-voting": ["The podium is waiting.", "Voting has not started, so every spot is still up for grabs."],
    empty: ["No chili has pulled ahead yet.", "The first votes will bring this board to life."],
  } as const;
  const emptyMessage = standings.state in messages ? messages[standings.state as keyof typeof messages] : null;

  return <><AttendeeNav current="standings" /><motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6"><section><Badge tone={standings.state === "finalized" ? "red" : "amber"}><Trophy className="mr-1 size-3" />{standings.state === "finalized" ? "Official results" : "Unofficial standings"}</Badge><h1 className="mt-4 text-4xl font-black sm:text-5xl">Who’s bringing the heat?</h1><p className="mt-3 max-w-2xl text-warm-gray">The top three, minus exact totals. Suspense is an ingredient.</p></section>
    {emptyMessage ? <EmptyState title={emptyMessage[0]} message={emptyMessage[1]} /> : <>
      {standings.hasTies && standings.state !== "finalized" ? <div role="note" className="rounded-[var(--radius-control)] border border-amber/20 bg-amber/10 p-4 text-sm font-bold text-warm-gray">Some entries are tied. Their temporary display order is stable, but it is not an official tie-break.</div> : null}
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{standings.rankings.map((ranking) => <li key={ranking.chiliId} className={ranking.rank === 1 ? "sm:col-span-2 lg:col-span-1" : ""}><Link href={`/chilis/${ranking.chiliId}`} className={`glass-card block h-full overflow-hidden rounded-[var(--radius-card)] transition hover:-translate-y-1 hover:border-amber/35 ${ranking.rank === 1 ? "ring-1 ring-amber/35 shadow-[var(--glow-soft)]" : ""}`}><RankedImage ranking={ranking} authFetch={authFetch} /><div className="p-5"><div className="flex items-center justify-between gap-3"><Badge tone={ranking.rank === 1 ? "amber" : "neutral"}>#{ranking.rank} · {ranking.rank === 1 ? "First" : ranking.rank === 2 ? "Second" : "Third"}</Badge>{ranking.tied ? <Badge>Tied</Badge> : <Medal className="size-5 text-amber" aria-hidden="true" />}</div><h2 className="mt-4 text-2xl font-black">{ranking.name}</h2><p className="mt-1 font-bold text-warm-gray">by {ranking.contestantName}</p></div></Link></li>)}</ol>
      {emptySlots ? <p className="rounded-[var(--radius-control)] border border-dashed border-white/15 p-4 text-center text-sm font-bold text-warm-gray">{emptySlots} {emptySlots === 1 ? "podium spot is" : "podium spots are"} still waiting for a chili with votes.</p> : null}
    </>}
    <PledgeProgress progress={standings.progress} />
  </motion.div></>;
}
