import { AppEntry } from "@/components/app-entry";

export const dynamic = "force-dynamic";

export default function RegisterEntry() {
  return <AppEntry requestedGate="status4" />;
}
