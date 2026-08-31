import { NextResponse } from "next/server";
import { SEASON } from "../../../lib/config";
import { READ_ONLY, createDb } from "../../../lib/db";
import { syncNow } from "../../../lib/ingest/sync";
import { MotoGpClient } from "../../../lib/motogp/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron entry point. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Without a configured secret the route refuses to run rather than exposing an
 * unauthenticated write endpoint.
 */
export async function GET(request: Request) {
  // The deployment is a reader. Ingest happens in GitHub Actions, which can
  // commit the updated database back; a serverless function cannot.
  if (READ_ONLY) {
    return NextResponse.json(
      { error: "read-only deployment — ingest runs in the GitHub Actions 'sync' workflow" },
      { status: 501 }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await syncNow(createDb(), new MotoGpClient(), { year: SEASON });
  return NextResponse.json(report, { status: report.error ? 500 : 200 });
}
