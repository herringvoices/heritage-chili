"use client";

import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Flame, Heart, Minus, Plus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { centsToInput, formatCents, parseCurrencyToCents } from "@/lib/currency";
import { Badge, Button, Card, Checkbox, ErrorState, Input, LoadingState } from "./ui";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;
type RegistrationState = {
  registrationState: "status4" | "registered";
  partySize: number | null;
  role: "guest" | "contestant" | "admin" | null;
  entersChili: boolean;
  hasInitialPledge: boolean;
  suggestedPledgeCents: number | null;
  settings: { minPartySize: number; maxPartySize: number; suggestedAdmissionCents: number; suggestedChiliEntryCents: number };
};
export type PledgeResult = { pledgedCents: number; totalPledgedCents: number; gofundmeUrl: string | null; nextRoute: "/thank-you"; requestedVoteCount?: number; issuedVoteCount?: number; availableVoteCount?: number; purpose?: "chili_entry"; continueRoute?: "/chili/edit"; continueLabel?: string };

function operationKey(name: string) {
  const storageKey = `chili-cookoff:${name}:idempotency-key`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(storageKey, created);
  return created;
}

function useRegistrationState(authFetch: AuthFetch) {
  const [state, setState] = useState<RegistrationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const response = await authFetch("/api/registration", { cache: "no-store" });
      const body = await response.json() as { data?: RegistrationState; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "We could not load registration.");
      setState(body.data);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not load registration."); }
  }, [authFetch]);
  // Registration is an external server resource; load it when the authenticated fetcher is ready.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  return { state, error, reload: load };
}

