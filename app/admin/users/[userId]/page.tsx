import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ userId: string }> }) { return <AppEntry requestedGate="admin" adminView="user-details" userId={Number((await params).userId)} />; }
