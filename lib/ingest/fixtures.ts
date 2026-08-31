/**
 * Fixtures mirroring the real shapes returned by api.motogp.pulselive.com,
 * captured from the 2026 Aragon weekend. Kept small but structurally faithful.
 */

export const SEASON_ID = "season-2026";
export const CATEGORY_ID = "cat-motogp";
export const ARAGON_ID = "event-aragon";
export const MISANO_ID = "event-misano";
export const ARAGON_SPR = "ses-ara-spr";
export const ARAGON_RAC = "ses-ara-rac";
export const MISANO_RAC = "ses-rsm-rac";
export const CAT_ID = "event-catalonia";
export const CAT_RAC_ABANDONED = "ses-cat-rac";
export const CAT_RAC_RESTART = "ses-cat-rac2";

const rider = (id: string, name: string, number: number) => ({
  id,
  full_name: name,
  number,
  country: { iso: "ES" }
});

export const MARC = rider("rider-marc", "Marc Marquez", 93);
export const MARTIN = rider("rider-martin", "Jorge Martin", 1);
export const BEZ = rider("rider-bez", "Marco Bezzecchi", 72);
export const ACOSTA = rider("rider-acosta", "Pedro Acosta", 37);
export const BAGNAIA = rider("rider-pecco", "Francesco Bagnaia", 63);

const entry = (id: string, r: typeof MARC, position: number | null, points: number, status = "INSTND") => ({
  id,
  position,
  points,
  status,
  rider: r,
  team: { name: "Test Team" },
  constructor: { name: "Ducati" }
});

/** Real Aragon 2026 sprint result (top 5). */
export const ARAGON_SPRINT_CLASSIFICATION = [
  entry("r1", MARC, 1, 12),
  entry("r2", BEZ, 2, 9),
  entry("r3", ACOSTA, 3, 7),
  entry("r4", MARTIN, 4, 6),
  entry("r5", BAGNAIA, null, 0, "OUTSTND")
];

/** Real Aragon 2026 Grand Prix result (top 5 + a DNF). */
export const ARAGON_RACE_CLASSIFICATION = [
  entry("r6", MARC, 1, 25),
  entry("r7", ACOSTA, 2, 20),
  entry("r8", BEZ, 3, 16),
  entry("r9", MARTIN, 5, 11),
  entry("r10", BAGNAIA, null, 0, "OUTSTND")
];

export const STANDINGS = [
  { position: 1, points: 256, rider: MARTIN, team: { name: "Aprilia Racing" } },
  { position: 2, points: 237, rider: MARC, team: { name: "Ducati Lenovo Team" } },
  { position: 3, points: 232, rider: BEZ, team: { name: "Aprilia Racing" } }
];

export const EVENTS = [
  {
    id: "event-test",
    name: "SEPANG TEST",
    short_name: "MY2",
    sponsored_name: null,
    date_start: "2026-02-03",
    date_end: "2026-02-05",
    status: "FINISHED",
    test: true,
    circuit: { id: "circ-sepang", name: "Sepang", place: "Sepang", nation: "MAL" },
    country: { iso: "MY", name: "Malaysia" }
  },
  {
    id: CAT_ID,
    name: "GRAND PRIX OF CATALONIA",
    short_name: "CAT",
    sponsored_name: null,
    date_start: "2026-05-15",
    date_end: "2026-05-17",
    status: "FINISHED",
    test: false,
    circuit: { id: "circ-cat", name: "Circuit de Barcelona-Catalunya", place: "Barcelona", nation: "SPA" },
    country: { iso: "ES", name: "Spain" }
  },
  {
    id: ARAGON_ID,
    name: "GRAND PRIX OF ARAGON",
    short_name: "ARA",
    sponsored_name: "MICHELIN GRAND PRIX OF ARAGON",
    date_start: "2026-08-28",
    date_end: "2026-08-30",
    status: "FINISHED",
    test: false,
    circuit: { id: "circ-aragon", name: "MotorLand Aragon", place: "Alcaniz", nation: "SPA" },
    country: { iso: "ES", name: "Spain" }
  },
  {
    id: MISANO_ID,
    name: "GRAND PRIX OF SAN MARINO",
    short_name: "RSM",
    sponsored_name: null,
    date_start: "2026-09-11",
    date_end: "2026-09-13",
    status: "UPCOMING",
    test: false,
    circuit: { id: "circ-misano", name: "Misano World Circuit", place: "Misano", nation: "ITA" },
    country: { iso: "IT", name: "Italy" }
  }
];

