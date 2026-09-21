import { PublicStatusView } from "./public-status-view";

export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicStatusView token={token} />;
}
