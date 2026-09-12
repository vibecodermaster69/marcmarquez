import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { SEASON } from "../../../lib/config";
import { READ_ONLY, createDb } from "../../../lib/db";
import { syncNow } from "../../../lib/ingest/sync";
import { MotoGpClient } from "../../../lib/motogp/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function matchesPin(candidate: string, expected: string) {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * An operator-only escape hatch for an official result that is already live.
 * Production dispatches GitHub Actions because Vercel cannot persist the SQLite
 * database; local development can run the same forced sync directly.
 */
export async function POST(request: Request) {
  const expectedPin = process.env.MANUAL_SYNC_PIN;
  if (!expectedPin) {
    return NextResponse.json({ error: "Manual sync is not configured" }, { status: 503 });
  }

  let pin = "";
  try {
    ({ pin } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof pin !== "string" || !matchesPin(pin, expectedPin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  if (!READ_ONLY) {
    const report = await syncNow(createDb(), new MotoGpClient(), { year: SEASON, force: true });
    return NextResponse.json({ mode: "local", report }, { status: report.error ? 500 : 200 });
  }

  const token = process.env.MANUAL_SYNC_GITHUB_TOKEN;
  const repository = process.env.MANUAL_SYNC_GITHUB_REPOSITORY;
  if (!token || !repository) {
    return NextResponse.json({ error: "Manual production sync is not configured" }, { status: 503 });
  }

  const dispatch = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ref: "main", inputs: { force: "true" } })
  });

  if (!dispatch.ok) {
    return NextResponse.json({ error: "Could not start the GitHub sync" }, { status: 502 });
  }

  return NextResponse.json({ mode: "workflow" }, { status: 202 });
}
