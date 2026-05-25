import { PolicyDetailPage } from "@/components/policies/detail/PolicyDetailPage";

/**
 * /policies/[policyId] — single-policy detail. Server shell awaits the
 * Promise-based params (Next.js 15+), then hands off to the client
 * component for wagmi gate + simulation-store-driven rendering.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;
  return <PolicyDetailPage policyId={policyId} />;
}
