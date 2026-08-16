import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default function AdminChilisPage() { return <AppEntry requestedGate="admin" adminView="chilis" />; }
