import { getDashboard } from "../lib/app/dashboard";
import Dashboard from "./Dashboard";

/**
 * Rendered once per deployment, not per request.
 *
 * The data can only change when the database changes, and the database changes
 * only when the GitHub Actions sync commits a new one — which redeploys this
 * site. So there is nothing for a per-request render to discover: it would
 * re-run 170,000 simulations to produce the identical page.
 *
 * Building it once means the deployed page needs no database at runtime at all.
 */
export const dynamic = "force-static";

export default function Home() {
  return <Dashboard data={getDashboard()} />;
}
