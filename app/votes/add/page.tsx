import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default function AddVotesPage() { return <AppEntry requestedGate="registered" attendeeView="add-votes" />; }
