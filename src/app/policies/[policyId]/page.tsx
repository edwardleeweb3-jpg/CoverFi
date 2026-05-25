import Link from "next/link";

/**
 * Policy detail placeholder. Real implementation in step 10
 * (certificate + release curve + timeline).
 */
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;
  return (
    <div className="page wrap">
      <div className="crumb">
        <Link href="/policies">My Policies · 我的保单</Link> / {policyId}
      </div>
      <h1 className="pagetitle">
        Policy · 保单 · <span className="mono">{policyId}</span>
      </h1>
      <p className="pagesub" style={{ marginTop: 14 }}>
        Placeholder — the contract + release curve + timeline ship in step 10.
      </p>
    </div>
  );
}
