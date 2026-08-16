export type Gate = "public" | "status4" | "pledge" | "thankYou" | "registered" | "contestant" | "admin";

export type GuardedUserContext = {
  registrationState: "status4" | "registered";
  role: "guest" | "contestant" | "admin" | null;
  isAdmin: boolean;
  hasInitialPledge: boolean;
  entryRoute: "/register" | "/pledge" | "/dashboard" | "/admin";
};

export function redirectForGate(gate: Gate, context: GuardedUserContext): GuardedUserContext["entryRoute"] | null {
  const allowed =
    (gate === "status4" && !context.isAdmin && (context.registrationState === "status4" || !context.hasInitialPledge)) ||
    (gate === "pledge" && context.registrationState === "registered" && !context.isAdmin && !context.hasInitialPledge) ||
    (gate === "thankYou" && context.registrationState === "registered" && !context.isAdmin && context.hasInitialPledge) ||
    (gate === "registered" && context.registrationState === "registered" && !context.isAdmin && context.hasInitialPledge) ||
    (gate === "contestant" && context.registrationState === "registered" && context.role === "contestant" && context.hasInitialPledge) ||
    (gate === "admin" && context.isAdmin);

  return gate === "public" || !allowed ? context.entryRoute : null;
}
