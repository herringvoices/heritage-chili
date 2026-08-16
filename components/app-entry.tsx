"use client";

import { ClerkProvider, SignInButton, SignOutButton, SignedIn, SignedOut, useAuth, useUser } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, Flame, LogOut, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminShell, AttendeeShell } from "./shells";
import { redirectForGate, type Gate } from "./route-guard";
import { Badge, Button, Card, ErrorState, InfoDialog, LoadingState } from "./ui";
import { PledgeView, RegistrationView, ThankYouView } from "./onboarding-flow";
import { ChiliEditorView, DashboardView } from "./dashboard-and-chili";
import { AdminOperations, type AdminView } from "./admin-operations";
import { ChiliDetailsView as AttendeeChiliDetailsView, ChiliListView as AttendeeChiliListView } from "./chili-discovery";
import { AddVotesView, StandingsView } from "./attendee-extras";

export type AttendeeView = "dashboard" | "chilis" | "chili-details" | "add-votes" | "standings";

type UserContext = {
  id: number;
  email: string;
  displayName: string | null;
  registrationState: "status4" | "registered";
  role: "guest" | "contestant" | "admin" | null;
  isAdmin: boolean;
  hasInitialPledge: boolean;
  checkedIn: boolean;
  participation: { disabled: boolean; reason: string | null; canMutate: boolean };
  entryRoute: "/register" | "/pledge" | "/dashboard" | "/admin";
};

function AccountMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 max-w-[42vw] items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-black text-warm-cream transition hover:border-amber/30 hover:bg-white/10 sm:max-w-[18rem]"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`size-4 shrink-0 text-warm-gray transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="glass-card absolute right-0 top-[calc(100%+.5rem)] z-50 min-w-44 rounded-[var(--radius-control)] p-2 shadow-2xl">
          <SignOutButton redirectUrl="/">
            <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-black text-warm-cream transition hover:bg-white/10 focus:bg-white/10">
              <LogOut className="size-4 text-amber" aria-hidden="true" />
              Log out
            </button>
          </SignOutButton>
        </div>
      ) : null}
    </div>
  );
}

function PublicWelcome({ signInControl, setupPending = false }: { signInControl: ReactNode; setupPending?: boolean }) {
  return (
    <AttendeeShell>
      <div className="grid items-center gap-8 lg:grid-cols-[1.2fr_.8fr]">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32 }}>
          <Badge tone="amber"><Sparkles className="mr-1 size-3" /> Community fundraiser</Badge>
          <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[.95] tracking-[-.045em] sm:text-7xl">Bring the heat.<br /><span className="bg-gradient-to-r from-warm-cream via-amber-bright to-amber bg-clip-text text-transparent">Do some good.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-warm-gray">Sign in to RSVP, enter your chili, and get ready to vote for the pot worthy of eternal bragging rights.</p>
          <div className="mt-8 flex flex-wrap gap-3">{signInControl}<InfoDialog /></div>
          {setupPending ? <p className="mt-4 text-sm font-bold text-warm-gray">Sign-in is built and waiting for the Clerk environment values.</p> : null}
        </motion.section>
        <Card featured className="relative overflow-hidden">
          <div className="absolute -right-16 -top-16 size-44 rounded-full bg-amber/15 blur-3xl" />
          <Flame className="size-10 text-amber" fill="currentColor" aria-hidden="true" />
          <h2 className="mt-5 text-2xl font-black">One cozy night. One glorious champion.</h2>
          <div className="mt-6 grid gap-3 text-sm font-bold text-warm-gray"><p className="rounded-xl border border-white/10 bg-black/15 p-4">RSVP for your whole party in one place.</p><p className="rounded-xl border border-white/10 bg-black/15 p-4">Pledge directly toward the adoption fundraiser.</p><p className="rounded-xl border border-white/10 bg-black/15 p-4">Check in, taste boldly, and cast your votes.</p></div>
        </Card>
      </div>
    </AttendeeShell>
  );
}

