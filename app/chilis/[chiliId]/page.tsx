import { AppEntry } from "@/components/app-entry";
export const dynamic = "force-dynamic";
export default async function ChiliDetailsPage({ params }: { params: Promise<{ chiliId: string }> }) { const { chiliId } = await params; return <AppEntry requestedGate="registered" attendeeView="chili-details" chiliId={Number(chiliId)} />; }
