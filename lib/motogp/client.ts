/**
 * Client for motogp.com's public results API (api.motogp.pulselive.com) —
 * the same JSON the official site renders from. Structured, so no HTML parsing.
 */

const BASE = "https://api.motogp.pulselive.com/motogp/v1/results";
const USER_AGENT = "Mozilla/5.0 (compatible; Phoenix93/1.0)";

export const MOTOGP_CATEGORY_NAME = "MotoGP™";

export interface ApiSeason {
  id: string;
  year: number;
  current: boolean;
}

export interface ApiCategory {
  id: string;
  name: string;
  legacy_id: number;
}

export interface ApiEvent {
  id: string;
  name: string;
  short_name: string;
  sponsored_name: string | null;
  date_start: string;
  date_end: string;
  status: string;
  test: boolean;
  circuit: { id: string; name: string; place: string | null; nation: string | null };
  country: { iso: string; name: string };
}

export interface ApiSession {
  id: string;
  type: string;
  number: number | null;
  date: string;
  status: string;
  condition?: { track?: string | null } | null;
}

export interface ApiClassificationEntry {
  id: string;
  position: number | null;
  points: number | null;
  status: string;
  rider: { id: string; full_name: string; number: number | null; country: { iso: string } };
  team?: { name: string } | null;
  constructor?: { name: string } | null;
}

export interface ApiStandingEntry {
  position: number;
  points: number;
  rider: { id: string; full_name: string; number: number | null; country: { iso: string } };
  team?: { name: string } | null;
}

export class MotoGpApiError extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`MotoGP API ${status} for ${url}`);
    this.name = "MotoGpApiError";
  }
}

export interface FetchLike {
  (input: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
  }>;
}

export class MotoGpClient {
  constructor(private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  private async get<T>(path: string): Promise<T> {
    const url = `${BASE}${path}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) throw new MotoGpApiError(url, res.status);
    return (await res.json()) as T;
  }

  seasons(): Promise<ApiSeason[]> {
    return this.get<ApiSeason[]>("/seasons");
  }

  categories(seasonUuid: string): Promise<ApiCategory[]> {
    return this.get<ApiCategory[]>(`/categories?seasonUuid=${seasonUuid}`);
  }

  events(seasonUuid: string): Promise<ApiEvent[]> {
    return this.get<ApiEvent[]>(`/events?seasonUuid=${seasonUuid}`);
  }

  sessions(eventUuid: string, categoryUuid: string): Promise<ApiSession[]> {
    return this.get<ApiSession[]>(`/sessions?eventUuid=${eventUuid}&categoryUuid=${categoryUuid}`);
  }

  async classification(sessionUuid: string): Promise<ApiClassificationEntry[]> {
    const body = await this.get<{ classification: ApiClassificationEntry[] }>(`/session/${sessionUuid}/classification`);
    return body.classification ?? [];
  }

  async standings(seasonUuid: string, categoryUuid: string): Promise<ApiStandingEntry[]> {
    const body = await this.get<{ classification: ApiStandingEntry[] }>(
      `/standings?seasonUuid=${seasonUuid}&categoryUuid=${categoryUuid}`
    );
    return body.classification ?? [];
  }

  /** The MotoGP class UUID for a season — never hardcode it, it changes per season. */
  async motogpCategoryId(seasonUuid: string): Promise<string> {
    const categories = await this.categories(seasonUuid);
    const motogp = categories.find((c) => c.name.startsWith("MotoGP"));
    if (!motogp) throw new Error(`No MotoGP category for season ${seasonUuid}`);
    return motogp.id;
  }
}

/** Upstream marks a classified finisher INSTND; anything else did not make the flag. */
export function isDnf(status: string): boolean {
  return status !== "INSTND";
}

/** Only the two point-scoring sessions matter to the championship. */
export function isScoringSession(type: string): type is "SPR" | "RAC" {
  return type === "SPR" || type === "RAC";
}

/**
 * Round numbers are derived from date order over non-test events, never taken
 * from upstream `legacy_id` (which does not match the published round number).
 */
export function toRounds(events: ApiEvent[]): (ApiEvent & { round: number })[] {
  return events
    .filter((e) => !e.test)
    .sort((a, b) => a.date_start.localeCompare(b.date_start))
    .map((e, i) => ({ ...e, round: i + 1 }));
}