function IdentityGate({ requestedGate, adminView = "overview", attendeeView = "dashboard", chiliId, userId }: { requestedGate: Gate; adminView?: AdminView; attendeeView?: AttendeeView; chiliId?: number; userId?: number }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress;
  const [context, setContext] = useState<UserContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const authFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new Error("Your sign-in session is not ready yet.");
    return fetch(path, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${token}` } });
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      setError(null);
      if (!token) throw new Error("Your sign-in session is not ready yet.");
      const response = await fetch("/api/me", {
        headers: {
          authorization: `Bearer ${token}`,
          ...(primaryEmail ? { "x-clerk-primary-email": primaryEmail } : {}),
        },
        cache: "no-store",
      });
      const body = (await response.json()) as { data?: UserContext; error?: { message: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "We could not load your account.");
      setContext(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not load your account.");
    }
  }, [getToken, primaryEmail]);

  // The Clerk token is an external session value; load once it becomes available.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!context) return;
    const redirectTo = redirectForGate(requestedGate, context);
    if (redirectTo) window.location.replace(redirectTo);
  }, [context, requestedGate]);

  const label = context?.displayName ?? context?.email ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in";
  const signOutControl = <AccountMenu label={label} />;
  const attendeeRole = context?.role === "contestant" ? "contestant" : context?.role === "guest" ? "guest" : undefined;
  if (error) return <AttendeeShell accountLabel={label} accountAction={signOutControl}><ErrorState message={error} action={<Button onClick={() => void load()}>Try again</Button>} /></AttendeeShell>;
  if (!context) return <AttendeeShell accountLabel={label} accountAction={signOutControl}><Card><LoadingState label="Preparing your cookoff account…" /></Card></AttendeeShell>;

  if (requestedGate === "status4") {
    return <AttendeeShell accountLabel={label} accountAction={signOutControl}><RegistrationView authFetch={authFetch} /></AttendeeShell>;
  }

  if (requestedGate === "pledge") return <AttendeeShell accountLabel={label} accountAction={signOutControl} navigationRole={attendeeRole}><PledgeView authFetch={authFetch} /></AttendeeShell>;
  if (requestedGate === "thankYou") return <AttendeeShell accountLabel={label} accountAction={signOutControl} navigationRole={attendeeRole}><ThankYouView /></AttendeeShell>;
  if (requestedGate === "contestant") return <AttendeeShell accountLabel={label} accountAction={signOutControl} navigationRole="contestant">{context.participation.disabled ? <ErrorState title="Participation paused" message={context.participation.reason ?? "An organizer has paused participation for this account. Your existing entry remains safe and visible from the dashboard."} action={<Button onClick={() => window.location.assign("/dashboard")}>Back to dashboard</Button>} /> : <ChiliEditorView authFetch={authFetch} />}</AttendeeShell>;

  if (requestedGate === "admin") {
    return <AdminShell accountLabel={label} accountAction={signOutControl}><AdminOperations authFetch={authFetch} view={adminView} chiliId={chiliId} userId={userId} /></AdminShell>;
  }

  return <AttendeeShell accountLabel={label} accountAction={signOutControl} navigationRole={attendeeRole}>{attendeeView === "chilis" ? <AttendeeChiliListView authFetch={authFetch} /> : attendeeView === "chili-details" && chiliId ? <AttendeeChiliDetailsView authFetch={authFetch} chiliId={chiliId} /> : attendeeView === "add-votes" ? <AddVotesView authFetch={authFetch} /> : attendeeView === "standings" ? <StandingsView authFetch={authFetch} /> : <DashboardView authFetch={authFetch} />}</AttendeeShell>;
}

function ConfiguredApp({ publishableKey, requestedGate, adminView, attendeeView, chiliId, userId }: { publishableKey: string; requestedGate: Gate; adminView?: AdminView; attendeeView?: AttendeeView; chiliId?: number; userId?: number }) {
  return <ClerkProvider publishableKey={publishableKey}><SignedOut><PublicWelcome signInControl={<SignInButton mode="modal"><Button>Sign in to get started <ArrowRight className="size-4" /></Button></SignInButton>} /></SignedOut><SignedIn><IdentityGate requestedGate={requestedGate} adminView={adminView} attendeeView={attendeeView} chiliId={chiliId} userId={userId} /></SignedIn></ClerkProvider>;
}

export function AppEntry({ requestedGate, adminView, attendeeView, chiliId, userId }: { requestedGate: Gate; adminView?: AdminView; attendeeView?: AttendeeView; chiliId?: number; userId?: number }) {
  const [config, setConfig] = useState<{ loading: boolean; key: string | null; error: string | null }>({ loading: true, key: null, error: null });
  useEffect(() => {
    fetch("/api/auth/config", { cache: "no-store" }).then(async (response) => {
      const body = (await response.json()) as { data?: { publishableKey: string | null } };
      setConfig({ loading: false, key: body.data?.publishableKey ?? null, error: response.ok ? null : "The sign-in configuration could not be loaded." });
    }).catch(() => setConfig({ loading: false, key: null, error: "The sign-in configuration could not be loaded." }));
  }, []);

  if (config.loading) return <AttendeeShell><Card><LoadingState /></Card></AttendeeShell>;
  if (!config.key && requestedGate === "public") return <PublicWelcome setupPending signInControl={<Button disabled>Sign in to get started <ArrowRight className="size-4" /></Button>} />;
  if (!config.key) return <AttendeeShell><ErrorState title="Sign-in needs one last ingredient" message={config.error ?? "The Clerk publishable key has not been configured for this site yet."} /></AttendeeShell>;
  return <ConfiguredApp publishableKey={config.key} requestedGate={requestedGate} adminView={adminView} attendeeView={attendeeView} chiliId={chiliId} userId={userId} />;
}