/**
 * Catalonia 2026: the Grand Prix was red-flagged and restarted. The abandoned
 * run awarded nothing; the restart carried the full points set.
 */
export const CAT_ABANDONED_CLASSIFICATION = [
  entry("c1", ACOSTA, 1, 0),
  entry("c2", MARTIN, 2, 0),
  entry("c3", BEZ, 3, 0)
];

export const CAT_RESTART_CLASSIFICATION = [
  entry("c4", BEZ, 1, 25),
  entry("c5", BAGNAIA, 2, 20),
  entry("c6", MARC, 3, 16)
];

export const SESSIONS: Record<string, unknown[]> = {
  [ARAGON_ID]: [
    { id: "ses-ara-fp1", type: "FP", number: 1, date: "2026-08-28T10:45:00+00:00", status: "FINISHED", condition: { track: "Dry" } },
    { id: "ses-ara-q1", type: "Q", number: 1, date: "2026-08-29T10:50:00+00:00", status: "FINISHED", condition: { track: "Dry" } },
    { id: ARAGON_SPR, type: "SPR", number: null, date: "2026-08-29T15:00:00+00:00", status: "FINISHED", condition: { track: "Dry" } },
    { id: ARAGON_RAC, type: "RAC", number: null, date: "2026-08-30T14:00:00+00:00", status: "FINISHED", condition: { track: "Dry" } }
  ],
  [CAT_ID]: [
    { id: "ses-cat-spr", type: "SPR", number: null, date: "2026-05-16T15:00:00+00:00", status: "FINISHED", condition: { track: "Dry" } },
    { id: CAT_RAC_ABANDONED, type: "RAC", number: null, date: "2026-05-17T14:00:00+00:00", status: "FINISHED", condition: { track: "Wet" } },
    { id: CAT_RAC_RESTART, type: "RAC", number: 2, date: "2026-05-17T15:17:00+00:00", status: "FINISHED", condition: { track: "Wet" } }
  ],
  [MISANO_ID]: [
    { id: MISANO_RAC, type: "RAC", number: null, date: "2026-09-13T14:00:00+00:00", status: "UPCOMING", condition: null }
  ]
};

export interface FakeApiOptions {
  /** Corrupt the Aragon race points to exercise validation. */
  corruptRacePoints?: boolean;
}

/**
 * A fetch implementation serving the fixtures above. Routing through the real
 * MotoGpClient means the client's own URL building and unwrapping are tested too.
 */
export function fakeFetch(options: FakeApiOptions = {}) {
  const calls: string[] = [];

  const impl = async (url: string) => {
    calls.push(url);
    const respond = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

    if (url.includes("/seasons")) return respond([{ id: SEASON_ID, year: 2026, current: true }]);
    if (url.includes("/categories")) {
      return respond([
        { id: CATEGORY_ID, name: "MotoGP™", legacy_id: 3 },
        { id: "cat-moto2", name: "Moto2™", legacy_id: 2 }
      ]);
    }
    if (url.includes("/events")) return respond(EVENTS);
    if (url.includes("/sessions")) {
      const eventUuid = new URL(url).searchParams.get("eventUuid")!;
      return respond(SESSIONS[eventUuid] ?? []);
    }
    if (url.includes(`/session/${ARAGON_SPR}/classification`)) {
      return respond({ classification: ARAGON_SPRINT_CLASSIFICATION });
    }
    if (url.includes(`/session/${ARAGON_RAC}/classification`)) {
      const rows = options.corruptRacePoints
        ? ARAGON_RACE_CLASSIFICATION.map((r) => (r.position === 1 ? { ...r, points: 30 } : r))
        : ARAGON_RACE_CLASSIFICATION;
      return respond({ classification: rows });
    }
    if (url.includes(`/session/ses-cat-spr/classification`)) {
      return respond({ classification: [entry("c0", MARC, 1, 12)] });
    }
    if (url.includes(`/session/${CAT_RAC_ABANDONED}/classification`)) {
      return respond({ classification: CAT_ABANDONED_CLASSIFICATION });
    }
    if (url.includes(`/session/${CAT_RAC_RESTART}/classification`)) {
      return respond({ classification: CAT_RESTART_CLASSIFICATION });
    }
    if (url.includes("/standings")) return respond({ classification: STANDINGS });

    return { ok: false, status: 404, json: async () => ({}) };
  };

  return { impl, calls };
}
