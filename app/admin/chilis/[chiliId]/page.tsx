import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default async function AdminChiliPage({ params }: { params: Promise<{ chiliId: string }> }) { const { chiliId } = await params; return <AppEntry requestedGate="admin" adminView="chili-details" chiliId={Number(chiliId)} />; }
