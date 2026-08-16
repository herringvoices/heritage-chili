import { AppEntry } from "@/components/app-entry";

export const dynamic = "force-dynamic";

export default function AdminResultsPage() {
  return <AppEntry requestedGate="admin" adminView="results" />;
}
