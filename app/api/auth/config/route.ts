import { dataResponse } from "@/server/http";
import { ensureRehearsalAccounts } from "@/server/auth/rehearsal-accounts";
import { getRuntimeEnv } from "@/server/runtime-env";

export async function GET() {
  const settings = getRuntimeEnv();
  try {
    const provisioned = await ensureRehearsalAccounts();
    if (provisioned.length) console.info(`Prepared rehearsal sign-in accounts: ${provisioned.join(", ")}`);
  } catch (error) {
    console.error("Could not prepare the rehearsal sign-in accounts.", error);
  }
  return dataResponse({ publishableKey: settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? null });
}
