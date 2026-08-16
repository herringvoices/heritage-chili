import { getDb } from "@/db";
import { fetchClerkUserProfile, requireAuthenticatedIdentity, type ClerkUserProfile } from "@/server/auth/clerk";
import { errorResponse, dataResponse } from "@/server/http";
import { IdentityService } from "@/server/services/identity-service";

type MeService = Pick<IdentityService, "syncAuthenticatedUser" | "getCurrentUserContext">;

type MeHandlerDependencies = {
  authenticate: typeof requireAuthenticatedIdentity;
  createIdentityService: () => MeService;
  loadProfile?: (clerkUserId: string) => Promise<ClerkUserProfile | null>;
};

export function createMeHandler(dependencies: MeHandlerDependencies = {
  authenticate: requireAuthenticatedIdentity,
  createIdentityService: () => new IdentityService(getDb()),
}) {
  return async function handleMe(request: Request) {
    try {
      const identity = await dependencies.authenticate(request);
      const profile = identity.email && identity.username
        ? null
        : await (dependencies.loadProfile ?? fetchClerkUserProfile)(identity.clerkUserId);
      const emailHint = request.headers.get("x-clerk-primary-email")?.trim() ?? "";
      const resolvedIdentity = {
        ...identity,
        email: identity.email ?? profile?.email ?? (emailHint.includes("@") ? emailHint : null),
        username: profile?.username ?? identity.username ?? null,
      };
      const service = dependencies.createIdentityService();
      await service.syncAuthenticatedUser(resolvedIdentity);
      return dataResponse(await service.getCurrentUserContext(identity.clerkUserId));
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const GET = createMeHandler();
