import { AppEntry } from "@/components/app-entry";

export const dynamic = "force-dynamic";

export default function DashboardEntry() {
  return <AppEntry requestedGate="registered" />;
}
