import { InsuranceList } from "@/components/insurance/InsuranceList";

/**
 * /insurance — insurable Signa orders for the connected wallet.
 * Server-rendered shell; the actual list (with wagmi gate + filter /
 * sort state) is the client component below.
 */
export default function InsurancePage() {
  return <InsuranceList />;
}
