import { AppEntry } from "@/components/app-entry";

export const dynamic = "force-dynamic";

export default function ChiliEditEntry() {
  return <AppEntry requestedGate="contestant" />;
}
