import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;

export const DEFAULT_DB_PATH = path.join(process.cwd(), "phoenix93.db");
const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/**
 * One connection per database file, reused.
 *
 * Next.js calls this on every request and hot-reloads modules in dev; opening a
 * fresh handle each time leaks file descriptors. In-memory databases are never
 * cached — each test wants its own.
 */
const connections = new Map<string, Db>();

/**
 * True on a serverless host, where the filesystem is read-only.
 *
 * The deployment is a READER. Results are ingested by the GitHub Actions
 * workflow, which commits the updated database back to the repository; that
 * push redeploys the site. Opening the file read-write there would fail at
 * boot — as would running migrations, or switching the journal to WAL, both of
 * which write to disk.
 */
export const READ_ONLY = process.env.VERCEL === "1" || process.env.PHOENIX_READ_ONLY === "1";

/**
 * Opens a database and brings it up to schema.
 * Pass ":memory:" for tests — they then run against a real SQLite engine
 * with no file, no container and no network.
 */
export function createDb(file: string = DEFAULT_DB_PATH): Db {
  if (file !== ":memory:") {
    const existing = connections.get(file);
    if (existing) return existing;
  }

  const readonly = READ_ONLY && file !== ":memory:";
  const sqlite = new Database(file, readonly ? { readonly: true, fileMustExist: true } : undefined);

  if (!readonly) {
    sqlite.pragma("journal_mode = WAL");
    // Concurrent readers (the web request, a sync pass, a test worker) must
    // wait for a writer rather than failing outright.
    sqlite.pragma("busy_timeout = 5000");
  }
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  // Migrations write; the shipped database is already migrated.
  if (!readonly) migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  if (file !== ":memory:") connections.set(file, db);
  return db;
}

export { schema };
