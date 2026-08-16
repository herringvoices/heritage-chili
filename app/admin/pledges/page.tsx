import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default function Page() { return <AppEntry requestedGate="admin" adminView="pledges" />; }
