import Link from "next/link";

/**
 * Review & confirm placeholder for an order. Real implementation in step 8.
 * Next.js 16+ params come as a Promise — we await it server-side.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <div className="page wrap">
      <div className="crumb">
        <Link href="/insurance">Insurance · 投保</Link> / review · 确认
      </div>
      <h1 className="pagetitle">
        Review · 核对确认 · <span className="mono">{orderId}</span>
      </h1>
      <p className="pagesub" style={{ marginTop: 14 }}>
        Placeholder — the real review flow ships in step 8.
      </p>
    </div>
  );
}
