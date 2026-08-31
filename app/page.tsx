import { getDashboard } from "../lib/app/dashboard";
import Dashboard from "./Dashboard";

// The dashboard reads the database on every request, so a completed session is
// live the moment the ingest writes it.
export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard data={getDashboard()} />;
}