export function RegistrationView({ authFetch }: { authFetch: AuthFetch }) {
  const { state, error, reload } = useRegistrationState(authFetch);
  const [partySize, setPartySize] = useState<number | null>(null);
  const [entersChili, setEntersChili] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const effectivePartySize = state ? partySize ?? state.partySize ?? state.settings.minPartySize : partySize ?? 1;
  const effectiveEntersChili = entersChili ?? state?.entersChili ?? false;
  const suggestion = useMemo(() => state
    ? effectivePartySize * state.settings.suggestedAdmissionCents + (effectiveEntersChili ? state.settings.suggestedChiliEntryCents : 0)
    : 0, [effectivePartySize, effectiveEntersChili, state]);
  const valid = Boolean(state && Number.isInteger(effectivePartySize) && effectivePartySize >= state.settings.minPartySize && effectivePartySize <= state.settings.maxPartySize);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const response = await authFetch("/api/registration", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": operationKey("registration") },
        body: JSON.stringify({ partySize: effectivePartySize, entersChili: effectiveEntersChili }),
      });
      const body = await response.json() as { data?: { suggestedPledgeCents: number; nextRoute: string }; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Registration could not be completed.");
      sessionStorage.removeItem("chili-cookoff:registration:idempotency-key");
      sessionStorage.setItem("chili-cookoff:initial-suggestion", String(body.data.suggestedPledgeCents));
      window.location.assign(body.data.nextRoute);
    } catch (caught) { setSubmitError(caught instanceof Error ? caught.message : "Registration could not be completed."); setSubmitting(false); }
  }

  if (error) return <ErrorState message={error} action={<Button onClick={() => void reload()}>Try again</Button>} />;
  if (!state || state.hasInitialPledge) return <Card><LoadingState label="Setting the RSVP table…" /></Card>;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 lg:grid-cols-[1.12fr_.88fr] lg:items-start">
      <Card featured>
        <Badge tone="amber">Step 1 of 2 · RSVP</Badge>
        <Users className="mt-6 size-9 text-amber" aria-hidden="true" />
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">Who’s coming to the cookoff?</h1>
        <p className="mt-3 max-w-xl leading-7 text-warm-gray">Register your whole party together. Each person gets one vote once your party checks in.</p>
        <form onSubmit={submit} className="mt-8 grid gap-7">
          <fieldset>
            <legend className="w-full text-center text-base font-black">How many people are in your party?</legend>
            <p id="party-help" className="mx-auto mt-2 max-w-sm text-center text-sm leading-6 text-warm-gray">Include yourself. Everyone in your party gets one vote after check-in.</p>
            <div className="mx-auto mt-5 grid max-w-md grid-cols-[5rem_1fr_5rem] items-center gap-3 sm:grid-cols-[6rem_1fr_6rem] sm:gap-5">
              <Button
                type="button"
                variant="secondary"
                aria-label="Remove one person"
                className="size-20 rounded-full p-0 sm:size-24"
                disabled={effectivePartySize <= state.settings.minPartySize}
                onClick={() => setPartySize(Math.max(state.settings.minPartySize, effectivePartySize - 1))}
              >
                <Minus className="size-8 sm:size-10" strokeWidth={3} aria-hidden="true" />
              </Button>
              <output
                aria-describedby="party-help"
                aria-live="polite"
                aria-label={`${effectivePartySize} ${effectivePartySize === 1 ? "person" : "people"} in your party`}
                className="text-center text-6xl font-black tabular-nums text-amber-bright drop-shadow-[0_0_22px_rgb(245_158_11_/_25%)] sm:text-7xl"
              >
                {effectivePartySize}
              </output>
              <Button
                type="button"
                aria-label="Add one person"
                className="size-20 rounded-full p-0 sm:size-24"
                disabled={effectivePartySize >= state.settings.maxPartySize}
                onClick={() => setPartySize(Math.min(state.settings.maxPartySize, effectivePartySize + 1))}
              >
                <Plus className="size-8 sm:size-10" strokeWidth={3} aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-4 text-center text-xs font-bold uppercase tracking-[0.12em] text-warm-gray">{state.settings.minPartySize}–{state.settings.maxPartySize} people</p>
          </fieldset>
          <div className={`rounded-[var(--radius-control)] border p-4 transition-[background-color,border-color,box-shadow] sm:p-5 ${effectiveEntersChili ? "border-amber/30 bg-amber/10 shadow-[var(--glow-soft)]" : "border-white/10 bg-black/15"}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-autumn-red/15 text-red-light"><Flame className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <Checkbox checked={effectiveEntersChili} onCheckedChange={setEntersChili} label="I’m entering a chili" />
                <p className="mt-1 text-sm leading-6 text-warm-gray">We’ll create a draft entry you can name, describe, and add a photo to later.</p>
              </div>
            </div>
          </div>
          {submitError ? <ErrorState title="Registration didn’t save" message={submitError} /> : null}
          <Button type="submit" disabled={!valid || submitting} className="w-full sm:w-auto sm:justify-self-start">{submitting ? "Saving your RSVP…" : "Continue to pledge"}<ArrowRight className="size-4" /></Button>
        </form>
      </Card>
      <Card className="lg:sticky lg:top-6">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-amber/12 text-amber"><Heart className="size-5" /></span><div><p className="text-sm font-bold text-warm-gray">Suggested pledge</p><p aria-live="polite" className="text-3xl font-black text-amber-bright">{formatCents(suggestion)}</p></div></div>
        <div className="mt-6 grid gap-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="flex items-center gap-2 text-warm-gray"><Users className="size-4" />{effectivePartySize} {effectivePartySize === 1 ? "person" : "people"}</span><strong>{formatCents(effectivePartySize * state.settings.suggestedAdmissionCents)}</strong></div>
          {effectiveEntersChili ? <div className="flex justify-between gap-4 border-b border-white/10 pb-3"><span className="flex items-center gap-2 text-warm-gray"><Flame className="size-4" />Chili entry</span><strong>{formatCents(state.settings.suggestedChiliEntryCents)}</strong></div> : null}
        </div>
        <p className="mt-5 text-sm leading-6 text-warm-gray">This is only a suggestion. You can adjust it on the next screen before anything is recorded.</p>
      </Card>
    </motion.div>
  );
}

export function PledgeView({ authFetch }: { authFetch: AuthFetch }) {
  const { state, error, reload } = useRegistrationState(authFetch);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (state.hasInitialPledge) { window.location.replace("/dashboard"); return; }
    const stored = Number(sessionStorage.getItem("chili-cookoff:initial-suggestion"));
    // The suggestion is intentionally restored from this tab's onboarding session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmount(centsToInput(Number.isFinite(stored) && stored >= 0 ? stored : state.suggestedPledgeCents ?? 0));
  }, [state]);
  const cents = parseCurrencyToCents(amount);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (cents === null || submitting) return;
    setSubmitting(true); setSubmitError(null);
    try {
      const response = await authFetch("/api/pledges/initial", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": operationKey("initial-pledge") },
        body: JSON.stringify({ amountCents: cents }),
      });
      const body = await response.json() as { data?: PledgeResult; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Your pledge could not be recorded.");
      sessionStorage.setItem("chili-cookoff:last-pledge", JSON.stringify(body.data));
      sessionStorage.removeItem("chili-cookoff:initial-suggestion");
      window.location.assign(body.data.nextRoute);
    } catch (caught) { setSubmitError(caught instanceof Error ? caught.message : "Your pledge could not be recorded."); setSubmitting(false); }
  }

  if (error) return <ErrorState message={error} action={<Button onClick={() => void reload()}>Try again</Button>} />;
  if (!state || !amount) return <Card><LoadingState label="Preparing your pledge…" /></Card>;
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl"><Card featured><Badge tone="amber">Step 2 of 2 · Pledge</Badge><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Choose what you’d like to pledge.</h1><p className="mt-4 leading-7 text-warm-gray">We filled in the suggested amount from your RSVP. Adjust it up, down, or enter zero if you don’t want to pledge. This records a pledge only; no payment happens in the app.</p><form onSubmit={submit} className="mt-8 grid gap-6"><label className="font-black" htmlFor="pledge-amount">Pledge amount<span className="relative mt-2 block"><span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-amber">$</span><Input id="pledge-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="pl-9 text-xl font-black" aria-describedby="pledge-help" /></span></label><p id="pledge-help" className="-mt-4 text-sm text-warm-gray">Use dollars and up to two decimal places. Enter 0 to RSVP without a pledge.</p>{cents === null ? <p role="alert" className="text-sm font-bold text-[#f3a59e]">Enter a valid amount, such as 25, 25.00, or 0.</p> : null}{submitError ? <ErrorState title="RSVP not completed" message={submitError} /> : null}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={() => window.location.assign("/register")}><ArrowLeft className="size-4" />Back to RSVP details</Button><Button type="submit" disabled={cents === null || submitting}>{submitting ? "Completing your RSVP…" : cents === 0 ? "Complete RSVP with $0 pledge" : `Complete RSVP & pledge ${formatCents(cents ?? 0)}`}<ArrowRight className="size-4" /></Button></div></form></Card></motion.div>;
}

export function ThankYouView() {
  const [result, setResult] = useState<PledgeResult | null | undefined>(undefined);
  const [popupBlocked, setPopupBlocked] = useState(false);
  useEffect(() => {
    const stored = sessionStorage.getItem("chili-cookoff:last-pledge");
    // Confirmation details are scoped to the current browser tab.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setResult(stored ? JSON.parse(stored) as PledgeResult : null); } catch { setResult(null); }
  }, []);
  if (result === undefined) return <Card><LoadingState label="Finishing your RSVP…" /></Card>;
  if (!result) return <ErrorState title="Your pledge is safe" message="This confirmation is no longer available in this tab, but your recorded pledge has not changed." action={<Button onClick={() => window.location.assign("/dashboard")}>Go to dashboard</Button>} />;

  function openGoFundMe() {
    if (!result?.gofundmeUrl) return;
    const opened = window.open(result.gofundmeUrl, "_blank", "noopener,noreferrer");
    if (!opened) { setPopupBlocked(true); return; }
    window.location.assign(result.continueRoute ?? "/dashboard");
  }

  const isChiliEntry = result.purpose === "chili_entry";
  return <motion.div initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-2xl"><Card featured className="text-center"><span className="mx-auto grid size-16 place-items-center rounded-full bg-amber/15 text-amber shadow-[var(--glow-soft)]"><Check className="size-8" strokeWidth={3} /></span><Badge tone="amber"><span className="sr-only">Success: </span>{isChiliEntry ? "Chili entry added" : result.requestedVoteCount ? "Votes added" : "Pledge recorded"}</Badge><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">{isChiliEntry ? "Your pot has a place at the table." : result.requestedVoteCount ? "More votes. More delicious power." : "Thank you for showing up big."}</h1>{result.requestedVoteCount ? <p className="mx-auto mt-4 max-w-xl leading-7 text-warm-gray"><strong className="text-warm-cream">{result.requestedVoteCount} additional {result.requestedVoteCount === 1 ? "vote is" : "votes are"} ready.</strong> You now have {result.availableVoteCount} available.</p> : null}{isChiliEntry ? <p className="mx-auto mt-4 max-w-xl leading-7 text-warm-gray">Your guest RSVP is now an entrant RSVP, and your chili draft is ready for its details.</p> : null}<p className="mx-auto mt-4 max-w-xl leading-7 text-warm-gray">You pledged <strong className="text-warm-cream">{formatCents(result.pledgedCents)}</strong>, bringing your total to <strong className="text-warm-cream">{formatCents(result.totalPledgedCents)}</strong>.</p><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-warm-gray">Donate now or wait until the end of the cookoff.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{result.gofundmeUrl ? <Button onClick={openGoFundMe}>Donate on GoFundMe <ExternalLink className="size-4" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></Button> : <div className="rounded-[var(--radius-control)] border border-white/10 bg-black/15 p-4 text-left text-sm text-warm-gray">The GoFundMe link has not been added yet. Your pledge is recorded, and you can contribute later.</div>}<Button variant="secondary" onClick={() => window.location.assign(result.continueRoute ?? "/dashboard")}>{result.continueLabel ?? "Maybe Later"} <ArrowRight className="size-4" /></Button></div>{popupBlocked && result.gofundmeUrl ? <div role="alert" className="mt-5 rounded-[var(--radius-control)] border border-amber/25 bg-amber/10 p-4 text-left text-sm"><p className="font-black">Your browser blocked the new tab.</p><a className="mt-2 inline-flex min-h-11 items-center font-black text-amber-bright underline" href={result.gofundmeUrl} rel="noopener noreferrer">Continue to GoFundMe in this tab</a></div> : null}</Card></motion.div>;
}

export function DashboardStub({ displayName, disabled, disabledReason }: { displayName: string | null; disabled: boolean; disabledReason: string | null }) {
  return <Card featured><Badge tone={disabled ? "red" : "amber"}>{disabled ? "Participation paused" : "RSVP complete"}</Badge><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">Welcome back{displayName ? `, ${displayName}` : ""}.</h1><p className="mt-4 max-w-2xl leading-7 text-warm-gray">{disabled ? disabledReason ?? "An organizer has paused participation for this account." : "You’re registered and your pledge flow is ready. Your full event dashboard arrives in the next slice."}</p></Card>;
}
