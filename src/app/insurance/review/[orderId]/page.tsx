import { ReviewPage } from "@/components/insurance/review/ReviewPage";

/**
 * /insurance/review/[orderId] — confirm-and-pay for one Signa order.
 * Server shell awaits the orderId param (Next.js 15+ Promise-based
 * params), then hands off to the client component for wallet + mint
 * flow.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <ReviewPage orderId={orderId} />;
}
