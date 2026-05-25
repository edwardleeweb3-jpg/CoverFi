import { PoliciesPage } from "@/components/policies/PoliciesPage";

/**
 * /policies — "My Policies" overview. Server-rendered shell hands off
 * to the client component for wagmi gate + simulation store driven UI.
 */
export default function Page() {
  return <PoliciesPage />;
}
