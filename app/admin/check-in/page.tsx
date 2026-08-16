import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default function CheckInPage() { return <AppEntry requestedGate="admin" adminView="check-in" />; }
